const HAEUNDAE = { lat: 35.1587, lng: 129.1604 };
const TIDE_WORKER_URL = "https://beach-guide-tide-api.chopyoz1207.workers.dev";
// DT_0018 is the official API documentation sample only. It is deliberately
// not presented to users as Haeundae until the nearest forecast-point mapping
// has been verified with the National Oceanographic Research Institute.
const TIDE_CONFIG = { observationCode: "DT_0018", verified: false };
const BEACHES = {
  haeundae: { name: "해운대해수욕장", lat: 35.1587, lng: 129.1604, gridReady: true },
  gwangalli: { name: "광안리해수욕장", lat: 35.1532, lng: 129.1186, gridReady: false },
  songjeong: { name: "송정해수욕장", lat: 35.1785, lng: 129.2016, gridReady: false },
  songdo: { name: "송도해수욕장", lat: 35.0767, lng: 129.0178, gridReady: false }
};
const rows = ["A", "B", "C", "D", "E", "F", "G"];
const columns = Array.from({ length: 12 }, (_, i) => i + 1);
// Approximate sand-area boundary: cells outside the curved beach edge are omitted.
// Replace these ranges with official shoreline survey coordinates before public-safety use.
const beachCellsByRow = {
  A: [4, 12], B: [2, 12], C: [1, 12], D: [1, 12],
  E: [1, 11], F: [2, 10], G: [4, 9]
};
// OpenStreetMap natural=beach boundary (way 107531972), simplified for display.
// This is a public-data prototype boundary, not a surveyed emergency-services boundary.
const beachBoundary = [
  [35.1592391,129.1622327],[35.1592232,129.1623125],[35.1592248,129.1624084],
  [35.1592578,129.1625103],[35.1593367,129.1626069],[35.1593937,129.1626873],
  [35.1594990,129.1634920],[35.1596393,129.1647151],[35.1595604,129.1679445],
  [35.1595284,129.1684263],[35.1592851,129.1696193],[35.1591295,129.1698984],
  [35.1586275,129.1692216],[35.1587919,129.1690404],[35.1589040,129.1685307],
  [35.1588973,129.1677853],[35.1588778,129.1663901],[35.1587310,129.1653382],
  [35.1585189,129.1631374],[35.1581019,129.1610843],[35.1576022,129.1590037],
  [35.1569709,129.1571193],[35.1564239,129.1557987],[35.1558795,129.1549044],
  [35.1556784,129.1547728],[35.1556554,129.1546597],[35.1557847,129.1545308],
  [35.1562062,129.1543963],[35.1563277,129.1544186],[35.1565279,129.1544317],
  [35.1567272,129.1547480],[35.1570517,129.1550270],[35.1572008,129.1552201],
  [35.1579596,129.1569151],[35.1584025,129.1579452],[35.1586095,129.1586556],
  [35.1587411,129.1593747],[35.1591353,129.1614219],[35.1592743,129.1621183]
];
const geoGrid = new Map();
let selectedGeoCell;
let kakaoMap;
let myLocationMarker;
let searchOverlays = [];
const storageKey = "haeundae-beach-guide-reports";
// Address convention imported from haeundae-grid-map-share: rows A/B/C run
// from the promenade toward the sea, while columns 1/2/3 run west to east.
let selected = "D6";
let reports = JSON.parse(localStorage.getItem(storageKey) || "[]");
// The former on-device report prototype is retired. Clear only its own data.
if (reports.length) { reports = []; localStorage.removeItem(storageKey); }
let facilitiesVisible = false;
let deckVisible = false;
// Deliberately empty: only verified, on-land facility coordinates may be shown.
const geoFacilities = [];
let facilityMarkers = [];
let deckLine;
let currentBeachKey = "haeundae";

const facilities = [
  { icon: "♿", name: "휠체어 경사로", detail: "관광안내소 앞", x: "18%", y: "35%" },
  { icon: "WC", name: "장애인 화장실", detail: "해변 중앙", x: "50%", y: "67%" },
  { icon: "↗", name: "접근 가능한 출입구", detail: "해운대역 방면", x: "80%", y: "27%" }
];

