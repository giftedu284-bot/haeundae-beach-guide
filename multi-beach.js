// Multi-beach extension v3: resilient 10m guide grids + facilities + safety data.
(() => {
  const beaches = {
    haeundae: { name: "해운대해수욕장", lat: 35.1587, lng: 129.1604, ripCode: "HAE", prefix: "HAE" },
    gwangalli: { name: "광안리해수욕장", lat: 35.1532, lng: 129.1186, ripCode: null, prefix: "GW", fallback: { length: 1350, width: 95, angle: -2 } },
    songjeong: { name: "송정해수욕장", lat: 35.1785, lng: 129.2016, ripCode: "SONGJUNG", prefix: "SJ", fallback: { length: 900, width: 105, angle: 33 } },
    songdo: { name: "송도해수욕장", lat: 35.0767, lng: 129.0178, ripCode: null, prefix: "SD", fallback: { length: 700, width: 90, angle: -18 } }
  };

  const OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
  ];
  const RIP_WORKER_URL = "https://beach-guide-rip-current-api.chopyoz1207.workers.dev";
  const GRID_SIZE = 10;
  const MAX_CELLS = 2200;
  const CACHE_MS = 24 * 60 * 60 * 1000;

  let selectedPoint = null;
  let selectedGrid = null;
  let selectedPolygon = null;
  let gridOverlays = [];
  let facilityOverlays = [];
  let facilityRecords = [];
  let facilitiesVisible = true;
  let hygieneVisible = true;
  let loadToken = 0;

  const beachKey = () => document.querySelector("#beachSelect")?.value || "haeundae";
  const beach = () => beaches[beachKey()] || beaches.haeundae;
  const isHaeundae = () => beachKey() === "haeundae";

  function mapCenter() {
    if (!window.kakaoMap) return null;
    const c = kakaoMap.getCenter();
    return { lat: c.getLat(), lng: c.getLng() };
  }

  function activePoint() {
    return selectedPoint || mapCenter() || { lat: beach().lat, lng: beach().lng };
  }

  function fmt(point) {
    return point ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` : "위치 확인 중";
  }

  function note(container, cls) {
    if (!container) return null;
    let el = container.querySelector(`.${cls}`);
    if (!el) {
      el = document.createElement("p");
      el.className = cls;
      el.style.cssText = "margin:10px 0 0;padding:10px 12px;border-radius:10px;background:#fff;color:#60787e;font-size:11px;line-height:1.5";
      container.prepend(el);
    }
    return el;
  }

  function clearGrid() {
    gridOverlays.forEach((o) => o.setMap(null));
    gridOverlays = [];
    selectedPolygon = null;
    selectedGrid = null;
  }

  function clearFacilities() {
    facilityOverlays.forEach((o) => o.setMap(null));
    facilityOverlays = [];
    facilityRecords = [];
  }

  async function queryOverpass(query) {
    let lastError;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
          headers: { Accept: "application/json" }, signal: controller.signal
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data && Array.isArray(data.elements)) return data;
        throw new Error("invalid response");
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error("all overpass endpoints failed");
  }

  function distanceSq(a, b) {
    const dy = (a.lat - b.lat) * 111320;
    const dx = (a.lng - b.lng) * 111320 * Math.cos(a.lat * Math.PI / 180);
    return dx * dx + dy * dy;
  }

  function elementPoint(el) {
    if (Number.isFinite(el.lat) && Number.isFinite(el.lon)) return { lat: el.lat, lng: el.lon };
    if (el.center) return { lat: el.center.lat, lng: el.center.lon };
    if (Array.isArray(el.geometry) && el.geometry.length) {
      const s = el.geometry.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lon }), { lat: 0, lng: 0 });
      return { lat: s.lat / el.geometry.length, lng: s.lng / el.geometry.length };
    }
    return null;
  }

  function chooseBeachWay(elements, current) {
    const ways = elements.filter((e) => e.type === "way" && Array.isArray(e.geometry) && e.geometry.length >= 4);
    if (!ways.length) return null;
    const needle = current.name.replace("해수욕장", "");
    return ways.map((way) => {
      const name = way.tags?.name || way.tags?.["name:ko"] || "";
      return { way, score: distanceSq(elementPoint(way) || current, current) + (name.includes(needle) ? -1e12 : 0) };
    }).sort((a, b) => a.score - b.score)[0].way;
  }

  function cacheKey(current) { return `beachBoundary:${current.prefix}:v3`; }
  function readCache(current) {
    try {
      const c = JSON.parse(localStorage.getItem(cacheKey(current)) || "null");
      return c && Date.now() - c.savedAt < CACHE_MS && Array.isArray(c.boundary) ? c : null;
    } catch { return null; }
  }
  function writeCache(current, boundary, source) {
    try { localStorage.setItem(cacheKey(current), JSON.stringify({ savedAt: Date.now(), boundary, source })); } catch {}
  }

  function fallbackBoundary(current) {
    const cfg = current.fallback;
    if (!cfg) return null;
    const theta = cfg.angle * Math.PI / 180;
    const ux = Math.cos(theta), uy = Math.sin(theta);
    const vx = -uy, vy = ux;
    const halfL = cfg.length / 2, halfW = cfg.width / 2;
    const metresPerLat = 111320;
    const metresPerLng = 111320 * Math.cos(current.lat * Math.PI / 180);
    const local = [
      { x: -halfL, y: -halfW }, { x: halfL, y: -halfW },
      { x: halfL, y: halfW }, { x: -halfL, y: halfW }
    ];
    return local.map((p) => {
      const east = p.x * ux + p.y * vx;
      const north = p.x * uy + p.y * vy;
      return { lat: current.lat + north / metresPerLat, lng: current.lng + east / metresPerLng };
    });
  }

  async function getBoundary(current) {
    const cached = readCache(current);
    if (cached) return { boundary: cached.boundary, source: cached.source, fallback: false };
    try {
      const query = `[out:json][timeout:18];way(around:2200,${current.lat},${current.lng})["natural"="beach"];out geom tags;`;
      const data = await queryOverpass(query);
      const way = chooseBeachWay(data.elements, current);
      if (!way) throw new Error("beach polygon not found");
      const boundary = way.geometry.map((p) => ({ lat: p.lat, lng: p.lon }));
      const source = way.tags?.name || way.tags?.["name:ko"] || current.name;
      writeCache(current, boundary, source);
      return { boundary, source, fallback: false };
    } catch {
      const boundary = fallbackBoundary(current);
      if (!boundary) throw new Error("no boundary fallback");
      return { boundary, source: `${current.name} 임시 안내 경계`, fallback: true };
    }
  }

  function projection(origin) {
    const mLat = 111320, mLng = 111320 * Math.cos(origin.lat * Math.PI / 180);
    return {
      toLocal: (p) => ({ x: (p.lng - origin.lng) * mLng, y: (p.lat - origin.lat) * mLat }),
      toGeo: (p) => ({ lat: origin.lat + p.y / mLat, lng: origin.lng + p.x / mLng })
    };
  }

  function inside(p, poly) {
    let yes = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) yes = !yes;
    }
    return yes;
  }

  function axes(points) {
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    let xx = 0, yy = 0, xy = 0;
    points.forEach((p) => { const dx = p.x - cx, dy = p.y - cy; xx += dx * dx; yy += dy * dy; xy += dx * dy; });
    const a = 0.5 * Math.atan2(2 * xy, xx - yy);
    let u = { x: Math.cos(a), y: Math.sin(a) };
    if (u.x < 0) u = { x: -u.x, y: -u.y };
    return { c: { x: cx, y: cy }, u, v: { x: -u.y, y: u.x } };
  }

  function toFrame(p, a) {
    const dx = p.x - a.c.x, dy = p.y - a.c.y;
    return { x: dx * a.u.x + dy * a.u.y, y: dx * a.v.x + dy * a.v.y };
  }
  function fromFrame(p, a) {
    return { x: a.c.x + p.x * a.u.x + p.y * a.v.x, y: a.c.y + p.x * a.u.y + p.y * a.v.y };
  }
  function alpha(i) {
    let n = i + 1, out = "";
    while (n > 0) { n--; out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26); }
    return out;
  }
  function gridId(current, row, col) { return `${current.prefix}-${alpha(row)}${String(col + 1).padStart(2, "0")}`; }

  function selectCell(id, polygon, centre) {
    if (selectedPolygon) selectedPolygon.setOptions({ fillOpacity: .05, strokeColor: "#237a8b", strokeWeight: 1 });
    selectedPolygon = polygon;
    polygon.setOptions({ fillOpacity: .52, fillColor: "#f6b73c", strokeColor: "#c85f00", strokeWeight: 2 });
    selectedGrid = id;
    selectedPoint = centre;
    updateLocationUI();
    setNotice(`${beach().name} ${id} 10m 안내격자를 선택했어요.`);
  }

  async function loadGrid(token) {
    clearGrid();
    if (isHaeundae() || !window.kakaoMap) return;
    const current = beach();
    setNotice(`${current.name}의 10m 안내격자를 준비하고 있어요.`);
    try {
      const result = await getBoundary(current);
      if (token !== loadToken || isHaeundae()) return;
      const boundary = result.boundary;
      const origin = boundary.reduce((a, p) => ({ lat: a.lat + p.lat / boundary.length, lng: a.lng + p.lng / boundary.length }), { lat: 0, lng: 0 });
      const proj = projection(origin);
      const local = boundary.map(proj.toLocal);
      const ax = axes(local);
      const framed = local.map((p) => toFrame(p, ax));
      const minX = Math.floor(Math.min(...framed.map((p) => p.x)) / GRID_SIZE) * GRID_SIZE;
      const maxX = Math.ceil(Math.max(...framed.map((p) => p.x)) / GRID_SIZE) * GRID_SIZE;
      const minY = Math.floor(Math.min(...framed.map((p) => p.y)) / GRID_SIZE) * GRID_SIZE;
      const maxY = Math.ceil(Math.max(...framed.map((p) => p.y)) / GRID_SIZE) * GRID_SIZE;
      let count = 0, row = 0;
      for (let y = minY; y < maxY && count < MAX_CELLS; y += GRID_SIZE, row++) {
        let col = 0;
        for (let x = minX; x < maxX && count < MAX_CELLS; x += GRID_SIZE, col++) {
          const centreFrame = { x: x + 5, y: y + 5 };
          if (!inside(centreFrame, framed)) continue;
          const corners = [{x,y},{x:x+10,y},{x:x+10,y:y+10},{x,y:y+10}].map((p) => proj.toGeo(fromFrame(p, ax)));
          const centre = proj.toGeo(fromFrame(centreFrame, ax));
          const id = gridId(current, row, col);
          const polygon = new window.kakao.maps.Polygon({ map:kakaoMap, path:corners.map((p)=>new window.kakao.maps.LatLng(p.lat,p.lng)), strokeWeight:1, strokeColor:"#237a8b", strokeOpacity:.72, fillColor:"#70d1d2", fillOpacity:.05 });
          window.kakao.maps.event.addListener(polygon, "click", () => selectCell(id, polygon, centre));
          gridOverlays.push(polygon); count++;
        }
      }
      updateGridNote(count, result.fallback);
      setNotice(`${current.name}에 ${count.toLocaleString()}개의 10m 안내격자를 표시했어요.${result.fallback ? " 공개 지도 서버가 응답하지 않아 임시 안내 경계를 사용했습니다." : ""}`);
    } catch {
      updateGridNote(0, true, true);
      setNotice(`${current.name}의 10m 안내격자를 만들지 못했어요.`);
    }
  }

  function updateGridNote(count, fallback = false, failed = false) {
    const el = note(document.querySelector(".location-card"), "multi-beach-grid-note");
    if (!el) return;
    if (isHaeundae()) { el.hidden = true; return; }
    el.hidden = false;
    if (failed) { el.textContent = "10m 안내격자를 표시하지 못했습니다. 잠시 후 다시 선택해 주세요."; return; }
    el.textContent = fallback
      ? `${beach().prefix} 10m 안내격자 ${count.toLocaleString()}개를 임시 안내 경계에 표시했습니다. 외부 공개 지도 서버가 불안정할 때 사용하는 보조 경계이며 공식 측량 주소는 아닙니다.`
      : `${beach().prefix} 10m 안내격자 ${count.toLocaleString()}개를 공개 지도 해변 경계와 해변 방향에 맞춰 표시했습니다. 공식 측량 주소는 아닙니다.`;
  }

  function facilityKind(tags={}) {
    if (tags.amenity === "toilets") return { group:"hygiene", icon:"🚻", title:"화장실" };
    if (tags.amenity === "shower" || tags.shower === "yes") return { group:"hygiene", icon:"🚿", title:"샤워 시설" };
    if (tags.amenity === "parking") return { group:"access", icon:"🅿", title:"주차장" };
    if (tags.wheelchair === "yes") return { group:"access", icon:"♿", title:"휠체어 접근 가능 시설" };
    return null;
  }

  function renderFacilities() {
    facilityOverlays.forEach((o)=>o.setMap(null)); facilityOverlays=[];
    if (isHaeundae() || !window.kakaoMap) return;
    facilityRecords.forEach((r)=>{
      if ((r.group === "access" && !facilitiesVisible) || (r.group === "hygiene" && !hygieneVisible)) return;
      const btn=document.createElement("button"); btn.type="button"; btn.className="map-facility-label"; btn.textContent=r.icon; btn.setAttribute("aria-label",r.title);
      btn.addEventListener("click",()=>{setNotice(`${r.title}: ${r.detail}`); const d=document.querySelector("#facilityGuideDetail"); if(d)d.innerHTML=`<strong>${r.title}</strong><p>${r.detail}</p>`;});
      facilityOverlays.push(new window.kakao.maps.CustomOverlay({map:kakaoMap,position:new window.kakao.maps.LatLng(r.point.lat,r.point.lng),yAnchor:1,content:btn}));
    });
  }

  async function loadFacilities(token) {
    clearFacilities(); if (isHaeundae()) return;
    const current=beach();
    const q=`[out:json][timeout:14];(nwr(around:1300,${current.lat},${current.lng})["amenity"="toilets"];nwr(around:1300,${current.lat},${current.lng})["amenity"="shower"];nwr(around:1300,${current.lat},${current.lng})["amenity"="parking"];nwr(around:900,${current.lat},${current.lng})["wheelchair"="yes"];);out center tags;`;
    try {
      const data=await queryOverpass(q); if(token!==loadToken||isHaeundae())return;
      const seen=new Set();
      facilityRecords=data.elements.map((el)=>{const p=elementPoint(el),k=facilityKind(el.tags||{}); if(!p||!k)return null; const id=`${k.title}:${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`; if(seen.has(id))return null; seen.add(id); const name=el.tags?.name||el.tags?.["name:ko"]||k.title; return {point:p,...k,title:name,detail:`${name} · OpenStreetMap 공개 지도 좌표 · 운영 여부는 현장 확인 필요`,dist:distanceSq(p,current)};}).filter(Boolean).sort((a,b)=>a.dist-b.dist).slice(0,40);
      renderFacilities(); updateFacilityNote(false);
    } catch { facilityRecords=[]; updateFacilityNote(true); }
  }

  function updateFacilityNote(failed=false) {
    const el=note(document.querySelector(".facility-group"),"multi-beach-facility-note"); if(!el)return;
    if(isHaeundae()){el.hidden=true;return;} el.hidden=false;
    el.textContent=failed?`${beach().name} 주변 공개 지도 시설을 불러오지 못했습니다. 격자·GPS 기능은 계속 사용할 수 있습니다.`:`${beach().name} 주변 공개 지도 시설 ${facilityRecords.length}곳을 표시합니다. 운영 여부는 현장 확인이 필요합니다.`;
  }

  function applyWeatherOnlySafety() {
    if(isHaeundae()||beach().ripCode)return;
    const num=(s)=>{const v=parseFloat(document.querySelector(s)?.textContent||"");return Number.isFinite(v)?v:null;};
    const temp=num("#weatherTemp"),rain=num("#weatherRain"),wind=num("#weatherWind"),desc=document.querySelector("#weatherDesc")?.textContent||"";
    const light=document.querySelector("#safetyIndexLight"),label=document.querySelector("#safetyIndexLabel"),reason=document.querySelector("#safetyIndexReason"),summary=document.querySelector("#conditionSummary"),rip=document.querySelector("#conditionRip");
    if(!light||!label||!reason||!summary||!rip)return;
    rip.innerHTML="<b>이안류</b> · 공식 이안류 지수 제공 대상이 아닌 해변입니다.";
    if([temp,rain,wind].some((v)=>v===null)){light.textContent="⚪";label.textContent="기상 확인 중";return;}
    const severe=/뇌우|강한 비|강한 소나기|우박/.test(desc)||wind>=35||rain>=10, caution=wind>=20||rain>=2||temp>=34;
    if(severe){light.textContent="🔴";label.textContent="기상 위험";reason.textContent="강한 비·바람 등 기상 위험요소가 감지됐어요.";summary.textContent="현재 기상 조건만으로도 물놀이를 권하기 어려워요. 현장 안전요원 안내를 우선하세요.";}
    else if(caution){light.textContent="🟡";label.textContent="기상 주의";reason.textContent="바람·강수 또는 더위에 주의가 필요해요.";summary.textContent="현재 날씨에는 주의가 필요한 요소가 있어요. 무리한 물놀이는 피하세요.";}
    else{light.textContent="🟢";label.textContent="기상 양호";reason.textContent="현재 기상 조건은 비교적 안정적입니다.";summary.textContent="현재 기상 조건은 비교적 무난해요. 현장 파도와 안전요원 안내를 함께 확인하세요.";}
  }

  async function loadRip(token) {
    if(isHaeundae())return;
    const current=beach(), card=document.querySelector(".rip-current-card"), condition=document.querySelector("#conditionRip");
    if(!current.ripCode){if(card)card.hidden=true; window.latestRipCurrentLevel="확인불가"; applyWeatherOnlySafety(); return;}
    if(card)card.hidden=false; window.latestRipCurrentLevel=null;
    const h=document.querySelector(".rip-current-card h3"); if(h)h.textContent=`${current.name} 이안류 위험 정보`;
    try{
      const response=await fetch(`${RIP_WORKER_URL}/rip-current?beachCode=${encodeURIComponent(current.ripCode)}`); if(!response.ok)throw new Error();
      const data=await response.json(); if(token!==loadToken||beachKey()!=="songjeong")return;
      const items=Array.isArray(data.items)?data.items:[]; if(!items.length)throw new Error();
      const now=new Date(); const sorted=items.map((item)=>({item,time:window.ripTimestamp(item)})).filter((x)=>x.time).sort((a,b)=>a.time-b.time); const past=sorted.filter((x)=>x.time<=now); const latest=(past.length?past[past.length-1]:sorted[sorted.length-1])||{item:items[items.length-1],time:null};
      const normalized=String(latest.item?.lastScrCn||"관심").trim()||"관심"; window.latestRipCurrentLevel=normalized; const display=window.ripLevelDisplay(normalized);
      document.querySelector("#ripCurrentLight").textContent=display.icon; document.querySelector("#ripCurrentLevel").textContent=`${display.label} · ${current.name} 이안류 지수`; document.querySelector("#ripCurrentStatus").textContent=display.message; document.querySelector("#ripCurrentWindow").textContent=window.describeRiskWindow(items); document.querySelector("#ripCurrentTime").textContent=latest.time?window.formatRipTime(latest.time):"–"; document.querySelector("#ripCurrentScore").textContent=latest.item?.lastScr??"–"; document.querySelector("#ripCurrentWave").textContent=latest.item?.wvhgt!=null?`${latest.item.wvhgt} m`:"–"; document.querySelector("#ripCurrentWind").textContent=latest.item?.wspd!=null?`${latest.item.wspd} m/s`:"–"; if(condition)condition.innerHTML=`<b>이안류</b> · 현재 공식 지수는 ${normalized} 단계입니다.`;
      window.updateSafetyIndexFromWeather(); window.updateConditionAnalysis();
    }catch{if(token!==loadToken)return;window.latestRipCurrentLevel="확인불가";document.querySelector("#ripCurrentLight").textContent="⚠️";document.querySelector("#ripCurrentLevel").textContent="공식 정보 확인 필요";document.querySelector("#ripCurrentStatus").textContent="송정 이안류 공식 정보를 불러오지 못했어요.";window.updateSafetyIndexFromWeather();window.updateConditionAnalysis();}
  }

  function updateLocationUI() {
    if(isHaeundae())return;
    const current=beach(), point=activePoint(), id=selectedGrid||"지도 위치";
    const selected=document.querySelector("#selectedAddress"), panel=document.querySelector("#panelAddress");
    if(selected)selected.innerHTML=`${id} <em>${current.name}</em>`;
    if(panel)panel.innerHTML=`${id} <small>· 10m 안내격자</small>`;
    const desc=document.querySelector(".location-card p"); if(desc)desc.textContent=`${current.name} · ${fmt(point)}`;
  }

  function syncUI() {
    const current=beach(), other=!isHaeundae();
    document.title=`해변가이드 | ${current.name} 안전 지도`;
    const h=document.querySelector(".panel-head h2"); if(h)h.textContent=`${current.name} 안전 안내`;
    const lead=document.querySelector(".panel-head > p:not(.tag)"); if(lead)lead.textContent=other?"10m 안내격자, GPS, 날씨, 시설과 해양안전 정보를 확인하세요.":"만남 위치, 내 위치, 접근성 시설을 지도에서 바로 확인하세요.";
    const locate=document.querySelector("#locateMe"); if(locate&&!locate.disabled)locate.innerHTML=other?"내 현재 위치 지도에서 확인 <span>⌖</span>":"내 위치로 격자 찾기 <span>⌖</span>";
    const copy=document.querySelector("#copyAddress"); if(copy)copy.textContent=other?"격자 위치 복사":"주소 복사";
    updateFacilityNote(); updateLocationUI(); if(other&&!current.ripCode)applyWeatherOnlySafety();
  }

  function handleLocate(event) {
    if(isHaeundae())return; event.preventDefault(); event.stopImmediatePropagation(); const btn=event.currentTarget;
    if(!navigator.geolocation){setNotice("이 기기에서는 GPS 위치 기능을 사용할 수 없어요.");return;} btn.disabled=true;btn.textContent="현재 위치를 확인하고 있어요…";
    navigator.geolocation.getCurrentPosition(({coords})=>{selectedPoint={lat:coords.latitude,lng:coords.longitude};const pos=new window.kakao.maps.LatLng(selectedPoint.lat,selectedPoint.lng);if(window.myLocationMarker)myLocationMarker.setMap(null);window.myLocationMarker=new window.kakao.maps.Marker({map:kakaoMap,position:pos,title:"내 현재 위치"});kakaoMap.panTo(pos);btn.disabled=false;updateLocationUI();setNotice(`${beach().name} 주변에서 현재 GPS 위치를 표시했어요.`);},()=>{btn.disabled=false;btn.innerHTML="내 현재 위치 지도에서 확인 <span>⌖</span>";setNotice("위치 권한을 허용해 주세요.");},{enableHighAccuracy:true,timeout:10000,maximumAge:0});
  }

  async function handleShare(event) {
    if(isHaeundae())return; event.preventDefault();event.stopImmediatePropagation();const current=beach(),point=activePoint(),id=selectedGrid||"지도 위치";const message=`${current.name} 만남 위치: ${id} · ${fmt(point)}\n${location.href}`;const result=document.querySelector("#shareResult");
    try{if(navigator.share)await navigator.share({title:`${current.name} 만남 위치`,text:message,url:location.href});else await navigator.clipboard.writeText(message);if(result){result.hidden=false;result.textContent=navigator.share?"공유 창을 열었어요.":"격자와 위치를 복사했어요.";}}catch(e){if(e.name!=="AbortError"&&result){result.hidden=false;result.textContent="공유하지 못했어요.";}}
  }

  async function handleCopy(event) {
    if(isHaeundae())return;event.preventDefault();event.stopImmediatePropagation();const text=`${beach().name} ${selectedGrid||"지도 위치"} ${fmt(activePoint())}`;try{await navigator.clipboard.writeText(text);setNotice("격자 위치를 복사했어요.");}catch{setNotice(text);}
  }

  function handleFacilityToggle(event,hygiene){if(isHaeundae())return;event.preventDefault();event.stopImmediatePropagation();if(hygiene)hygieneVisible=!hygieneVisible;else facilitiesVisible=!facilitiesVisible;renderFacilities();}

  async function onBeachChange() {
    const token=++loadToken;clearGrid();clearFacilities();selectedPoint=null;selectedGrid=null;
    setTimeout(async()=>{if(token!==loadToken)return;selectedPoint=mapCenter();syncUI();if(isHaeundae())return;await Promise.allSettled([loadGrid(token),loadFacilities(token),loadRip(token)]);if(token===loadToken)syncUI();},80);
  }

  function init() {
    document.querySelector("#beachSelect")?.addEventListener("change",onBeachChange);
    document.querySelector("#locateMe")?.addEventListener("click",handleLocate,true);
    document.querySelector("#shareMeeting")?.addEventListener("click",handleShare,true);
    document.querySelector("#copyAddress")?.addEventListener("click",handleCopy,true);
    document.querySelector("#toggleFacilities")?.addEventListener("click",(e)=>handleFacilityToggle(e,false),true);
    document.querySelector("#toggleHygieneFacilities")?.addEventListener("click",(e)=>handleFacilityToggle(e,true),true);
    if(window.kakaoMap&&window.kakao?.maps)window.kakao.maps.event.addListener(kakaoMap,"click",(e)=>{if(isHaeundae())return;selectedPoint={lat:e.latLng.getLat(),lng:e.latLng.getLng()};selectedGrid=null;updateLocationUI();setNotice(`${beach().name}에서 위치를 선택했어요: ${fmt(selectedPoint)}`);});
    const observer=new MutationObserver(()=>{if(!isHaeundae()&&!beach().ripCode)queueMicrotask(applyWeatherOnlySafety);});["#weatherTemp","#weatherRain","#weatherWind","#weatherDesc"].forEach((s)=>{const n=document.querySelector(s);if(n)observer.observe(n,{childList:true,subtree:true,characterData:true});});
    syncUI();
  }

  if(document.readyState==="complete")init();else window.addEventListener("load",init,{once:true});
})();