const HAEUNDAE = { lat: 35.1587, lng: 129.1604 };
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
const storageKey = "haeundae-beach-guide-reports";
let selected = "6-D";
let reports = JSON.parse(localStorage.getItem(storageKey) || "[]");
let facilitiesVisible = true;
let deckVisible = false;
const geoFacilities = [
  { title: "휠체어 경사로 (시범 위치)", lat: 35.15828, lng: 129.15850 },
  { title: "장애인 화장실 (시범 위치)", lat: 35.15932, lng: 129.16320 },
  { title: "접근 가능한 출입구 (시범 위치)", lat: 35.15873, lng: 129.16820 }
];
let facilityMarkers = [];
let deckLine;

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
function distance(a, b) { return Math.hypot(b.u - a.u, b.v - a.v); }
function pathLength(path) { return path.slice(1).reduce((total, point, index) => total + distance(path[index], point), 0); }
function pointAlong(path, distanceFromStart) {
  let travelled = 0;
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1], end = path[index], segment = distance(start, end);
    if (travelled + segment >= distanceFromStart) {
      const ratio = segment ? (distanceFromStart - travelled) / segment : 0;
      return { u: start.u + (end.u - start.u) * ratio, v: start.v + (end.v - start.v) * ratio };
    }
    travelled += segment;
  }
  return path[path.length - 1];
}
function pointBetween(a, b, ratio) { return { u: a.u + (b.u - a.u) * ratio, v: a.v + (b.v - a.v) * ratio }; }
// Boundary order is promenade from west→east, then waterline east→west.
// The polygon starts part-way along the promenade, so join its final section
// to the initial section before sampling the full land-side edge.
const landEdge = [...beachBoundary.slice(26), ...beachBoundary.slice(0, 12)].map(([lat, lng]) => toLocal(lat, lng));
const seaEdge = beachBoundary.slice(12, 26).reverse().map(([lat, lng]) => toLocal(lat, lng));
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
  const alongLength = Math.min(pathLength(landEdge), pathLength(seaEdge));
  const alongSections = Math.floor(alongLength / 10);
  let count = 0;
  for (let column = 0; column < alongSections; column++) {
    const landStart = pointAlong(landEdge, column * 10);
    const landEnd = pointAlong(landEdge, (column + 1) * 10);
    const seaStart = pointAlong(seaEdge, column * 10);
    const seaEnd = pointAlong(seaEdge, (column + 1) * 10);
    const acrossSections = Math.max(1, Math.round((distance(landStart, seaStart) + distance(landEnd, seaEnd)) / 20));
    for (let row = 0; row < acrossSections; row++) {
      const startRatio = row / acrossSections, endRatio = (row + 1) / acrossSections;
      const localPath = [
        pointBetween(landStart, seaStart, startRatio), pointBetween(landEnd, seaEnd, startRatio),
        pointBetween(landEnd, seaEnd, endRatio), pointBetween(landStart, seaStart, endRatio)
      ];
      const address = `${column + 1}-${letterLabel(row)}`;
      const polygon = new window.kakao.maps.Polygon({
        map,
        path: localPath.map(({ u, v }) => { const { lat, lng } = toLatLng(u, v); return new window.kakao.maps.LatLng(lat, lng); }),
        strokeWeight: 1, strokeColor: "#237a8b", strokeOpacity: 0.72, fillColor: "#70d1d2", fillOpacity: 0.08
      });
      window.kakao.maps.event.addListener(polygon, "click", () => selectGeoCell(address, polygon));
      geoGrid.set(address, { polygon, localPath });
      count++;
    }
  }
  setNotice(`해안선과 산책로 경계를 따라 ${count.toLocaleString()}개의 약 10m 격자를 만들었어요.`);
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
  if (!facilitiesVisible) return;
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
    const marker = new window.kakao.maps.Marker({ map: kakaoMap, position: new window.kakao.maps.LatLng(facility.lat, facility.lng), title: facility.title });
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
function setGuideVisible(visible) {
  document.querySelector("#guideModal").hidden = !visible;
  if (!visible) localStorage.setItem("haeundae-beach-guide-intro-seen", "true");
}

function registerReport(event) {
  event.preventDefault();
  const name = document.querySelector("#childName").value.trim();
  const description = document.querySelector("#childDescription").value.trim();
  reports = reports.filter((report) => report.grid !== selected);
  reports.push({ grid: selected, name, description, createdAt: new Date().toISOString() });
  saveReports(); renderGrid(); setNotice(`긴급 수색 알림을 ${addressText()}에 등록했어요. 112 또는 현장 안전요원에게도 알려주세요.`);
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
    document.querySelector("#mapFallback").style.display = "none";
  });
}

document.querySelector("#reportForm").addEventListener("submit", registerReport);
document.querySelector("#locateMe").addEventListener("click", locateMe);
document.querySelector("#startGuide").addEventListener("click", () => setGuideVisible(false));
document.querySelector("#openGuide").addEventListener("click", () => setGuideVisible(true));
document.querySelector("#toggleFacilities").addEventListener("click", (event) => { facilitiesVisible = !facilitiesVisible; event.currentTarget.classList.toggle("active", facilitiesVisible); event.currentTarget.innerHTML = `${facilitiesVisible ? "지도에서 시설 숨기기" : "지도에서 시설 보기"} <span>›</span>`; renderFacilities(); });
document.querySelector("#toggleDeck").addEventListener("click", (event) => { deckVisible = !deckVisible; event.currentTarget.classList.toggle("active", deckVisible); event.currentTarget.innerHTML = `${deckVisible ? "데크길 숨기기" : "데크길 표시하기"} <span>›</span>`; renderFacilities(); });
document.querySelector("#copyAddress").addEventListener("click", async () => { await navigator.clipboard.writeText(`해운대해수욕장 ${addressText()}`); setNotice(`${addressText()} 주소를 복사했어요.`); });
if (localStorage.getItem("haeundae-beach-guide-intro-seen")) setGuideVisible(false);
renderGrid(); renderFacilities(); updateAddress(); initKakaoMap();