function addressText() { return `${selected} 구역`; }
function saveReports() { localStorage.setItem(storageKey, JSON.stringify(reports)); }
function reportAt(address) { return reports.find((report) => report.grid === address); }
function isBeachCell(row, column) {
  const [first, last] = beachCellsByRow[row];
  return column >= first && column <= last;
}
function letterLabel(index) {
  let value = index + 1;
  let label = "";
  while (value > 0) { value--; label = String.fromCharCode(65 + (value % 26)) + label; value = Math.floor(value / 26); }
  return label;
}
function isInsideBeach(lat, lng) {
  let inside = false;
  for (let i = 0, j = beachBoundary.length - 1; i < beachBoundary.length; j = i++) {
    const [latI, lngI] = beachBoundary[i];
    const [latJ, lngJ] = beachBoundary[j];
    const crosses = (latI > lat) !== (latJ > lat) && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
    if (crosses) inside = !inside;
  }
  return inside;
}
// Work in local metres. The grid follows the two measured beach edges so no
// empty strips are left along the curved shoreline.
const gridOrigin = { lat: 35.1577, lng: 129.1618 };
const metresPerLat = 111320;
const metresPerLng = 111320 * Math.cos(gridOrigin.lat * Math.PI / 180);
function toLocal(lat, lng) {
  const east = (lng - gridOrigin.lng) * metresPerLng;
  const north = (lat - gridOrigin.lat) * metresPerLat;
  return { u: east, v: north };
}
function toLatLng(u, v) {
  return { lat: gridOrigin.lat + v / metresPerLat, lng: gridOrigin.lng + u / metresPerLng };
}
function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.v > point.v) !== (b.v > point.v) && point.u < ((b.u - a.u) * (point.v - a.v)) / (b.v - a.v) + a.u) inside = !inside;
  }
  return inside;
}
function segmentsCross(a, b, c, d) {
  const cross = (p, q, r) => (q.u - p.u) * (r.v - p.v) - (q.v - p.v) * (r.u - p.u);
  const ab1 = cross(a, b, c), ab2 = cross(a, b, d), cd1 = cross(c, d, a), cd2 = cross(c, d, b);
  return ab1 * ab2 < 0 && cd1 * cd2 < 0;
}
function fullCellIsInBeach(cellPath, localBoundary) {
  if (!cellPath.every((point) => pointInPolygon(point, localBoundary))) return false;
  const centre = { u: (cellPath[0].u + cellPath[2].u) / 2, v: (cellPath[0].v + cellPath[2].v) / 2 };
  if (!pointInPolygon(centre, localBoundary)) return false;
  for (let side = 0; side < 4; side++) {
    const start = cellPath[side], end = cellPath[(side + 1) % 4];
    for (let edge = 0; edge < localBoundary.length; edge++) {
      if (segmentsCross(start, end, localBoundary[edge], localBoundary[(edge + 1) % localBoundary.length])) return false;
    }
  }
  return true;
}
function selectGeoCell(address, polygon) {
  if (selectedGeoCell) selectedGeoCell.setOptions({ fillOpacity: 0.08, strokeColor: "#237a8b" });
  selectedGeoCell = polygon;
  selectedGeoCell.setOptions({ fillOpacity: 0.52, fillColor: "#f6b73c", strokeColor: "#d76b00" });
  selectAddress(address);
}
function findGeoCell(lat, lng) {
  if (!isInsideBeach(lat, lng)) return null;
  const point = toLocal(lat, lng);
  for (const [address, cell] of geoGrid) {
    if (pointInPolygon(point, cell.localPath)) return { address, cell };
  }
  return null;
}
function clearSearchOverlays() {
  searchOverlays.forEach((overlay) => overlay.setMap(null));
  searchOverlays = [];
}
function renderSearchOverlays() {
  if (!kakaoMap || !window.kakao || !window.kakao.maps) return;
  clearSearchOverlays();
  reports.forEach((report) => {
    const cell = geoGrid.get(report.grid);
    if (!cell) return;
    const path = cell.localPath.map(({ u, v }) => {
      const { lat, lng } = toLatLng(u, v);
      return new window.kakao.maps.LatLng(lat, lng);
    });
    const alertCell = new window.kakao.maps.Polygon({ map: kakaoMap, path, strokeWeight: 3, strokeColor: "#d93636", strokeOpacity: 1, fillColor: "#e74c4c", fillOpacity: 0.48 });
    const centre = cell.localPath.reduce((sum, point) => ({ u: sum.u + point.u / 4, v: sum.v + point.v / 4 }), { u: 0, v: 0 });
    const { lat, lng } = toLatLng(centre.u, centre.v);
    const range = new window.kakao.maps.Circle({ map: kakaoMap, center: new window.kakao.maps.LatLng(lat, lng), radius: 35, strokeWeight: 2, strokeColor: "#d93636", strokeOpacity: 0.9, strokeStyle: "shortdash", fillColor: "#e74c4c", fillOpacity: 0.1 });
    searchOverlays.push(alertCell, range);
  });
}
function locateMe() {
  const button = document.querySelector("#locateMe");
  if (!navigator.geolocation) { setNotice("이 기기에서는 GPS 위치 기능을 사용할 수 없어요."); return; }
  button.disabled = true;
  button.textContent = "현재 위치를 확인하고 있어요…";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const { latitude: lat, longitude: lng, accuracy } = coords;
      const position = new window.kakao.maps.LatLng(lat, lng);
      if (myLocationMarker) myLocationMarker.setMap(null);
      myLocationMarker = new window.kakao.maps.Marker({ map: kakaoMap, position, title: "내 현재 위치" });
      kakaoMap.panTo(position);
      const match = findGeoCell(lat, lng);
      if (match) {
        selectGeoCell(match.address, match.cell.polygon);
        setNotice(`내 위치는 ${match.address} 구역이에요. GPS 정확도는 약 ${Math.round(accuracy)}m예요.`);
      } else {
        setNotice(`현재 위치는 해변 격자 범위 밖이에요. GPS 정확도는 약 ${Math.round(accuracy)}m예요.`);
      }
      button.disabled = false;
      button.innerHTML = "내 위치로 격자 찾기 <span>⌖</span>";
    },
    () => { button.disabled = false; button.innerHTML = "내 위치로 격자 찾기 <span>⌖</span>"; setNotice("위치 권한이 필요해요. 브라우저에서 위치 사용을 허용해 주세요."); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}
