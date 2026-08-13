// Multi-beach compatibility layer v4.
// Haeundae keeps its verified grid from script.js. Gwangalli, Songjeong and
// Songdo use deterministic 10m guide grids so they do not depend on an external
// boundary server being available at the moment the user selects a beach.
(() => {
  const BEACH = {
    haeundae: { name: "해운대해수욕장", prefix: "HD", lat: 35.1587, lng: 129.1604, ripCode: "HAE" },
    gwangalli: { name: "광안리해수욕장", prefix: "GW", lat: 35.1532, lng: 129.1186, length: 1380, width: 105, angle: -2, ripCode: null },
    songjeong: { name: "송정해수욕장", prefix: "SJ", lat: 35.1785, lng: 129.2016, length: 980, width: 115, angle: 33, ripCode: "SONGJUNG" },
    songdo: { name: "송도해수욕장", prefix: "SD", lat: 35.0767, lng: 129.0178, length: 760, width: 100, angle: -18, ripCode: null }
  };
  const RIP_WORKER = "https://beach-guide-rip-current-api.chopyoz1207.workers.dev";
  const GRID = 10;
  let cells = [];
  let selectedCell = null;
  let selectedGridId = null;
  let selectedPoint = null;
  let ignoreMapClickUntil = 0;
  let facilityOverlays = [];
  let facilityRecords = [];
  let loadVersion = 0;

  const beachKey = () => document.querySelector("#beachSelect")?.value || "haeundae";
  const current = () => BEACH[beachKey()] || BEACH.haeundae;
  const isHaeundae = () => beachKey() === "haeundae";

  function alpha(index) {
    let n = index + 1;
    let label = "";
    while (n > 0) {
      n--;
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = Math.floor(n / 26);
    }
    return label;
  }

  function normalizeDisplayId(text, prefix) {
    const raw = String(text || "").replace(/구역/g, "").trim();
    const already = raw.match(/^(HD|GW|SJ|SD)-([A-Z]+)0*(\d+)$/i);
    if (already) return `${already[1].toUpperCase()}-${already[2].toUpperCase()}${Number(already[3])}`;
    const hae = raw.match(/^([A-Z]+)(\d+)$/i);
    if (hae) return `${prefix}-${hae[1].toUpperCase()}${Number(hae[2])}`;
    const old = raw.match(/^(\d+)-([A-Z]+)$/i);
    if (old) return `${prefix}-${old[2].toUpperCase()}${Number(old[1])}`;
    return raw;
  }

  function clearCells() {
    cells.forEach((polygon) => polygon.setMap(null));
    cells = [];
    selectedCell = null;
    selectedGridId = null;
  }

  function clearFacilities() {
    facilityOverlays.forEach((overlay) => overlay.setMap(null));
    facilityOverlays = [];
    facilityRecords = [];
  }

  function localToGeo(cfg, along, across) {
    const angle = cfg.angle * Math.PI / 180;
    const east = along * Math.cos(angle) - across * Math.sin(angle);
    const north = along * Math.sin(angle) + across * Math.cos(angle);
    const mLat = 111320;
    const mLng = 111320 * Math.cos(cfg.lat * Math.PI / 180);
    return { lat: cfg.lat + north / mLat, lng: cfg.lng + east / mLng };
  }

  function displaySelection(id, point) {
    const cfg = current();
    const selected = document.querySelector("#selectedAddress");
    const panel = document.querySelector("#panelAddress");
    const desc = document.querySelector(".location-card p");
    const caption = document.querySelector(".location-card span");
    if (selected) selected.innerHTML = `${id} <em>구역</em>`;
    if (panel) panel.innerHTML = `${id} 구역 <small>· 10m × 10m</small>`;
    if (desc) desc.textContent = `${cfg.name} 모래사장`;
    if (caption) caption.textContent = "내가 선택한 장소";
    const reportAddress = document.querySelector("#reportAddress");
    if (reportAddress) reportAddress.textContent = `${id} 구역`;
    if (point && document.querySelector("#mapNotice")) {
      document.querySelector("#mapNotice").textContent = `${cfg.name} ${id} 구역을 선택했어요. 만남 위치나 마지막 발견 위치로 공유할 수 있어요.`;
    }
  }

  function selectOtherCell(id, polygon, point) {
    ignoreMapClickUntil = Date.now() + 350;
    if (selectedCell) selectedCell.setOptions({ fillOpacity: 0.06, strokeColor: "#237a8b", strokeWeight: 1 });
    selectedCell = polygon;
    selectedCell.setOptions({ fillOpacity: 0.52, fillColor: "#f6b73c", strokeColor: "#d76b00", strokeWeight: 2 });
    selectedGridId = id;
    selectedPoint = point;
    displaySelection(id, point);
  }

  function drawOtherGrid() {
    clearCells();
    if (isHaeundae() || !window.kakaoMap || !window.kakao?.maps) return;
    const cfg = current();
    const columns = Math.max(1, Math.round(cfg.length / GRID));
    const rows = Math.max(1, Math.round(cfg.width / GRID));
    const startAlong = -columns * GRID / 2;
    const startAcross = -rows * GRID / 2;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const a0 = startAlong + col * GRID;
        const a1 = a0 + GRID;
        const c0 = startAcross + row * GRID;
        const c1 = c0 + GRID;
        const corners = [localToGeo(cfg,a0,c0),localToGeo(cfg,a1,c0),localToGeo(cfg,a1,c1),localToGeo(cfg,a0,c1)];
        const centre = localToGeo(cfg,(a0+a1)/2,(c0+c1)/2);
        const id = `${cfg.prefix}-${alpha(row)}${col + 1}`;
        const polygon = new window.kakao.maps.Polygon({
          map: kakaoMap,
          path: corners.map((p) => new window.kakao.maps.LatLng(p.lat,p.lng)),
          strokeWeight: 1,
          strokeColor: "#237a8b",
          strokeOpacity: 0.72,
          fillColor: "#70d1d2",
          fillOpacity: 0.06
        });
        window.kakao.maps.event.addListener(polygon,"click",()=>selectOtherCell(id,polygon,centre));
        cells.push(polygon);
      }
    }
    const note = ensureGridNote();
    if (note) note.textContent = `${cfg.prefix} 체계의 10m 안내격자 ${cells.length.toLocaleString()}개를 표시했습니다. 공식 측량 주소가 아닌 만남·수색 보조용 안내격자입니다.`;
    if (document.querySelector("#mapNotice")) document.querySelector("#mapNotice").textContent = `${cfg.name}에 10m 안내격자를 표시했어요. 격자를 누르면 ${cfg.prefix}-A1 형식으로 위치가 표시됩니다.`;
  }

  function ensureGridNote() {
    const card = document.querySelector(".location-card");
    if (!card) return null;
    let note = card.querySelector(".multi-beach-grid-note");
    if (!note) {
      note = document.createElement("p");
      note.className = "multi-beach-grid-note";
      note.style.cssText = "margin:10px 0 0;padding:9px 10px;border-radius:9px;background:#f4fafb;color:#60787e;font-size:10px;line-height:1.5";
      card.appendChild(note);
    }
    note.hidden = isHaeundae();
    return note;
  }

  function repairHaeundaeDisplay() {
    if (!isHaeundae()) return;
    const selected = document.querySelector("#selectedAddress");
    const panel = document.querySelector("#panelAddress");
    const desc = document.querySelector(".location-card p");
    const caption = document.querySelector(".location-card span");
    if (desc) desc.textContent = "해운대해수욕장 모래사장";
    if (caption) caption.textContent = "내가 선택한 장소";
    const raw = selected?.textContent?.trim() || panel?.textContent?.trim() || "";
    const id = normalizeDisplayId(raw, "HD");
    if (id && id !== "지도 위치" && /^HD-/.test(id)) {
      if (selected && !selected.textContent.trim().startsWith("HD-")) selected.innerHTML = `${id} <em>구역</em>`;
      if (panel && !panel.textContent.trim().startsWith("HD-")) panel.innerHTML = `${id} 구역 <small>· 10m × 10m</small>`;
      const reportAddress = document.querySelector("#reportAddress");
      if (reportAddress) reportAddress.textContent = `${id} 구역`;
    }
    ensureGridNote();
  }

  function resetBeachUI() {
    const cfg = current();
    document.title = `해변가이드 | ${cfg.name} 안전 지도`;
    const title = document.querySelector(".panel-head h2");
    if (title) title.textContent = `${cfg.name} 안전 안내`;
    const desc = document.querySelector(".location-card p");
    if (desc) desc.textContent = `${cfg.name} 모래사장`;
    const caption = document.querySelector(".location-card span");
    if (caption) caption.textContent = "내가 선택한 장소";
    if (isHaeundae()) {
      repairHaeundaeDisplay();
    } else {
      const selected = document.querySelector("#selectedAddress");
      const panel = document.querySelector("#panelAddress");
      if (selected) selected.innerHTML = `격자를 선택하세요 <em>${cfg.name}</em>`;
      if (panel) panel.innerHTML = `격자를 선택하세요 <small>· 10m × 10m</small>`;
    }
  }

  function fmt(point) { return `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`; }

  async function copyOther(event) {
    if (isHaeundae()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const cfg = current();
    const id = selectedGridId || "지도 위치";
    const p = selectedPoint || {lat:cfg.lat,lng:cfg.lng};
    const text = `${cfg.name} ${id} ${fmt(p)}`;
    try { await navigator.clipboard.writeText(text); setNotice(`${id} 위치를 복사했어요.`); }
    catch { setNotice(text); }
  }

  async function shareOther(event) {
    if (isHaeundae()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const cfg = current();
    const id = selectedGridId || "지도 위치";
    const p = selectedPoint || {lat:cfg.lat,lng:cfg.lng};
    const text = `${cfg.name} 만남 위치: ${id} · ${fmt(p)}`;
    try {
      if (navigator.share) await navigator.share({title:`${cfg.name} 만남 위치`,text,url:location.href});
      else await navigator.clipboard.writeText(`${text}\n${location.href}`);
      const result=document.querySelector("#shareResult");
      if(result){result.hidden=false;result.textContent=navigator.share?"공유 창을 열었어요.":`${id} 위치를 복사했어요.`;}
    } catch(e) { if(e.name!=="AbortError") setNotice("공유하지 못했어요. 다시 시도해 주세요."); }
  }

  function locateOther(event) {
    if (isHaeundae()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const button=event.currentTarget;
    if(!navigator.geolocation){setNotice("이 기기에서는 GPS를 사용할 수 없어요.");return;}
    button.disabled=true;button.textContent="현재 위치를 확인하고 있어요…";
    navigator.geolocation.getCurrentPosition(({coords})=>{
      selectedPoint={lat:coords.latitude,lng:coords.longitude};
      const pos=new window.kakao.maps.LatLng(selectedPoint.lat,selectedPoint.lng);
      if(window.myLocationMarker)myLocationMarker.setMap(null);
      window.myLocationMarker=new window.kakao.maps.Marker({map:kakaoMap,position:pos,title:"내 현재 위치"});
      kakaoMap.panTo(pos);button.disabled=false;button.innerHTML="내 현재 위치 지도에서 확인 <span>⌖</span>";
      setNotice(`${current().name} 주변에서 현재 GPS 위치를 표시했어요.`);
    },()=>{button.disabled=false;button.innerHTML="내 현재 위치 지도에서 확인 <span>⌖</span>";setNotice("위치 권한을 허용해 주세요.");},{enableHighAccuracy:true,timeout:10000,maximumAge:0});
  }

  async function queryFacilities(version) {
    clearFacilities();
    if(isHaeundae()) return;
    const cfg=current();
    const query=`[out:json][timeout:12];(nwr(around:1200,${cfg.lat},${cfg.lng})["amenity"="toilets"];nwr(around:1200,${cfg.lat},${cfg.lng})["amenity"="shower"];nwr(around:1200,${cfg.lat},${cfg.lng})["amenity"="parking"];);out center tags;`;
    const endpoints=["https://overpass-api.de/api/interpreter","https://overpass.private.coffee/api/interpreter"];
    let data=null;
    for(const endpoint of endpoints){try{const r=await fetch(`${endpoint}?data=${encodeURIComponent(query)}`);if(r.ok){data=await r.json();break;}}catch{}}
    if(!data||version!==loadVersion||isHaeundae())return;
    const point=(e)=>e.lat!=null?{lat:e.lat,lng:e.lon}:e.center?{lat:e.center.lat,lng:e.center.lon}:null;
    facilityRecords=(data.elements||[]).map((e)=>{const p=point(e);if(!p)return null;const amenity=e.tags?.amenity;const icon=amenity==="toilets"?"🚻":amenity==="shower"?"🚿":"🅿";const name=e.tags?.name||e.tags?.["name:ko"]||(amenity==="toilets"?"화장실":amenity==="shower"?"샤워 시설":"주차장");return{p,icon,name};}).filter(Boolean).slice(0,35);
    facilityRecords.forEach((f)=>{const b=document.createElement("button");b.type="button";b.className="map-facility-label";b.textContent=f.icon;b.addEventListener("click",()=>setNotice(`${f.name} · 공개 지도 시설 정보 · 운영 여부는 현장 확인 필요`));facilityOverlays.push(new window.kakao.maps.CustomOverlay({map:kakaoMap,position:new window.kakao.maps.LatLng(f.p.lat,f.p.lng),yAnchor:1,content:b}));});
  }

  async function loadSongjeongRip(version) {
    if(beachKey()!=="songjeong") return;
    const card=document.querySelector(".rip-current-card");if(card)card.hidden=false;
    try{
      const r=await fetch(`${RIP_WORKER}/rip-current?beachCode=SONGJUNG`);if(!r.ok)throw new Error();
      const data=await r.json();if(version!==loadVersion||beachKey()!=="songjeong")return;
      const items=Array.isArray(data.items)?data.items:[];if(!items.length)throw new Error();
      const latest=items[items.length-1];
      const level=String(latest.lastScrCn||"관심").trim()||"관심";
      const rank={관심:["🟢","관심"],주의:["🟡","주의"],경계:["🟠","경계"],위험:["🔴","위험"]}[level]||["🟢",level];
      document.querySelector("#ripCurrentLight").textContent=rank[0];
      document.querySelector("#ripCurrentLevel").textContent=`${rank[1]} · 송정해수욕장 이안류 지수`;
      document.querySelector("#ripCurrentStatus").textContent=`국립해양조사원 공식 이안류 지수 ${rank[1]} 단계입니다.`;
      document.querySelector("#ripCurrentScore").textContent=latest.lastScr??"–";
      document.querySelector("#ripCurrentWave").textContent=latest.wvhgt!=null?`${latest.wvhgt} m`:"–";
      document.querySelector("#ripCurrentWind").textContent=latest.wspd!=null?`${latest.wspd} m/s`:"–";
    }catch{document.querySelector("#ripCurrentLevel").textContent="공식 정보 확인 필요";document.querySelector("#ripCurrentStatus").textContent="송정 이안류 정보를 불러오지 못했어요.";}
  }

  async function onBeachChange() {
    const version=++loadVersion;
    clearCells();clearFacilities();selectedPoint=null;selectedGridId=null;
    resetBeachUI();
    if(isHaeundae()){
      setTimeout(repairHaeundaeDisplay,80);
      setTimeout(repairHaeundaeDisplay,350);
      return;
    }
    const cfg=current();
    const rip=document.querySelector(".rip-current-card");if(rip)rip.hidden=!cfg.ripCode;
    setTimeout(()=>{if(version===loadVersion&&!isHaeundae()){drawOtherGrid();queryFacilities(version);loadSongjeongRip(version);}},180);
  }

  function init() {
    const select=document.querySelector("#beachSelect");
    select?.addEventListener("change",onBeachChange);
    document.querySelector("#copyAddress")?.addEventListener("click",copyOther,true);
    document.querySelector("#shareMeeting")?.addEventListener("click",shareOther,true);
    document.querySelector("#locateMe")?.addEventListener("click",locateOther,true);

    if(window.kakaoMap&&window.kakao?.maps){
      window.kakao.maps.event.addListener(kakaoMap,"click",(event)=>{
        if(isHaeundae()||Date.now()<ignoreMapClickUntil)return;
        selectedGridId=null;
        selectedPoint={lat:event.latLng.getLat(),lng:event.latLng.getLng()};
        const cfg=current();
        const selected=document.querySelector("#selectedAddress");if(selected)selected.innerHTML=`지도 위치 <em>${cfg.name}</em>`;
        const panel=document.querySelector("#panelAddress");if(panel)panel.innerHTML="지도 위치 <small>· 격자를 눌러 구역 선택</small>";
        const desc=document.querySelector(".location-card p");if(desc)desc.textContent=`${cfg.name} · ${fmt(selectedPoint)}`;
      });
    }

    const addressObserver=new MutationObserver(()=>{
      if(!isHaeundae())return;
      const selected=document.querySelector("#selectedAddress");
      if(!selected)return;
      const text=selected.textContent.trim();
      if(text.startsWith("HD-"))return;
      const id=normalizeDisplayId(text,"HD");
      if(/^HD-/.test(id)) repairHaeundaeDisplay();
    });
    const selected=document.querySelector("#selectedAddress");if(selected)addressObserver.observe(selected,{childList:true,subtree:true,characterData:true});
    resetBeachUI();
  }

  if(document.readyState==="complete")init();else window.addEventListener("load",init,{once:true});
})();