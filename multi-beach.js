// Multi-beach extension v2: beach-aligned 10m guide grids, public-map facilities,
// GPS/location sharing, and official rip-current monitoring where KHOA supports it.
(() => {
  const beachMeta = {
    haeundae: { name: "해운대해수욕장", lat: 35.1587, lng: 129.1604, ripCode: "HAE", gridPrefix: "HAE" },
    gwangalli: { name: "광안리해수욕장", lat: 35.1532, lng: 129.1186, ripCode: null, gridPrefix: "GW" },
    songjeong: { name: "송정해수욕장", lat: 35.1785, lng: 129.2016, ripCode: "SONGJUNG", gridPrefix: "SJ" },
    songdo: { name: "송도해수욕장", lat: 35.0767, lng: 129.0178, ripCode: null, gridPrefix: "SD" }
  };

  const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
  const RIP_WORKER_URL = "https://beach-guide-rip-current-api.chopyoz1207.workers.dev";
  const GRID_SIZE = 10;
  const GRID_CACHE_HOURS = 24;
  const MAX_GRID_CELLS = 2200;

  let selectedPoint = null;
  let selectedGuideAddress = null;
  let selectedGuidePolygon = null;
  let guideGridOverlays = [];
  let facilityOverlays = [];
  let facilityRecords = [];
  let searchMarker = null;
  let searchCircle = null;
  let facilitiesVisibleOther = true;
  let hygieneVisibleOther = true;
  let loadToken = 0;

  const key = () => document.querySelector("#beachSelect")?.value || "haeundae";
  const meta = () => beachMeta[key()] || beachMeta.haeundae;
  const isHaeundae = () => key() === "haeundae";

  function mapCenterPoint() {
    if (!window.kakaoMap) return null;
    const center = kakaoMap.getCenter();
    return { lat: center.getLat(), lng: center.getLng() };
  }

  function activePoint() {
    return selectedPoint || mapCenterPoint() || { lat: meta().lat, lng: meta().lng };
  }

  function formatPoint(point) {
    return point ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` : "위치 확인 중";
  }

  function ensureNote(container, className) {
    if (!container) return null;
    let note = container.querySelector(`.${className}`);
    if (!note) {
      note = document.createElement("p");
      note.className = className;
      note.style.cssText = "margin:10px 0 0;padding:10px 12px;border-radius:10px;background:#fff;color:#60787e;font-size:11px;line-height:1.5";
      container.prepend(note);
    }
    return note;
  }

  function clearGuideGrid() {
    guideGridOverlays.forEach((overlay) => overlay.setMap(null));
    guideGridOverlays = [];
    selectedGuidePolygon = null;
    selectedGuideAddress = null;
  }

  function clearOtherFacilities() {
    facilityOverlays.forEach((overlay) => overlay.setMap(null));
    facilityOverlays = [];
    facilityRecords = [];
  }

  function clearSearchPoint() {
    searchMarker?.setMap(null);
    searchCircle?.setMap(null);
    searchMarker = null;
    searchCircle = null;
  }

  async function overpass(query) {
    const response = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`overpass ${response.status}`);
    return response.json();
  }

  function distanceSq(a, b) {
    const dy = (a.lat - b.lat) * 111320;
    const dx = (a.lng - b.lng) * 111320 * Math.cos(a.lat * Math.PI / 180);
    return dx * dx + dy * dy;
  }

  function elementPoint(element) {
    if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) return { lat: element.lat, lng: element.lon };
    if (element.center && Number.isFinite(element.center.lat) && Number.isFinite(element.center.lon)) return { lat: element.center.lat, lng: element.center.lon };
    if (Array.isArray(element.geometry) && element.geometry.length) {
      const sum = element.geometry.reduce((acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lon }), { lat: 0, lng: 0 });
      return { lat: sum.lat / element.geometry.length, lng: sum.lng / element.geometry.length };
    }
    return null;
  }

  function chooseBeachWay(elements, current) {
    const ways = elements.filter((element) => element.type === "way" && Array.isArray(element.geometry) && element.geometry.length >= 4);
    if (!ways.length) return null;
    const needle = current.name.replace("해수욕장", "");
    return ways.map((way) => {
      const point = elementPoint(way) || current;
      const name = way.tags?.name || way.tags?.["name:ko"] || "";
      return { way, score: distanceSq(point, current) + (name.includes(needle) ? -1e12 : 0) };
    }).sort((a, b) => a.score - b.score)[0].way;
  }

  function makeProjection(origin) {
    const metresPerLat = 111320;
    const metresPerLng = 111320 * Math.cos(origin.lat * Math.PI / 180);
    return {
      toLocal(point) { return { x: (point.lng - origin.lng) * metresPerLng, y: (point.lat - origin.lat) * metresPerLat }; },
      toLatLng(point) { return { lat: origin.lat + point.y / metresPerLat, lng: origin.lng + point.x / metresPerLng }; }
    };
  }

  function pointInside(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      const crosses = (a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function principalAxes(points) {
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    let xx = 0, yy = 0, xy = 0;
    points.forEach((p) => {
      const dx = p.x - cx, dy = p.y - cy;
      xx += dx * dx; yy += dy * dy; xy += dx * dy;
    });
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
    let u = { x: Math.cos(angle), y: Math.sin(angle) };
    if (u.x < 0) u = { x: -u.x, y: -u.y };
    const v = { x: -u.y, y: u.x };
    return { centre: { x: cx, y: cy }, u, v };
  }

  function toGridFrame(point, axes) {
    const dx = point.x - axes.centre.x;
    const dy = point.y - axes.centre.y;
    return { x: dx * axes.u.x + dy * axes.u.y, y: dx * axes.v.x + dy * axes.v.y };
  }

  function fromGridFrame(point, axes) {
    return {
      x: axes.centre.x + point.x * axes.u.x + point.y * axes.v.x,
      y: axes.centre.y + point.x * axes.u.y + point.y * axes.v.y
    };
  }

  function alphaLabel(index) {
    let n = index + 1, label = "";
    while (n > 0) { n--; label = String.fromCharCode(65 + (n % 26)) + label; n = Math.floor(n / 26); }
    return label;
  }

  function gridAddress(current, row, column) {
    return `${current.gridPrefix}-${alphaLabel(row)}${String(column + 1).padStart(2, "0")}`;
  }

  function cacheKey(current) {
    return `beachGridBoundary:${current.gridPrefix}:v2`;
  }

  function readCachedBoundary(current) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey(current)) || "null");
      if (!cached || !Array.isArray(cached.boundary) || Date.now() - cached.savedAt > GRID_CACHE_HOURS * 3600000) return null;
      return cached;
    } catch { return null; }
  }

  function writeCachedBoundary(current, boundary, sourceName) {
    try { localStorage.setItem(cacheKey(current), JSON.stringify({ savedAt: Date.now(), boundary, sourceName })); } catch {}
  }

  async function getBeachBoundary(current) {
    const cached = readCachedBoundary(current);
    if (cached) return cached;
    const query = `[out:json][timeout:20];way(around:2200,${current.lat},${current.lng})["natural"="beach"];out geom tags;`;
    const data = await overpass(query);
    const way = chooseBeachWay(data.elements || [], current);
    if (!way) throw new Error("beach polygon not found");
    const boundary = way.geometry.map((point) => ({ lat: point.lat, lng: point.lon }));
    const sourceName = way.tags?.name || way.tags?.["name:ko"] || current.name;
    writeCachedBoundary(current, boundary, sourceName);
    return { boundary, sourceName };
  }

  function selectGuideCell(address, polygon, centre) {
    if (selectedGuidePolygon) selectedGuidePolygon.setOptions({ fillOpacity: 0.05, strokeColor: "#237a8b", strokeWeight: 1 });
    selectedGuidePolygon = polygon;
    selectedGuidePolygon.setOptions({ fillOpacity: 0.52, fillColor: "#f6b73c", strokeColor: "#c85f00", strokeWeight: 2 });
    selectedGuideAddress = address;
    selectedPoint = centre;
    updateLocationUI();
    setNotice(`${meta().name} ${address} 10m 안내격자를 선택했어요. 만남 위치·미아 마지막 발견 구역·공유 위치에 사용할 수 있어요.`);
  }

  async function loadGuideGrid(token) {
    clearGuideGrid();
    if (isHaeundae() || !window.kakaoMap) return;
    const current = meta();
    setNotice(`${current.name}의 해변 방향에 맞춘 10m 격자를 만들고 있어요.`);
    try {
      const { boundary, sourceName } = await getBeachBoundary(current);
      if (token !== loadToken || isHaeundae()) return;
      const origin = boundary.reduce((acc, p) => ({ lat: acc.lat + p.lat / boundary.length, lng: acc.lng + p.lng / boundary.length }), { lat: 0, lng: 0 });
      const projection = makeProjection(origin);
      const localBoundary = boundary.map(projection.toLocal);
      const axes = principalAxes(localBoundary);
      const rotatedBoundary = localBoundary.map((p) => toGridFrame(p, axes));

      const minX = Math.floor(Math.min(...rotatedBoundary.map((p) => p.x)) / GRID_SIZE) * GRID_SIZE;
      const maxX = Math.ceil(Math.max(...rotatedBoundary.map((p) => p.x)) / GRID_SIZE) * GRID_SIZE;
      const minY = Math.floor(Math.min(...rotatedBoundary.map((p) => p.y)) / GRID_SIZE) * GRID_SIZE;
      const maxY = Math.ceil(Math.max(...rotatedBoundary.map((p) => p.y)) / GRID_SIZE) * GRID_SIZE;

      let count = 0;
      let rowIndex = 0;
      for (let y = minY; y < maxY && count < MAX_GRID_CELLS; y += GRID_SIZE, rowIndex++) {
        let columnIndex = 0;
        for (let x = minX; x < maxX && count < MAX_GRID_CELLS; x += GRID_SIZE, columnIndex++) {
          const centreFrame = { x: x + GRID_SIZE / 2, y: y + GRID_SIZE / 2 };
          if (!pointInside(centreFrame, rotatedBoundary)) continue;
          const frameCorners = [
            { x, y }, { x: x + GRID_SIZE, y },
            { x: x + GRID_SIZE, y: y + GRID_SIZE }, { x, y: y + GRID_SIZE }
          ];
          const localCorners = frameCorners.map((p) => fromGridFrame(p, axes));
          const latLngCorners = localCorners.map(projection.toLatLng);
          const centre = projection.toLatLng(fromGridFrame(centreFrame, axes));
          const address = gridAddress(current, rowIndex, columnIndex);
          const polygon = new window.kakao.maps.Polygon({
            map: kakaoMap,
            path: latLngCorners.map((p) => new window.kakao.maps.LatLng(p.lat, p.lng)),
            strokeWeight: 1,
            strokeColor: "#237a8b",
            strokeOpacity: 0.72,
            fillColor: "#70d1d2",
            fillOpacity: 0.05
          });
          window.kakao.maps.event.addListener(polygon, "click", () => selectGuideCell(address, polygon, centre));
          guideGridOverlays.push(polygon);
          count++;
        }
      }
      setNotice(`${sourceName} 해변의 긴 방향에 맞춰 ${count.toLocaleString()}개의 10m 안내격자를 만들었어요.`);
      updateGridNote(count, false, true);
    } catch (error) {
      updateGridNote(0, true, false);
      setNotice(`${current.name}의 10m 안내격자를 불러오지 못했어요. 지도·GPS 기능은 그대로 사용할 수 있습니다.`);
    }
  }

  function updateGridNote(count, failed = false, aligned = false) {
    const card = document.querySelector(".location-card");
    const note = ensureNote(card, "multi-beach-grid-note");
    if (!note) return;
    if (isHaeundae()) { note.hidden = true; return; }
    note.hidden = false;
    if (failed) {
      note.textContent = "10m 안내격자용 공개 지도 해변 경계를 불러오지 못했습니다. 잠시 후 다시 선택해 주세요.";
      return;
    }
    note.textContent = `${meta().gridPrefix} 코드 체계의 10m 안내격자 ${count.toLocaleString()}개${aligned ? "를 해변의 긴 방향에 맞춰 배치했습니다" : "를 표시합니다"}. OpenStreetMap 해변 경계를 바탕으로 만든 만남·수색 보조용 안내격자이며 공식 측량 주소는 아닙니다.`;
  }

  function facilityKind(tags = {}) {
    if (tags.amenity === "toilets") return { group: "hygiene", icon: "🚻", title: "화장실" };
    if (tags.amenity === "shower" || tags.shower === "yes") return { group: "hygiene", icon: "🚿", title: "샤워 시설" };
    if (tags.changing_room === "yes" || tags.amenity === "changing_room") return { group: "hygiene", icon: "👕", title: "탈의 시설" };
    if (tags.amenity === "parking") return { group: "access", icon: "🅿", title: "주차장" };
    if (tags.wheelchair === "yes") return { group: "access", icon: "♿", title: "휠체어 접근 가능 시설" };
    return null;
  }

  function renderOtherFacilities() {
    facilityOverlays.forEach((overlay) => overlay.setMap(null));
    facilityOverlays = [];
    if (isHaeundae() || !window.kakaoMap) return;
    facilityRecords.forEach((record) => {
      if ((record.group === "access" && !facilitiesVisibleOther) || (record.group === "hygiene" && !hygieneVisibleOther)) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "map-facility-label";
      button.textContent = record.icon;
      button.setAttribute("aria-label", record.title);
      button.addEventListener("click", () => {
        setNotice(`${record.title}: ${record.detail}`);
        const detail = document.querySelector("#facilityGuideDetail");
        if (detail) detail.innerHTML = `<strong>${record.title}</strong><p>${record.detail}</p>`;
      });
      facilityOverlays.push(new window.kakao.maps.CustomOverlay({ map: kakaoMap, position: new window.kakao.maps.LatLng(record.point.lat, record.point.lng), yAnchor: 1, content: button }));
    });
  }

  async function loadOtherFacilities(token) {
    clearOtherFacilities();
    if (isHaeundae()) return;
    const current = meta();
    const query = `[out:json][timeout:20];(
      nwr(around:1300,${current.lat},${current.lng})["amenity"="toilets"];
      nwr(around:1300,${current.lat},${current.lng})["amenity"="shower"];
      nwr(around:1300,${current.lat},${current.lng})["shower"="yes"];
      nwr(around:1300,${current.lat},${current.lng})["amenity"="changing_room"];
      nwr(around:1300,${current.lat},${current.lng})["changing_room"="yes"];
      nwr(around:1300,${current.lat},${current.lng})["amenity"="parking"];
      nwr(around:900,${current.lat},${current.lng})["wheelchair"="yes"];
    );out center tags;`;
    try {
      const data = await overpass(query);
      if (token !== loadToken || isHaeundae()) return;
      const seen = new Set();
      facilityRecords = (data.elements || []).map((element) => {
        const point = elementPoint(element);
        const kind = facilityKind(element.tags || {});
        if (!point || !kind) return null;
        const id = `${kind.title}:${point.lat.toFixed(5)}:${point.lng.toFixed(5)}`;
        if (seen.has(id)) return null;
        seen.add(id);
        const name = element.tags?.name || element.tags?.["name:ko"] || kind.title;
        return { point, ...kind, title: name, detail: `${name} · OpenStreetMap 공개 지도 좌표 · 운영 여부는 현장 확인 필요`, dist: distanceSq(point, current) };
      }).filter(Boolean).sort((a, b) => a.dist - b.dist).slice(0, 40);
      renderOtherFacilities();
      updateFacilityNote();
    } catch {
      facilityRecords = [];
      updateFacilityNote(true);
    }
  }

  function updateFacilityNote(failed = false) {
    const group = document.querySelector(".facility-group");
    const note = ensureNote(group, "multi-beach-facility-note");
    if (!note) return;
    if (isHaeundae()) { note.hidden = true; return; }
    note.hidden = false;
    note.textContent = failed
      ? `${meta().name} 주변 공개 지도 시설 좌표를 불러오지 못했습니다. 운영 여부와 위치는 현장 표지를 확인하세요.`
      : `${meta().name} 주변 화장실·샤워·주차·휠체어 접근 시설 ${facilityRecords.length}곳을 OpenStreetMap 공개 지도 좌표로 표시합니다. 공식 시설 목록이 아니며 운영 여부는 현장 확인이 필요합니다.`;
  }

  function weatherValues() {
    const number = (selector) => {
      const value = parseFloat(document.querySelector(selector)?.textContent || "");
      return Number.isFinite(value) ? value : null;
    };
    return { temp: number("#weatherTemp"), rain: number("#weatherRain"), wind: number("#weatherWind"), desc: document.querySelector("#weatherDesc")?.textContent || "" };
  }

  function applyWeatherOnlySafety() {
    if (isHaeundae() || meta().ripCode) return;
    const { temp, rain, wind, desc } = weatherValues();
    const light = document.querySelector("#safetyIndexLight");
    const label = document.querySelector("#safetyIndexLabel");
    const reason = document.querySelector("#safetyIndexReason");
    const summary = document.querySelector("#conditionSummary");
    const rip = document.querySelector("#conditionRip");
    if (!light || !label || !reason || !summary || !rip) return;
    rip.innerHTML = "<b>이안류</b> · 국립해양조사원 이안류 지수 공식 제공 해수욕장 목록에 현재 이 해변은 포함되어 있지 않습니다.";
    if ([temp, rain, wind].some((value) => value === null)) {
      light.textContent = "⚪"; label.textContent = "기상 확인 중"; reason.textContent = "현재 날씨를 불러온 뒤 기상 기준 참고지수를 표시합니다."; return;
    }
    const severe = /뇌우|강한 비|강한 소나기|우박/.test(desc) || wind >= 35 || rain >= 10;
    const caution = wind >= 20 || rain >= 2 || temp >= 34;
    if (severe) {
      light.textContent = "🔴"; label.textContent = "기상 위험"; reason.textContent = "강한 비·바람 등 기상 위험요소가 감지됐어요. 현장 통제와 안전요원 안내를 우선하세요.";
      summary.textContent = "현재 기상 조건만으로도 물놀이를 권하기 어려워요. 공식 이안류 지수가 제공되지 않는 해변이므로 현장 파도와 안전요원 안내를 더 중요하게 확인하세요.";
    } else if (caution) {
      light.textContent = "🟡"; label.textContent = "기상 주의"; reason.textContent = "바람·강수 또는 더위에 주의가 필요해요. 현장 파도와 통제 여부를 함께 확인하세요.";
      summary.textContent = "현재 날씨에는 주의가 필요한 요소가 있어요. 무리한 물놀이는 피하고 현장 안전요원 안내를 확인하세요.";
    } else {
      light.textContent = "🟢"; label.textContent = "기상 양호"; reason.textContent = "현재 기상 조건은 비교적 안정적입니다. 공식 이안류 지수가 제공되지 않는 해변이므로 현장 상태를 함께 확인하세요.";
      summary.textContent = "현재 기상 조건은 비교적 무난해요. 다만 이 해변은 공식 이안류 지수가 제공되지 않으므로 현장 파도와 안전요원 안내를 꼭 함께 확인하세요.";
    }
  }

  async function loadOtherRipCurrent(token) {
    if (isHaeundae()) return;
    const current = meta();
    const card = document.querySelector(".rip-current-card");
    const conditionRip = document.querySelector("#conditionRip");
    if (!current.ripCode) {
      if (card) card.hidden = true;
      latestRipCurrentLevel = "확인불가";
      applyWeatherOnlySafety();
      return;
    }
    if (card) card.hidden = false;
    latestRipCurrentLevel = null;
    const heading = document.querySelector(".rip-current-card h3");
    if (heading) heading.textContent = `${current.name} 이안류 위험 정보`;
    document.querySelector("#ripCurrentLight").textContent = "⚪";
    document.querySelector("#ripCurrentLevel").textContent = "공식 정보 확인 중";
    document.querySelector("#ripCurrentStatus").textContent = "국립해양조사원 이안류 지수를 불러오고 있어요.";
    try {
      const response = await fetch(`${RIP_WORKER_URL}/rip-current?beachCode=${encodeURIComponent(current.ripCode)}`);
      if (!response.ok) throw new Error(`rip ${response.status}`);
      const data = await response.json();
      if (token !== loadToken || key() !== "songjeong") return;
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) throw new Error("no rip data");
      const now = new Date();
      const sorted = items.map((item) => ({ item, time: ripTimestamp(item) })).filter(({ time }) => time).sort((a, b) => a.time - b.time);
      const past = sorted.filter(({ time }) => time <= now);
      const latest = (past.length ? past[past.length - 1] : sorted[sorted.length - 1]) || { item: items[items.length - 1], time: null };
      const normalized = String(latest.item?.lastScrCn || "관심").trim() || "관심";
      latestRipCurrentLevel = normalized;
      const display = ripLevelDisplay(normalized);
      document.querySelector("#ripCurrentLight").textContent = display.icon;
      document.querySelector("#ripCurrentLevel").textContent = `${display.label} · ${current.name} 이안류 지수`;
      document.querySelector("#ripCurrentStatus").textContent = display.message;
      document.querySelector("#ripCurrentWindow").textContent = describeRiskWindow(items);
      document.querySelector("#ripCurrentTime").textContent = latest.time ? formatRipTime(latest.time) : "–";
      document.querySelector("#ripCurrentScore").textContent = latest.item?.lastScr != null ? String(latest.item.lastScr) : "–";
      document.querySelector("#ripCurrentWave").textContent = latest.item?.wvhgt != null ? `${latest.item.wvhgt} m` : "–";
      document.querySelector("#ripCurrentWind").textContent = latest.item?.wspd != null ? `${latest.item.wspd} m/s` : "–";
      if (conditionRip) conditionRip.innerHTML = `<b>이안류</b> · 현재 공식 지수는 ${normalized} 단계입니다.`;
      updateSafetyIndexFromWeather();
      updateConditionAnalysis();
    } catch {
      if (token !== loadToken) return;
      latestRipCurrentLevel = "확인불가";
      document.querySelector("#ripCurrentLight").textContent = "⚠️";
      document.querySelector("#ripCurrentLevel").textContent = "공식 정보 확인 필요";
      document.querySelector("#ripCurrentStatus").textContent = "송정 이안류 공식 정보를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.";
      document.querySelector("#ripCurrentWindow").textContent = "현장 안전요원과 공식 해양정보를 우선 확인하세요.";
      updateSafetyIndexFromWeather();
      updateConditionAnalysis();
    }
  }

  function updateLocationUI() {
    if (isHaeundae()) return;
    const current = meta();
    const point = activePoint();
    const address = selectedGuideAddress || "지도 위치";
    const selectedAddress = document.querySelector("#selectedAddress");
    const panelAddress = document.querySelector("#panelAddress");
    if (selectedAddress) selectedAddress.innerHTML = `${address} <em>${current.name}</em>`;
    if (panelAddress) panelAddress.innerHTML = `${address} <small>· 10m 안내격자</small>`;
    const desc = document.querySelector(".location-card p");
    if (desc) desc.textContent = `${current.name} · ${formatPoint(point)}`;
  }

  function syncUI() {
    const current = meta();
    const other = !isHaeundae();
    document.title = `해변가이드 | ${current.name} 안전 지도`;
    const panelTitle = document.querySelector(".panel-head h2");
    if (panelTitle) panelTitle.textContent = `${current.name} 안전 안내`;
    const panelLead = document.querySelector(".panel-head > p:not(.tag)");
    if (panelLead) panelLead.textContent = other
      ? "해변 방향에 맞춘 10m 안내격자, GPS, 날씨, 공개 지도 시설과 제공 가능한 공식 해양안전 정보를 확인하세요."
      : "만남 위치, 내 위치, 접근성 시설을 지도에서 바로 확인하세요.";
    const locate = document.querySelector("#locateMe");
    if (locate && !locate.disabled) locate.innerHTML = other ? "내 현재 위치 지도에서 확인 <span>⌖</span>" : "내 위치로 격자 찾기 <span>⌖</span>";
    const copy = document.querySelector("#copyAddress");
    if (copy) copy.textContent = other ? "격자 위치 복사" : "주소 복사";
    const indexNote = document.querySelector(".safety-index-note");
    if (indexNote && other) indexNote.textContent = current.ripCode
      ? "기온·강수·바람과 국립해양조사원 공식 이안류 지수를 함께 반영한 참고지수입니다. 현장 통제와 안전요원 안내를 우선하세요."
      : "현재는 기온·강수·바람을 반영한 기상 참고지수입니다. 공식 이안류 지수가 제공되지 않는 해변에서는 현장 안전요원 안내를 우선하세요.";
    const tideGroup = document.querySelector(".tide-card");
    if (tideGroup) {
      const note = ensureNote(tideGroup, "multi-beach-tide-note");
      if (note) { note.hidden = !other; note.textContent = `${current.name}의 공식 조석 예보지점은 아직 검증 중입니다. 확인되지 않은 지점 값을 대신 표시하지 않습니다.`; }
    }
    updateFacilityNote();
    updateGridNote(guideGridOverlays.length, false, true);
    updateLocationUI();
    if (other && !current.ripCode) applyWeatherOnlySafety();
  }

  function handleLocate(event) {
    if (isHaeundae()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const button = event.currentTarget;
    if (!navigator.geolocation) { setNotice("이 기기에서는 GPS 위치 기능을 사용할 수 없어요."); return; }
    button.disabled = true; button.textContent = "현재 위치를 확인하고 있어요…";
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      selectedPoint = { lat: coords.latitude, lng: coords.longitude };
      const position = new window.kakao.maps.LatLng(selectedPoint.lat, selectedPoint.lng);
      if (myLocationMarker) myLocationMarker.setMap(null);
      myLocationMarker = new window.kakao.maps.Marker({ map: kakaoMap, position, title: "내 현재 위치" });
      kakaoMap.panTo(position);
      button.disabled = false;
      updateLocationUI();
      setNotice(`${meta().name} 주변에서 현재 GPS 위치를 표시했어요. 정확도는 약 ${Math.round(coords.accuracy)}m예요.`);
    }, () => {
      button.disabled = false; button.innerHTML = "내 현재 위치 지도에서 확인 <span>⌖</span>";
      setNotice("위치 권한이 필요해요. 브라우저에서 위치 사용을 허용해 주세요.");
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }

  async function handleShare(event) {
    if (isHaeundae()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const current = meta();
    const point = activePoint();
    const address = selectedGuideAddress || "지도 위치";
    const message = `${current.name} 만남 위치: ${address} · ${formatPoint(point)}\n${location.href}`;
    const result = document.querySelector("#shareResult");
    try {
      if (navigator.share) await navigator.share({ title: `${current.name} 만남 위치`, text: message, url: location.href });
      else await navigator.clipboard.writeText(message);
      if (result) { result.hidden = false; result.textContent = navigator.share ? "공유 창을 열었어요." : "해변 이름·10m 격자·위치 좌표를 복사했어요."; }
    } catch (error) {
      if (error.name !== "AbortError" && result) { result.hidden = false; result.textContent = "공유하지 못했어요. 다시 시도해 주세요."; }
    }
  }

  async function handleCopy(event) {
    if (isHaeundae()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const current = meta();
    const point = activePoint();
    const address = selectedGuideAddress || "지도 위치";
    const text = `${current.name} ${address} ${formatPoint(point)}`;
    try { await navigator.clipboard.writeText(text); setNotice(`${current.name} ${address} 위치를 복사했어요.`); }
    catch { setNotice(`현재 위치: ${text}`); }
  }

  function handleFacilityToggle(event, hygiene) {
    if (isHaeundae()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (hygiene) hygieneVisibleOther = !hygieneVisibleOther; else facilitiesVisibleOther = !facilitiesVisibleOther;
    renderOtherFacilities();
    const visible = hygiene ? hygieneVisibleOther : facilitiesVisibleOther;
    event.currentTarget.classList.toggle("active", visible);
    event.currentTarget.innerHTML = hygiene
      ? `${visible ? "지도에서 씻는 시설 숨기기" : "지도에서 씻는 시설 표시하기"} <span>⌖</span>`
      : `${visible ? "지도에서 편의·접근성 시설 숨기기" : "지도에서 편의·접근성 시설 보기"} <span>›</span>`;
  }

  async function handleBeachChange() {
    const token = ++loadToken;
    clearGuideGrid(); clearOtherFacilities(); clearSearchPoint();
    selectedPoint = null; selectedGuideAddress = null;
    setTimeout(async () => {
      if (token !== loadToken) return;
      selectedPoint = mapCenterPoint();
      syncUI();
      if (isHaeundae()) return;
      await Promise.allSettled([loadGuideGrid(token), loadOtherFacilities(token), loadOtherRipCurrent(token)]);
      if (token === loadToken) syncUI();
    }, 80);
  }

  function init() {
    document.querySelector("#beachSelect")?.addEventListener("change", handleBeachChange);
    document.querySelector("#locateMe")?.addEventListener("click", handleLocate, true);
    document.querySelector("#shareMeeting")?.addEventListener("click", handleShare, true);
    document.querySelector("#copyAddress")?.addEventListener("click", handleCopy, true);
    document.querySelector("#toggleFacilities")?.addEventListener("click", (event) => handleFacilityToggle(event, false), true);
    document.querySelector("#toggleHygieneFacilities")?.addEventListener("click", (event) => handleFacilityToggle(event, true), true);

    if (window.kakaoMap && window.kakao?.maps) {
      window.kakao.maps.event.addListener(kakaoMap, "click", (mouseEvent) => {
        if (isHaeundae()) return;
        selectedPoint = { lat: mouseEvent.latLng.getLat(), lng: mouseEvent.latLng.getLng() };
        selectedGuideAddress = null;
        updateLocationUI();
        setNotice(`${meta().name}에서 위치를 선택했어요: ${formatPoint(selectedPoint)}`);
      });
    }

    const weatherObserver = new MutationObserver(() => {
      if (!isHaeundae() && !meta().ripCode) queueMicrotask(applyWeatherOnlySafety);
    });
    ["#weatherTemp", "#weatherRain", "#weatherWind", "#weatherDesc"].forEach((selector) => {
      const node = document.querySelector(selector);
      if (node) weatherObserver.observe(node, { childList: true, subtree: true, characterData: true });
    });
    syncUI();
  }

  if (document.readyState === "complete") init();
  else window.addEventListener("load", init, { once: true });
})();