function renderGeographicGrid(map) {
  const localBoundary = beachBoundary.map(([lat, lng]) => toLocal(lat, lng));
  const minU = Math.floor(Math.min(...localBoundary.map(({ u }) => u)) / 10) * 10;
  const maxU = Math.ceil(Math.max(...localBoundary.map(({ u }) => u)) / 10) * 10;
  const minV = Math.floor(Math.min(...localBoundary.map(({ v }) => v)) / 10) * 10;
  const maxV = Math.ceil(Math.max(...localBoundary.map(({ v }) => v)) / 10) * 10;
  const candidates = [];
  for (let v = minV; v < maxV; v += 10) {
    for (let u = minU; u < maxU; u += 10) {
      const localPath = [{ u, v }, { u: u + 10, v }, { u: u + 10, v: v + 10 }, { u, v: v + 10 }];
      if (!fullCellIsInBeach(localPath, localBoundary)) continue;
      candidates.push({ u, v, localPath });
    }
  }
  const activeColumns = [...new Set(candidates.map((cell) => cell.u))].sort((a, b) => a - b);
  activeColumns.forEach((u, columnIndex) => candidates.filter((cell) => cell.u === u).sort((a, b) => b.v - a.v).forEach((cell, rowIndex) => {
    cell.address = `${letterLabel(rowIndex)}${columnIndex + 1}`;
  }));
  let count = 0;
  for (const { address, localPath } of candidates) {
      const polygon = new window.kakao.maps.Polygon({
        map,
        path: localPath.map(({ u, v }) => { const { lat, lng } = toLatLng(u, v); return new window.kakao.maps.LatLng(lat, lng); }),
        strokeWeight: 1, strokeColor: "#237a8b", strokeOpacity: 0.72, fillColor: "#70d1d2", fillOpacity: 0.08
      });
      window.kakao.maps.event.addListener(polygon, "click", () => selectGeoCell(address, polygon));
  geoGrid.set(address, { polygon, localPath });
      count++;
  }
  setNotice(`모래사장 경계 안에 완전히 들어가는 ${count.toLocaleString()}개의 10m × 10m 격자를 만들었어요.`);
  renderSearchOverlays();
}

function renderGrid() {
  const grid = document.querySelector("#beachGrid");
  grid.innerHTML = "";
  rows.forEach((row) => columns.forEach((column) => {
    if (!isBeachCell(row, column)) return;
    const address = `${column}-${row}`;
    const report = reportAt(address);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `cell${selected === address ? " selected" : ""}${report ? " alert" : ""}`;
    button.style.gridColumn = String(column);
    button.style.gridRow = String(rows.indexOf(row) + 1);
    button.setAttribute("aria-label", `${address} 구역 선택`);
    button.innerHTML = report ? "!" : `<span>${column}</span><b>${row}</b>`;
    button.addEventListener("click", () => selectAddress(address));
    grid.appendChild(button);
  }));
}

