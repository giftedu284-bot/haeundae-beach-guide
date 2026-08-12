const HAEUNDAE = { lat: 35.1587, lng: 129.1604 };
const rows = ["A", "B", "C", "D", "E", "F", "G"];
const columns = Array.from({ length: 12 }, (_, i) => i + 1);
const storageKey = "haeundae-beach-guide-reports";
let selected = "6-D";
let reports = JSON.parse(localStorage.getItem(storageKey) || "[]");
let facilitiesVisible = true;
let deckVisible = false;

const facilities = [
  { icon: "♿", name: "휠체어 경사로", detail: "관광안내소 앞", x: "18%", y: "35%" },
  { icon: "WC", name: "장애인 화장실", detail: "해변 중앙", x: "50%", y: "67%" },
  { icon: "↗", name: "접근 가능한 출입구", detail: "해운대역 방면", x: "80%", y: "27%" }
];

function addressText() { return `${selected} 구역`; }
function saveReports() { localStorage.setItem(storageKey, JSON.stringify(reports)); }
function reportAt(address) { return reports.find((report) => report.grid === address); }

function renderGrid() {
  const grid = document.querySelector("#beachGrid");
  grid.innerHTML = "";
  rows.forEach((row) => columns.forEach((column) => {
    const address = `${column}-${row}`;
    const report = reportAt(address);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `cell${selected === address ? " selected" : ""}${report ? " alert" : ""}`;
    button.setAttribute("aria-label", `${address} 구역 선택`);
    button.innerHTML = report ? "!" : `<span>${column}</span><b>${row}</b>`;
    button.addEventListener("click", () => selectAddress(address));
    grid.appendChild(button);
  }));
}

function renderFacilities() {
  const layer = document.querySelector("#facilityLayer");
  layer.innerHTML = "";
  if (!facilitiesVisible) return;
  if (deckVisible) { const deck = document.createElement("div"); deck.className = "deck-path"; layer.appendChild(deck); }
  facilities.forEach((facility) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "facility";
    button.style.left = facility.x; button.style.top = facility.y;
    button.innerHTML = `<span>${facility.icon}</span><i>${facility.name}</i>`;
    button.addEventListener("click", () => setNotice(`${facility.name}: ${facility.detail}`));
    layer.appendChild(button);
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
    const map = new window.kakao.maps.Map(document.querySelector("#map"), { center: new window.kakao.maps.LatLng(HAEUNDAE.lat, HAEUNDAE.lng), level: 4 });
    new window.kakao.maps.Marker({ position: new window.kakao.maps.LatLng(HAEUNDAE.lat, HAEUNDAE.lng), map, title: "해운대해수욕장" });
    document.querySelector("#mapFallback").style.display = "none";
  });
}

document.querySelector("#reportForm").addEventListener("submit", registerReport);
document.querySelector("#toggleFacilities").addEventListener("click", (event) => { facilitiesVisible = !facilitiesVisible; event.currentTarget.classList.toggle("active", facilitiesVisible); event.currentTarget.innerHTML = `${facilitiesVisible ? "지도에서 시설 숨기기" : "지도에서 시설 보기"} <span>›</span>`; renderFacilities(); });
document.querySelector("#toggleDeck").addEventListener("click", (event) => { deckVisible = !deckVisible; event.currentTarget.classList.toggle("active", deckVisible); event.currentTarget.innerHTML = `${deckVisible ? "데크길 숨기기" : "데크길 표시하기"} <span>›</span>`; renderFacilities(); });
document.querySelector("#copyAddress").addEventListener("click", async () => { await navigator.clipboard.writeText(`해운대해수욕장 ${addressText()}`); setNotice(`${addressText()} 주소를 복사했어요.`); });
renderGrid(); renderFacilities(); updateAddress(); initKakaoMap();
