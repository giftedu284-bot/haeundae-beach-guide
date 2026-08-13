// Guided missing-child search helper inspired by the tester's five-step flow.
// This does not transmit a police report. It organizes last-seen information,
// marks the map, and prepares a shareable summary for 112 / on-site safety staff.
(() => {
  const state = {
    lastSeenPoint: null,
    lastSeenLabel: "",
    minutesAgo: 5,
    customTime: "",
    mapPickMode: false,
    reporterPoint: null,
    lastSeenOverlay: null,
    reporterOverlay: null,
    lastSeenCircle: null,
    reporterCircle: null,
    summaryText: ""
  };

  function beachName() {
    return document.querySelector("#beachSelect")?.selectedOptions?.[0]?.textContent?.split(" · ")[0] || "선택한 해변";
  }

  function currentDisplayedLocation() {
    const label = document.querySelector("#reportAddress")?.textContent?.trim()
      || document.querySelector("#selectedAddress")?.textContent?.replace(/\s+/g, " ").trim()
      || "현재 선택 위치";
    if (!window.kakaoMap) return { label, point: null };
    const center = kakaoMap.getCenter();
    return { label, point: { lat: center.getLat(), lng: center.getLng() } };
  }

  function formatPoint(point) {
    return point ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` : "좌표 확인 중";
  }

  function lastSeenTimeText() {
    if (state.customTime) {
      const date = new Date(state.customTime);
      if (!Number.isNaN(date.getTime())) {
        return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      }
    }
    if (state.minutesAgo === 0) return "방금 전";
    return `${state.minutesAgo}분 전`;
  }

  function addStyles() {
    if (document.querySelector("#missingChildFlowStyles")) return;
    const style = document.createElement("style");
    style.id = "missingChildFlowStyles";
    style.textContent = `
      .missing-child-group{background:#fffdfb!important;border-color:#e8c7bd!important}
      .missing-flow-intro{margin:0 0 12px;padding:12px;border-radius:12px;background:#fff3ef;color:#6b4a43;font-size:11px;line-height:1.55}
      .missing-steps{display:grid;gap:12px}
      .missing-step{padding:13px;border:1px solid #e3e9eb;border-radius:13px;background:#fff}
      .missing-step-head{display:flex;align-items:center;gap:9px;margin-bottom:10px}
      .missing-step-no{width:25px;height:25px;border-radius:50%;display:grid;place-items:center;background:#103f69;color:#fff;font-weight:800;font-size:12px;flex:0 0 auto}
      .missing-step-head strong{font-size:13px;color:#12364b}
      .missing-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      .missing-choice,.missing-time-btn{border:1px solid #bcd5df;background:#f8fcfd;color:#16455a;border-radius:9px;padding:10px 8px;font-weight:700;font-size:11px;cursor:pointer}
      .missing-choice.active,.missing-time-btn.active{background:#123f69;color:#fff;border-color:#123f69}
      .missing-location-state{margin:9px 0 0;padding:9px;border-radius:8px;background:#f3f7f8;color:#526c76;font-size:10px;line-height:1.5}
      .missing-time-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
      .missing-custom-time{display:block;margin-top:8px;width:100%;box-sizing:border-box;border:1px solid #cad9df;border-radius:9px;padding:9px;background:#fff;font:inherit}
      .missing-field{display:block;margin-top:9px;color:#284c5c;font-size:10px;font-weight:700}
      .missing-field select,.missing-field input,.missing-field textarea{display:block;width:100%;box-sizing:border-box;margin-top:5px;border:1px solid #cad9df;border-radius:9px;padding:9px;background:#fff;font:inherit;color:#173847}
      .missing-field textarea{min-height:62px;resize:vertical}
      .missing-hat{display:flex;gap:7px;margin-top:5px}
      .missing-hat label{flex:1;border:1px solid #cad9df;border-radius:9px;padding:8px;text-align:center;font-size:11px;background:#fff;cursor:pointer}
      .missing-review{padding:10px;border-radius:9px;background:#f7fafb;color:#536d77;font-size:10px;line-height:1.6}
      .missing-submit{width:100%;margin-top:10px;border:0;border-radius:10px;padding:12px;background:#e54843;color:#fff;font-weight:800;cursor:pointer}
      .missing-emergency-links{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}
      .missing-emergency-links a{display:block;text-align:center;text-decoration:none;padding:10px;border-radius:9px;font-weight:800;font-size:11px;background:#fff;border:1px solid #e6b0aa;color:#b72924}
      .missing-complete{margin-top:12px;padding:12px;border-radius:12px;background:#f1f8ff;border:1px solid #bdd8ef}
      .missing-complete[hidden]{display:none!important}
      .missing-complete strong{display:block;color:#123f69;font-size:13px}
      .missing-complete p{margin:6px 0;color:#526c76;font-size:10px;line-height:1.55}
      .missing-map-legend{display:flex;gap:12px;margin:9px 0;font-size:10px;color:#526c76}
      .missing-map-legend span::before{content:"";display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
      .missing-map-legend .last::before{background:#e54843}.missing-map-legend .reporter::before{background:#2375c4}
      .missing-share{width:100%;border:1px solid #8ab9dc;background:#fff;color:#185889;border-radius:9px;padding:10px;font-weight:800;cursor:pointer}
      .missing-warning{margin:9px 0 0;color:#8a6259;font-size:9px;line-height:1.5}
      @media(max-width:520px){.missing-actions{grid-template-columns:1fr}.missing-time-grid{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(style);
  }

  function renderFlow() {
    const group = document.querySelector(".missing-child-group");
    if (!group) return null;
    group.innerHTML = `
      <section class="emergency-card">
        <p class="tag">MISSING CHILD · SEARCH GUIDE</p>
        <h3 id="missingChildTitle">미아 찾기는 이렇게 진행해요</h3>
        <p>마지막 목격 위치와 시간을 빠르게 정리해 지도에 표시하고, 112 또는 현장 안전요원에게 바로 공유할 수 있게 도와줍니다.</p>
        <div><a href="tel:112">112 경찰 신고</a><a href="tel:119">119 구조 요청</a></div>
      </section>
      <p class="missing-flow-intro">이 기능은 신고를 자동 접수하지 않습니다. 긴급 상황에서는 먼저 112 또는 현장 안전요원에게 알리고, 아래 정보와 위치를 함께 전달하세요.</p>
      <form id="reportForm" class="report-card missing-steps">
        <section class="missing-step">
          <div class="missing-step-head"><span class="missing-step-no">1</span><strong>마지막 발견 위치 선택</strong></div>
          <div class="missing-actions">
            <button id="missingUseCurrent" class="missing-choice" type="button">현재 위치 사용</button>
            <button id="missingPickMap" class="missing-choice" type="button">지도에서 직접 선택</button>
          </div>
          <p id="missingLocationState" class="missing-location-state">아직 마지막 목격 위치를 선택하지 않았어요.</p>
          <div class="report-location"><span>마지막 목격 위치</span><b id="reportAddress">위치 선택 필요</b></div>
        </section>
        <section class="missing-step">
          <div class="missing-step-head"><span class="missing-step-no">2</span><strong>마지막으로 본 시간</strong></div>
          <div class="missing-time-grid">
            <button class="missing-time-btn" type="button" data-minutes="0">방금 전</button>
            <button class="missing-time-btn active" type="button" data-minutes="5">5분 전</button>
            <button class="missing-time-btn" type="button" data-minutes="10">10분 전</button>
            <button class="missing-time-btn" type="button" data-minutes="30">30분 전</button>
          </div>
          <label class="missing-field">직접 입력<input id="missingCustomTime" class="missing-custom-time" type="datetime-local" /></label>
        </section>
        <section class="missing-step">
          <div class="missing-step-head"><span class="missing-step-no">3</span><strong>아이 정보 입력</strong></div>
          <label class="missing-field">이름 또는 부르는 이름 (선택)<input id="childName" placeholder="예: 민준" /></label>
          <label class="missing-field">옷 색상<select id="childClothesColor" required><option value="">선택해 주세요</option><option>빨간색</option><option>주황색</option><option>노란색</option><option>초록색</option><option>파란색</option><option>보라색</option><option>검정색</option><option>흰색</option><option>회색</option><option>기타/여러 색</option></select></label>
          <div class="missing-field">모자 착용 여부<div class="missing-hat"><label><input type="radio" name="missingHat" value="착용" required /> 착용</label><label><input type="radio" name="missingHat" value="미착용" /> 미착용</label><label><input type="radio" name="missingHat" value="모름" /> 모름</label></div></div>
          <label class="missing-field">기타 특징<textarea id="childDescription" required placeholder="예: 노란 반바지, 검정 샌들, 키 약 120cm"></textarea></label>
        </section>
        <section class="missing-step">
          <div class="missing-step-head"><span class="missing-step-no">4</span><strong>정보 확인 및 위치 표시</strong></div>
          <div id="missingReview" class="missing-review">위치와 아이 정보를 입력하면 여기에 한 번에 정리됩니다.</div>
          <button class="missing-submit report-button" type="submit">미아 정보 정리 · 지도에 표시</button>
          <div class="missing-emergency-links"><a href="tel:112">112에 전화하기</a><a href="tel:119">119 구조 요청</a></div>
          <p class="missing-warning">버튼을 눌러도 경찰·소방에 자동 신고되지는 않습니다.</p>
          <p id="reportResult" class="report-result" role="status" hidden></p>
        </section>
        <section id="missingComplete" class="missing-complete" hidden>
          <div class="missing-step-head"><span class="missing-step-no">5</span><strong>위치 확인 · 안전요원에게 공유</strong></div>
          <p id="missingCompleteText"></p>
          <div class="missing-map-legend"><span class="last">마지막 목격 위치</span><span class="reporter">현재 신고자 위치</span></div>
          <button id="missingShare" class="missing-share" type="button">안전요원에게 위치·특징 공유</button>
        </section>
      </form>
    `;
    return group;
  }

  function setLocation(point, label) {
    state.lastSeenPoint = point;
    state.lastSeenLabel = label;
    state.mapPickMode = false;
    document.querySelector("#missingUseCurrent")?.classList.toggle("active", label.includes("현재 위치"));
    document.querySelector("#missingPickMap")?.classList.toggle("active", label.includes("지도"));
    const stateEl = document.querySelector("#missingLocationState");
    const reportAddress = document.querySelector("#reportAddress");
    if (stateEl) stateEl.textContent = `${label} · ${formatPoint(point)}`;
    if (reportAddress) reportAddress.textContent = `${beachName()} · ${label}`;
    updateReview();
  }

  function updateReview() {
    const review = document.querySelector("#missingReview");
    if (!review) return;
    const color = document.querySelector("#childClothesColor")?.value || "미입력";
    const hat = document.querySelector('input[name="missingHat"]:checked')?.value || "미입력";
    const details = document.querySelector("#childDescription")?.value.trim() || "미입력";
    const name = document.querySelector("#childName")?.value.trim();
    review.innerHTML = `<b>마지막 위치</b> ${state.lastSeenLabel || "미선택"}<br><b>마지막 목격</b> ${lastSeenTimeText()}<br><b>아이 정보</b> ${name ? `${name} · ` : ""}${color} 옷 · 모자 ${hat}<br><b>기타 특징</b> ${details}`;
  }

  function makeDotOverlay(point, color, text) {
    const content = document.createElement("div");
    content.style.cssText = `display:flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;background:#fff;border:2px solid ${color};box-shadow:0 2px 8px #0002;font-size:10px;font-weight:800;color:#173847;white-space:nowrap`;
    content.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color}"></span>${text}`;
    return new window.kakao.maps.CustomOverlay({ map: kakaoMap, position: new window.kakao.maps.LatLng(point.lat, point.lng), yAnchor: 1.4, content });
  }

  function markFinalPositions() {
    if (!kakaoMap || !state.lastSeenPoint) return;
    [state.lastSeenOverlay, state.reporterOverlay, state.lastSeenCircle, state.reporterCircle].forEach((item) => item?.setMap(null));
    state.lastSeenOverlay = makeDotOverlay(state.lastSeenPoint, "#e54843", "마지막 목격");
    state.lastSeenCircle = new window.kakao.maps.Circle({ map: kakaoMap, center: new window.kakao.maps.LatLng(state.lastSeenPoint.lat, state.lastSeenPoint.lng), radius: 25, strokeWeight: 2, strokeColor: "#e54843", strokeOpacity: .9, strokeStyle: "shortdash", fillColor: "#e54843", fillOpacity: .08 });
    if (state.reporterPoint) {
      state.reporterOverlay = makeDotOverlay(state.reporterPoint, "#2375c4", "현재 위치");
      state.reporterCircle = new window.kakao.maps.Circle({ map: kakaoMap, center: new window.kakao.maps.LatLng(state.reporterPoint.lat, state.reporterPoint.lng), radius: 12, strokeWeight: 2, strokeColor: "#2375c4", strokeOpacity: .9, fillColor: "#2375c4", fillOpacity: .08 });
    }
    kakaoMap.panTo(new window.kakao.maps.LatLng(state.lastSeenPoint.lat, state.lastSeenPoint.lng));
  }

  function getReporterLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }), () => resolve(null), { enableHighAccuracy: true, timeout: 6000, maximumAge: 15000 });
    });
  }

  function buildSummary() {
    const color = document.querySelector("#childClothesColor")?.value || "미입력";
    const hat = document.querySelector('input[name="missingHat"]:checked')?.value || "미입력";
    const details = document.querySelector("#childDescription")?.value.trim() || "미입력";
    const name = document.querySelector("#childName")?.value.trim();
    return `[미아 수색 보조 정보]\n해변: ${beachName()}\n마지막 목격 위치: ${state.lastSeenLabel} (${formatPoint(state.lastSeenPoint)})\n마지막 목격 시간: ${lastSeenTimeText()}\n아이: ${name || "이름 미입력"}\n옷 색상: ${color}\n모자: ${hat}\n기타 특징: ${details}${state.reporterPoint ? `\n현재 신고자 위치: ${formatPoint(state.reporterPoint)}` : ""}\n지도: ${location.href}\n※ 이 메시지는 앱에서 정리한 수색 보조 정보이며 자동 신고가 아닙니다.`;
  }

  async function submitFlow(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!state.lastSeenPoint) {
      const result = document.querySelector("#reportResult");
      result.hidden = false;
      result.textContent = "먼저 마지막 목격 위치를 선택해 주세요.";
      return;
    }
    if (!event.currentTarget.reportValidity()) return;
    state.reporterPoint = await getReporterLocation();
    state.summaryText = buildSummary();
    markFinalPositions();
    const complete = document.querySelector("#missingComplete");
    const text = document.querySelector("#missingCompleteText");
    if (complete) complete.hidden = false;
    if (text) text.textContent = `${beachName()}의 마지막 목격 위치를 빨간색으로 표시했습니다.${state.reporterPoint ? " 현재 신고자 위치는 파란색으로 함께 표시했습니다." : " 현재 위치 권한을 받지 못해 신고자 위치는 표시하지 않았습니다."}`;
    const result = document.querySelector("#reportResult");
    if (result) { result.hidden = false; result.textContent = "정보 정리가 완료됐어요. 아래 공유 버튼으로 안전요원에게 전달하거나 112에 전화해 주세요."; }
    setNotice("미아 마지막 목격 위치를 지도에 표시했어요. 112 또는 현장 안전요원에게 위치·시간·특징을 바로 전달하세요.");
    complete?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function shareSummary() {
    if (!state.summaryText) state.summaryText = buildSummary();
    try {
      if (navigator.share) await navigator.share({ title: "미아 수색 보조 정보", text: state.summaryText, url: location.href });
      else await navigator.clipboard.writeText(state.summaryText);
      const result = document.querySelector("#reportResult");
      if (result) { result.hidden = false; result.textContent = navigator.share ? "공유 창을 열었어요." : "수색 보조 정보를 복사했어요."; }
    } catch (error) {
      if (error.name !== "AbortError") {
        const result = document.querySelector("#reportResult");
        if (result) { result.hidden = false; result.textContent = "공유하지 못했어요. 다시 시도해 주세요."; }
      }
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) return;
    const status = document.querySelector("#missingLocationState");
    if (status) status.textContent = "현재 GPS 위치를 확인하고 있어요…";
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const point = { lat: coords.latitude, lng: coords.longitude };
      setLocation(point, "현재 위치 사용");
      if (kakaoMap) kakaoMap.panTo(new window.kakao.maps.LatLng(point.lat, point.lng));
    }, () => {
      if (status) status.textContent = "위치 권한을 허용하거나 '지도에서 직접 선택'을 사용해 주세요.";
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
  }

  function startMapPick() {
    state.mapPickMode = true;
    document.querySelector("#missingPickMap")?.classList.add("active");
    document.querySelector("#missingUseCurrent")?.classList.remove("active");
    const status = document.querySelector("#missingLocationState");
    if (status) status.textContent = "왼쪽 지도에서 마지막으로 본 위치를 한 번 눌러 주세요.";
    setNotice("미아를 마지막으로 본 위치를 지도에서 눌러 주세요.");
  }

  function init() {
    addStyles();
    renderFlow();
    const form = document.querySelector("#reportForm");
    form?.addEventListener("submit", submitFlow, true);
    document.querySelector("#missingUseCurrent")?.addEventListener("click", useCurrentLocation);
    document.querySelector("#missingPickMap")?.addEventListener("click", startMapPick);
    document.querySelectorAll(".missing-time-btn").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll(".missing-time-btn").forEach((item) => item.classList.toggle("active", item === button));
      state.minutesAgo = Number(button.dataset.minutes || 0);
      state.customTime = "";
      const custom = document.querySelector("#missingCustomTime");
      if (custom) custom.value = "";
      updateReview();
    }));
    document.querySelector("#missingCustomTime")?.addEventListener("input", (event) => {
      state.customTime = event.target.value;
      document.querySelectorAll(".missing-time-btn").forEach((item) => item.classList.remove("active"));
      updateReview();
    });
    ["#childName", "#childClothesColor", "#childDescription"].forEach((selector) => document.querySelector(selector)?.addEventListener("input", updateReview));
    document.querySelectorAll('input[name="missingHat"]').forEach((radio) => radio.addEventListener("change", updateReview));
    document.querySelector("#missingShare")?.addEventListener("click", shareSummary);

    const existing = currentDisplayedLocation();
    if (existing.point) setLocation(existing.point, existing.label);

    if (window.kakaoMap && window.kakao?.maps) {
      window.kakao.maps.event.addListener(kakaoMap, "click", (mouseEvent) => {
        if (!state.mapPickMode) return;
        const point = { lat: mouseEvent.latLng.getLat(), lng: mouseEvent.latLng.getLng() };
        setLocation(point, "지도에서 직접 선택");
      });
    }

    document.querySelector("#beachSelect")?.addEventListener("change", () => {
      state.lastSeenPoint = null;
      state.lastSeenLabel = "";
      state.reporterPoint = null;
      state.summaryText = "";
      state.mapPickMode = false;
      [state.lastSeenOverlay, state.reporterOverlay, state.lastSeenCircle, state.reporterCircle].forEach((item) => item?.setMap(null));
      const complete = document.querySelector("#missingComplete");
      if (complete) complete.hidden = true;
      setTimeout(() => {
        const current = currentDisplayedLocation();
        if (current.point) setLocation(current.point, current.label);
      }, 120);
    });
  }

  if (document.readyState === "complete") init();
  else window.addEventListener("load", init, { once: true });
})();