function renderStaticFacilities() {
  const layer = document.querySelector("#facilityLayer");
  layer.innerHTML = "";
  if (deckVisible) { const deck = document.createElement("div"); deck.className = "deck-path"; layer.appendChild(deck); }
  if (!facilitiesVisible || geoFacilities.length === 0) return;
  facilities.forEach((facility) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "facility";
    button.style.left = facility.x; button.style.top = facility.y;
    button.innerHTML = `<span>${facility.icon}</span><i>${facility.name}</i>`;
    button.addEventListener("click", () => setNotice(`${facility.name}: ${facility.detail}`));
    layer.appendChild(button);
  });
}

function renderFacilities() {
  const layer = document.querySelector("#facilityLayer");
  layer.innerHTML = "";
  if (!kakaoMap) return;
  facilityMarkers.forEach((marker) => marker.setMap(null));
  facilityMarkers = [];
  if (deckLine) { deckLine.setMap(null); deckLine = null; }
  if (deckVisible) {
    deckLine = new window.kakao.maps.Polyline({
      map: kakaoMap,
      path: [[35.15924,129.16223],[35.15950,129.16349],[35.15964,129.16472],[35.15956,129.16794],[35.15929,129.16962]].map(([lat,lng]) => new window.kakao.maps.LatLng(lat,lng)),
      strokeWeight: 7, strokeColor: "#76522a", strokeOpacity: 0.85, strokeStyle: "shortdash"
    });
  }
  if (!facilitiesVisible) return;
  geoFacilities.forEach((facility) => {
    const position = new window.kakao.maps.LatLng(facility.lat, facility.lng);
    const marker = new window.kakao.maps.CustomOverlay({
      map: kakaoMap, position, yAnchor: 1,
      content: `<button class="map-facility-label" type="button" aria-label="${facility.title}">${facility.label}</button>`
    });
    window.kakao.maps.event.addListener(marker, "click", () => setNotice(`${facility.title}를 선택했어요. 실제 운영 정보는 현장 확인 후 등록합니다.`));
    facilityMarkers.push(marker);
  });
}

function selectAddress(address) {
  selected = address;
  renderGrid(); updateAddress();
  const found = reportAt(address);
  setNotice(found ? `수색 알림 · ${found.name} / ${found.description}` : `${addressText()}을 선택했어요. 이 주소를 가족·친구·안전요원에게 알려주세요.`);
}
function updateAddress() {
  document.querySelector("#selectedAddress").innerHTML = `${selected} <em>구역</em>`;
  document.querySelector("#panelAddress").innerHTML = `${selected} 구역 <small>· 10m × 10m</small>`;
  document.querySelector("#reportAddress").textContent = addressText();
}
function setNotice(message) { document.querySelector("#mapNotice").textContent = message; }
function weatherInfo(code) {
  const values = { 0:["☀️","맑음"], 1:["🌤️","대체로 맑음"], 2:["⛅","구름 조금"], 3:["☁️","흐림"], 45:["🌫️","안개"], 48:["🌫️","안개"], 51:["🌦️","이슬비"], 53:["🌦️","이슬비"], 55:["🌦️","강한 이슬비"], 61:["🌧️","비"], 63:["🌧️","비"], 65:["🌧️","강한 비"], 71:["🌨️","눈"], 73:["🌨️","눈"], 75:["🌨️","강한 눈"], 80:["🌦️","소나기"], 81:["🌧️","소나기"], 82:["⛈️","강한 소나기"], 95:["⛈️","뇌우"], 96:["⛈️","우박 동반 뇌우"], 99:["⛈️","강한 뇌우"] };
  return values[code] || ["🌡️", "날씨 상태 확인"];
}
async function loadWeather() {
  const beach = BEACHES[currentBeachKey] || BEACHES.haeundae;
  const $ = (selector) => document.querySelector(selector);
  $("#weatherBeach").textContent = `${beach.name} 오늘의 날씨`;
  $("#weatherIcon").textContent = "…"; $("#weatherTemp").textContent = "불러오는 중…"; $("#weatherDesc").textContent = "현재 조건을 확인하고 있어요.";
  $("#weatherRain").textContent = "–"; $("#weatherWind").textContent = "–"; $("#weatherUpdated").textContent = "";
  try {
    const params = new URLSearchParams({ latitude: beach.lat, longitude: beach.lng, current: "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m", timezone: "Asia/Seoul" });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error("weather request failed");
    const data = await response.json(); const current = data.current;
    if (!current) throw new Error("weather payload missing");
    const [emoji, label] = weatherInfo(current.weather_code);
    $("#weatherIcon").textContent = emoji; $("#weatherTemp").textContent = `${Math.round(current.temperature_2m)}°C`;
    $("#weatherDesc").textContent = `${label} · 체감 ${Math.round(current.apparent_temperature)}°C`;
    $("#weatherRain").textContent = `${current.precipitation} mm`; $("#weatherWind").textContent = `${Math.round(current.wind_speed_10m)} km/h`;
    $("#weatherUpdated").textContent = `기준 시각 ${current.time.replace("T", " ")} · 자동 갱신`;
  } catch (error) {
    $("#weatherIcon").textContent = "⚠️"; $("#weatherTemp").textContent = "날씨 확인 필요"; $("#weatherDesc").textContent = "날씨 정보를 불러오지 못했어요.";
    $("#weatherUpdated").textContent = "네트워크를 확인한 뒤 다시 열어 주세요.";
  }
}
function tideKind(value) {
  const text = String(value || "");
  if (/고|high/i.test(text)) return "만조";
  if (/저|low/i.test(text)) return "간조";
  return "조석";
}
function tideTime(item) {
  const value = item?.tphTime || item?.tideTime || item?.fcstTime || item?.time || "";
  const match = String(value).match(/(\d{2}:?\d{2})$/);
  return match ? match[1].replace(/(\d{2})(\d{2})$/, "$1:$2") : String(value || "시간 확인 중");
}
function tideHeight(item) {
  const value = item?.tphLevel ?? item?.tideLevel ?? item?.fcstLevel ?? item?.level;
  return value === undefined || value === null || value === "" ? "" : ` ${value}cm`;
}
async function loadTide() {
  const beach = BEACHES[currentBeachKey] || BEACHES.haeundae;
  const status = document.querySelector("#tideStatus");
  const times = document.querySelector("#tideTimes");
  const updated = document.querySelector("#tideUpdated");
  document.querySelector("#tideBeach").textContent = `${beach.name} 만조·간조`;
  times.hidden = true;
  times.innerHTML = "";
  updated.textContent = "";
  if (currentBeachKey !== "haeundae") {
    status.textContent = "이 해변의 공식 예보지점은 검증 후 추가합니다.";
    return;
  }
  status.textContent = "국립해양조사원 조석 정보를 불러오는 중…";
  try {
    const response = await fetch(`${TIDE_WORKER_URL}/tide?obsCode=${encodeURIComponent(TIDE_CONFIG.observationCode)}`);
    if (!response.ok) throw new Error(`tide request failed: ${response.status}`);
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (!TIDE_CONFIG.verified || !items.length) {
      status.textContent = "공식 조석 서버 연결은 완료됐어요. 해운대 기준 예보지점 코드를 검증한 뒤 만·간조 시각을 표시합니다.";
      updated.textContent = "추측값은 표시하지 않습니다.";
      return;
    }
    status.textContent = "국립해양조사원 공식 조석예보";
    times.hidden = false;
    times.innerHTML = items.slice(0, 4).map((item) => `<span><b>${tideKind(item?.hlCode || item?.type || item?.extreme)}</b>${tideTime(item)}${tideHeight(item)}</span>`).join("");
    updated.textContent = `${data.date || "오늘"} 기준 · 예보지점 ${data.observationCode}`;
  } catch (error) {
    status.textContent = "공식 조석 정보를 불러오지 못했어요. 아래 국립해양조사원 링크에서 확인해 주세요.";
    updated.textContent = "네트워크 또는 공식 데이터 서버 상태를 확인해 주세요.";
  }
}
function setGuideVisible(visible) {
  document.querySelector("#guideModal").hidden = !visible;
  if (!visible) localStorage.setItem("haeundae-beach-guide-intro-seen", "true");
}
function changeBeach(event) {
  const beach = BEACHES[event.target.value];
  if (!kakaoMap || !beach) return;
  currentBeachKey = event.target.value;
  loadWeather();
  loadTide();
  kakaoMap.setCenter(new window.kakao.maps.LatLng(beach.lat, beach.lng));
  kakaoMap.setLevel(beach.gridReady ? 4 : 5);
  if (beach.gridReady) {
    renderGeographicGrid(kakaoMap);
    renderFacilities();
    setNotice(`${beach.name}의 10m 구역 주소와 안전 정보를 확인할 수 있어요.`);
  } else {
    geoGrid.forEach(({ polygon }) => polygon.setMap(null));
    geoGrid.clear();
    facilityMarkers.forEach((marker) => marker.setMap(null));
    if (deckLine) deckLine.setMap(null);
    setNotice(`${beach.name} 지도 탐색을 열었어요. 10m 구역 주소와 시설 정보는 현장 좌표 검증 후 제공합니다.`);
  }
}
async function shareMeeting() {
  const message = `해운대해수욕장 만남 위치: ${addressText()}\n${location.href}`;
  const result = document.querySelector("#shareResult");
  try {
    if (navigator.share) await navigator.share({ title: "해변가이드 만남 위치", text: message, url: location.href });
    else await navigator.clipboard.writeText(message);
    result.hidden = false;
    result.textContent = navigator.share ? "공유 창을 열었어요." : "만남 위치와 지도 링크를 복사했어요.";
  } catch (error) {
    if (error.name !== "AbortError") { result.hidden = false; result.textContent = "공유하지 못했어요. 다시 시도해 주세요."; }
  }
}

function registerReport(event) {
  event.preventDefault();
  const name = document.querySelector("#childName").value.trim();
  const description = document.querySelector("#childDescription").value.trim();
  reports = reports.filter((report) => report.grid !== selected);
  reports.push({ grid: selected, name, description, createdAt: new Date().toISOString() });
  saveReports(); renderGrid(); renderSearchOverlays();
  document.querySelector("#reportResult").hidden = false;
  document.querySelector("#reportResult").textContent = `${addressText()}이 지도에서 빨간색으로 표시됐어요. 이 신고는 현재 이 기기에서만 저장됩니다.`;
  setNotice(`수색 표시를 ${addressText()}에 등록했어요. 112 또는 현장 안전요원에게도 알려주세요.`);
  event.target.reset();
}

function initKakaoMap() {
  if (!window.kakao || !window.kakao.maps) return;
  window.kakao.maps.load(() => {
    const mapElement = document.querySelector("#kakaoMap");
    Object.assign(mapElement.style, { position: "absolute", inset: "0", zIndex: "0", pointerEvents: "none" });
    const map = new window.kakao.maps.Map(mapElement, { center: new window.kakao.maps.LatLng(HAEUNDAE.lat, HAEUNDAE.lng), level: 4 });
    kakaoMap = map;
    const bounds = new window.kakao.maps.LatLngBounds();
    beachBoundary.forEach(([lat, lng]) => bounds.extend(new window.kakao.maps.LatLng(lat, lng)));
    map.setBounds(bounds);
    new window.kakao.maps.Polygon({ map, path: beachBoundary.map(([lat, lng]) => new window.kakao.maps.LatLng(lat, lng)), strokeWeight: 3, strokeColor: "#0e7088", strokeOpacity: 0.9, fillColor: "#80d8d4", fillOpacity: 0.13 });
    renderGeographicGrid(map);
    renderFacilities();
    loadWeather();
    document.querySelector("#mapFallback").style.display = "none";
  });
}

document.querySelector("#reportForm").addEventListener("submit", registerReport);
document.querySelector("#locateMe").addEventListener("click", locateMe);
document.querySelector("#startGuide").addEventListener("click", () => setGuideVisible(false));
document.querySelector("#openGuide").addEventListener("click", () => setGuideVisible(true));
document.querySelector("#shareMeeting").addEventListener("click", shareMeeting);
document.querySelector("#beachSelect").addEventListener("change", changeBeach);
document.querySelector("#toggleFacilities").addEventListener("click", (event) => { facilitiesVisible = !facilitiesVisible; event.currentTarget.classList.toggle("active", facilitiesVisible); event.currentTarget.innerHTML = `${facilitiesVisible ? "지도에서 시설 숨기기" : "지도에서 시설 보기"} <span>›</span>`; renderFacilities(); });
document.querySelector("#toggleDeck").addEventListener("click", (event) => { deckVisible = !deckVisible; event.currentTarget.classList.toggle("active", deckVisible); event.currentTarget.innerHTML = `${deckVisible ? "데크길 숨기기" : "데크길 표시하기"} <span>›</span>`; renderFacilities(); });
document.querySelector("#copyAddress").addEventListener("click", async () => { await navigator.clipboard.writeText(`해운대해수욕장 ${addressText()}`); setNotice(`${addressText()} 주소를 복사했어요.`); });
if (localStorage.getItem("haeundae-beach-guide-intro-seen")) setGuideVisible(false);
renderGrid(); renderFacilities(); updateAddress(); loadWeather(); loadTide(); initKakaoMap();
