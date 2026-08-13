// Missing-child workflow v4.
// IMPORTANT: records are stored only in this browser (localStorage).
// Final submit registers an in-app record; it does not contact police or any external server.
(() => {
  const PROFILE_KEY = "beachGuideMissingChildrenV3";
  const TIP_KEY = "beachGuideMissingTipsV3";
  const STATUS_OPTIONS = ["신고 접수", "수색 중", "수색 완료"];

  const state = {
    modalMode: "choice",
    draftType: null,
    draft: {},
    lastSubmitted: null
  };

  const esc = (value = "") => String(value).replace(/[&<>'"]/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  const beachName = () => document.querySelector("#beachSelect")?.selectedOptions?.[0]?.textContent?.split(" · ")[0] || "선택한 해변";
  const selectedZone = () => document.querySelector("#selectedAddress")?.textContent?.replace(/\s+/g, " ").trim() || "";

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); }
    catch { return []; }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function lastSeenLabel(draft = state.draft) {
    if (draft.lastSeenMode === "custom" && draft.lastSeenCustom) {
      const date = new Date(draft.lastSeenCustom);
      if (!Number.isNaN(date.getTime())) {
        return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      }
    }
    const minutes = Number(draft.lastSeenMinutes ?? 5);
    return minutes === 0 ? "방금 전" : `${minutes}분 전`;
  }

  function addStyles() {
    if (document.querySelector("#missingV3Styles")) return;
    const style = document.createElement("style");
    style.id = "missingV3Styles";
    style.textContent = `
      .missing-child-group{background:#fffdfb!important;border-color:#ecc7bd!important}
      .missing-v3-launch{width:100%;border:0;border-radius:13px;padding:14px;background:#e54843;color:#fff;font-weight:900;font-size:15px;cursor:pointer;box-shadow:0 4px 12px #e5484328}
      .missing-v3-note{margin:10px 0 0;color:#86645d;font-size:10px;line-height:1.55}
      .missing-v3-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:12px}
      .missing-v3-tab{border:1px solid #c8d8de;background:#fff;color:#355766;border-radius:9px;padding:9px;font-size:10px;font-weight:800;cursor:pointer}
      .missing-v3-tab.active{background:#123f69;color:#fff;border-color:#123f69}
      .missing-v3-pane[hidden]{display:none!important}
      .missing-v3-list{display:grid;gap:10px;margin-top:10px}
      .missing-v3-empty{padding:16px;border:1px dashed #cbd9de;border-radius:11px;background:#fff;color:#6f838b;text-align:center;font-size:10px;line-height:1.55}
      .missing-v3-profile{padding:12px;border:1px solid #dde6e9;border-radius:12px;background:#fff}
      .missing-v3-profile-head{display:flex;align-items:flex-start;gap:10px}
      .missing-v3-avatar{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#fff0ed;color:#c8342f;font-size:19px;font-weight:900;flex:0 0 auto}
      .missing-v3-profile h4{margin:0;color:#173b50;font-size:13px}.missing-v3-profile small{color:#758a92}.missing-v3-profile p{margin:7px 0 0;color:#566f79;font-size:10px;line-height:1.6}
      .missing-v3-status{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:10px;padding-top:10px;border-top:1px solid #edf1f2}
      .missing-v3-status button{border:1px solid #ccd9de;background:#f8fbfc;color:#61747c;border-radius:8px;padding:7px 4px;font-size:9px;font-weight:800;cursor:pointer}
      .missing-v3-status button.active[data-status="신고 접수"]{background:#fff1ef;color:#b8342f;border-color:#e7aaa5}
      .missing-v3-status button.active[data-status="수색 중"]{background:#fff8e8;color:#8c6418;border-color:#e7cf92}
      .missing-v3-status button.active[data-status="수색 완료"]{background:#eef9f2;color:#277044;border-color:#a8d4b7}
      .missing-v3-profile-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.missing-v3-profile-actions button{border:1px solid #c6d8df;background:#fff;color:#24556a;border-radius:8px;padding:8px;font-size:9px;font-weight:800;cursor:pointer}
      .missing-v3-count{display:inline-block;margin-left:4px;min-width:16px;padding:1px 5px;border-radius:999px;background:#e54843;color:#fff;font-size:9px}
      .missing-v3-overlay{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:16px;background:rgba(8,29,39,.48);backdrop-filter:blur(2px)}
      .missing-v3-overlay[hidden]{display:none!important}
      .missing-v3-modal{position:relative;width:min(430px,calc(100vw - 28px));max-height:min(82vh,720px);overflow:auto;box-sizing:border-box;border-radius:17px;background:#fff;box-shadow:0 18px 60px rgba(0,0,0,.3);padding:20px}
      .missing-v3-close{position:absolute;right:11px;top:11px;width:34px;height:34px;border:0;border-radius:50%;background:#f2f5f6;color:#284953;font-size:21px;line-height:1;cursor:pointer}
      .missing-v3-tag{margin:0 38px 5px 0;color:#d33b36;font-size:10px;font-weight:900;letter-spacing:.12em}
      .missing-v3-title{margin:0 38px 7px 0;color:#12384c;font-size:20px;line-height:1.35}.missing-v3-sub{margin:0 0 15px;color:#667b83;font-size:11px;line-height:1.55}
      .missing-v3-choice-grid{display:grid;gap:9px}.missing-v3-choice{border:1px solid #d6e0e4;border-radius:12px;background:#fff;padding:15px;text-align:left;cursor:pointer}.missing-v3-choice strong{display:block;color:#183f52;font-size:14px}.missing-v3-choice span{display:block;margin-top:4px;color:#6a7d84;font-size:10px;line-height:1.45}.missing-v3-choice.report{border-color:#efb1ad;background:#fff8f7}.missing-v3-choice.report strong{color:#c92f2a}.missing-v3-choice.tip{border-color:#b9d2df;background:#f8fcff}
      .missing-v3-form{display:grid;gap:11px}.missing-v3-field{display:block;color:#294e5e;font-size:10px;font-weight:900}.missing-v3-field input,.missing-v3-field textarea,.missing-v3-field select{display:block;width:100%;box-sizing:border-box;margin-top:5px;border:1px solid #cbd8dd;border-radius:9px;padding:10px;background:#fff;color:#173847;font:inherit}.missing-v3-field textarea{min-height:72px;resize:vertical}
      .missing-v3-gender{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:5px}.missing-v3-gender button{border:1px solid #cbd8dd;background:#fff;color:#365b6a;border-radius:9px;padding:10px;font-weight:800;cursor:pointer}.missing-v3-gender button.active{background:#123f69;color:#fff;border-color:#123f69}
      .missing-v3-time-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px}.missing-v3-time-btn{border:1px solid #cbd8dd;background:#fff;color:#365b6a;border-radius:9px;padding:9px 5px;font-weight:800;font-size:10px;cursor:pointer}.missing-v3-time-btn.active{background:#eaf4ff;color:#123f69;border-color:#9fc4e5;box-shadow:inset 0 0 0 1px #c7def2}.missing-v3-custom-time{margin-top:7px}.missing-v3-custom-time[hidden]{display:none!important}
      .missing-v3-zone-row{display:grid;grid-template-columns:1fr auto;gap:6px;align-items:end}.missing-v3-zone-use{border:1px solid #a9cad7;background:#f5fbfd;color:#1b596f;border-radius:8px;padding:10px 9px;font-size:9px;font-weight:800;cursor:pointer}
      .missing-v3-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:5px}.missing-v3-actions button,.missing-v3-actions a{box-sizing:border-box;border-radius:10px;padding:11px;text-align:center;text-decoration:none;font-weight:900;font-size:11px;cursor:pointer}.missing-v3-back{border:1px solid #cbd8dd;background:#fff;color:#47636e}.missing-v3-primary{border:0;background:#e54843;color:#fff}.missing-v3-tip-primary{border:0;background:#123f69;color:#fff}
      .missing-v3-review{display:grid;gap:7px;padding:12px;border-radius:11px;background:#f6f9fa}.missing-v3-review div{display:grid;grid-template-columns:82px 1fr;gap:8px;font-size:10px;line-height:1.55}.missing-v3-review b{color:#345563}.missing-v3-review span{color:#173847;overflow-wrap:anywhere}
      .missing-v3-success{text-align:center;padding:12px 2px}.missing-v3-success-mark{width:54px;height:54px;margin:0 auto 10px;border-radius:50%;display:grid;place-items:center;background:#eef8f1;color:#277044;font-size:25px;font-weight:900}.missing-v3-success h3{margin:0;color:#173b50;font-size:20px}.missing-v3-success p{color:#667c84;font-size:10px;line-height:1.6}.missing-v3-112{display:block;margin-top:12px;border-radius:10px;padding:12px;background:#123f69;color:#fff;text-decoration:none;font-weight:900;font-size:12px}.missing-v3-done{width:100%;margin-top:8px;border:1px solid #cbd8dd;border-radius:10px;padding:10px;background:#fff;color:#405f6b;font-weight:800;cursor:pointer}
      .missing-v3-disclaimer{margin:12px 0 0;padding:9px;border-radius:8px;background:#fff4f1;color:#825a52;font-size:9px;line-height:1.5}
      @media(max-width:520px){.missing-v3-modal{max-height:88vh;padding:17px}.missing-v3-actions{grid-template-columns:1fr}.missing-v3-status{grid-template-columns:1fr}.missing-v3-zone-row{grid-template-columns:1fr}.missing-v3-title{font-size:18px}.missing-v3-time-grid{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(style);
  }

  function renderShell() {
    const group = document.querySelector(".missing-child-group");
    if (!group) return;
    group.innerHTML = `
      <section class="emergency-card">
        <p class="tag">MISSING CHILD</p><h3 id="missingChildTitle">미아 신고·발견 제보</h3>
        <p>신고 또는 발견 제보를 선택해 필요한 정보를 앱 안에 정리할 수 있습니다.</p>
      </section>
      <button id="missingV3Launch" class="missing-v3-launch" type="button">🚨 신고·제보하기</button>
      <p class="missing-v3-note">실제 112 신고는 자동으로 이루어지지 않습니다. 필요할 때 사용자가 직접 112 신고 버튼을 눌러야 합니다.</p>
      <div class="missing-v3-tabs">
        <button class="missing-v3-tab active" type="button" data-pane="profiles">등록된 미아 <span id="missingV3Count" class="missing-v3-count">0</span></button>
        <button class="missing-v3-tab" type="button" data-pane="tips">발견 제보 기록</button>
      </div>
      <div id="missingV3ProfilesPane" class="missing-v3-pane"><div id="missingV3Profiles" class="missing-v3-list"></div></div>
      <div id="missingV3TipsPane" class="missing-v3-pane" hidden><div id="missingV3Tips" class="missing-v3-list"></div></div>
      <div id="missingV3Overlay" class="missing-v3-overlay" hidden aria-hidden="true">
        <section id="missingV3Modal" class="missing-v3-modal" role="dialog" aria-modal="true" aria-labelledby="missingV3ModalTitle">
          <button id="missingV3Close" class="missing-v3-close" type="button" aria-label="신고 창 닫기">×</button>
          <div id="missingV3ModalBody"></div>
        </section>
      </div>
    `;
  }

  function openModal() {
    state.modalMode = "choice";
    state.draftType = null;
    state.draft = {};
    state.lastSubmitted = null;
    const overlay = document.querySelector("#missingV3Overlay");
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    renderModal();
  }

  function closeModal() {
    const overlay = document.querySelector("#missingV3Overlay");
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    state.modalMode = "choice";
    state.draftType = null;
    state.draft = {};
    state.lastSubmitted = null;
  }

  function ageOptions(value) {
    let html = '<option value="">나이 선택</option>';
    for (let age = 0; age <= 18; age++) html += `<option value="${age}" ${String(value) === String(age) ? "selected" : ""}>${age}세</option>`;
    return html;
  }

  function choiceView() {
    return `
      <p class="missing-v3-tag">REPORT · TIP</p>
      <h2 id="missingV3ModalTitle" class="missing-v3-title">상황에 맞는 항목을 선택해주세요.</h2>
      <p class="missing-v3-sub">신고 또는 발견 제보 중 하나를 선택하면 같은 창에서 입력을 계속할 수 있습니다.</p>
      <div class="missing-v3-choice-grid">
        <button class="missing-v3-choice report" type="button" data-modal-action="choose-report"><strong>🚨 미아 신고</strong><span>아이의 이름·성별·나이·특징·마지막으로 본 구역과 시간을 입력합니다.</span></button>
        <button class="missing-v3-choice tip" type="button" data-modal-action="choose-tip"><strong>📍 발견 제보</strong><span>발견한 아이의 정보와 발견 구역을 입력합니다.</span></button>
      </div>
      <p class="missing-v3-disclaimer">X 버튼을 누르면 이 창이 닫히며, 아직 최종 제출하지 않은 정보는 저장되거나 등록되지 않습니다.</p>`;
  }

  function timeSelector(d) {
    const mode = d.lastSeenMode || "preset";
    const minutes = Number(d.lastSeenMinutes ?? 5);
    return `
      <div class="missing-v3-field">마지막으로 본 시간
        <div class="missing-v3-time-grid">
          <button class="missing-v3-time-btn ${mode === "preset" && minutes === 0 ? "active" : ""}" type="button" data-last-seen-minutes="0">방금 전</button>
          <button class="missing-v3-time-btn ${mode === "preset" && minutes === 5 ? "active" : ""}" type="button" data-last-seen-minutes="5">5분 전</button>
          <button class="missing-v3-time-btn ${mode === "preset" && minutes === 10 ? "active" : ""}" type="button" data-last-seen-minutes="10">10분 전</button>
          <button class="missing-v3-time-btn ${mode === "preset" && minutes === 30 ? "active" : ""}" type="button" data-last-seen-minutes="30">30분 전</button>
        </div>
        <button class="missing-v3-time-btn ${mode === "custom" ? "active" : ""}" style="width:100%;margin-top:6px" type="button" data-last-seen-custom-toggle="true">직접 입력</button>
        <input id="missingV3CustomTime" class="missing-v3-custom-time" type="datetime-local" value="${esc(d.lastSeenCustom || "")}" ${mode === "custom" ? "" : "hidden"} />
      </div>`;
  }

  function formView(type) {
    const isReport = type === "report";
    const d = state.draft;
    const zoneLabel = isReport ? "마지막으로 본 구역" : "발견 구역";
    const submitLabel = isReport ? "신고하기" : "제보하기";
    return `
      <p class="missing-v3-tag">${isReport ? "MISSING REPORT" : "FOUND TIP"}</p>
      <h2 id="missingV3ModalTitle" class="missing-v3-title">${isReport ? "미아 신고 정보 입력" : "발견 제보 정보 입력"}</h2>
      <p class="missing-v3-sub">아래 정보를 확인 가능한 범위에서 입력해주세요.</p>
      <form id="missingV3Form" class="missing-v3-form">
        <label class="missing-v3-field">이름<input id="missingV3Name" required value="${esc(d.name || "")}" placeholder="예: 김민준" /></label>
        <div class="missing-v3-field">성별<div class="missing-v3-gender"><button type="button" data-gender="남자" class="${d.gender === "남자" ? "active" : ""}">남자</button><button type="button" data-gender="여자" class="${d.gender === "여자" ? "active" : ""}">여자</button></div></div>
        <label class="missing-v3-field">나이<select id="missingV3Age" required>${ageOptions(d.age)}</select></label>
        <label class="missing-v3-field">특징<textarea id="missingV3Features" required placeholder="예: 노란 티셔츠, 파란 모자, 검정 샌들">${esc(d.features || "")}</textarea></label>
        ${isReport ? timeSelector(d) : ""}
        <div class="missing-v3-field">${zoneLabel}<div class="missing-v3-zone-row"><input id="missingV3Zone" required value="${esc(d.zone || "")}" placeholder="예: HD-A1 구역" /><button id="missingV3UseZone" class="missing-v3-zone-use" type="button">현재 선택 구역 사용</button></div></div>
        <div class="missing-v3-actions"><button class="missing-v3-back" type="button" data-modal-action="back-choice">이전</button><button class="${isReport ? "missing-v3-primary" : "missing-v3-tip-primary"}" type="submit">${submitLabel}</button></div>
      </form>`;
  }

  function reviewView(type) {
    const isReport = type === "report";
    const d = state.draft;
    return `
      <p class="missing-v3-tag">FINAL CHECK</p>
      <h2 id="missingV3ModalTitle" class="missing-v3-title">최종 확인</h2>
      <p class="missing-v3-sub">아래 정보가 맞는지 확인해주세요. 아직 접수되지 않았습니다.</p>
      <div class="missing-v3-review">
        <div><b>구분</b><span>${isReport ? "미아 신고" : "발견 제보"}</span></div>
        <div><b>이름</b><span>${esc(d.name)}</span></div>
        <div><b>성별</b><span>${esc(d.gender)}</span></div>
        <div><b>나이</b><span>${esc(d.age)}세</span></div>
        <div><b>특징</b><span>${esc(d.features)}</span></div>
        ${isReport ? `<div><b>마지막 목격</b><span>${esc(lastSeenLabel(d))}</span></div>` : ""}
        <div><b>${isReport ? "마지막 구역" : "발견 구역"}</b><span>${esc(d.zone)}</span></div>
        <div><b>해변</b><span>${esc(beachName())}</span></div>
      </div>
      <div class="missing-v3-actions"><button class="missing-v3-back" type="button" data-modal-action="back-form">취소하기</button><button class="${isReport ? "missing-v3-primary" : "missing-v3-tip-primary"}" type="button" data-modal-action="final-submit">${isReport ? "신고하기" : "제보하기"}</button></div>
      <p class="missing-v3-disclaimer">최종 ${isReport ? "신고하기" : "제보하기"} 버튼을 눌러야 앱 내부 기록이 생성됩니다. 취소하기를 누르면 입력 화면으로 돌아가며 작성 내용은 유지됩니다.</p>`;
  }

  function successView(type) {
    return `
      <div class="missing-v3-success">
        <div class="missing-v3-success-mark">✓</div>
        <h3 id="missingV3ModalTitle">접수되었습니다.</h3>
        <p>${type === "report" ? "미아 신고 정보가 앱 내부의 등록된 미아 목록에 저장되었습니다." : "발견 제보 정보가 앱 내부의 발견 제보 기록에 저장되었습니다."}<br>이 기록은 현재 브라우저에만 저장되며 경찰에 자동 전송되지 않습니다.</p>
        <a class="missing-v3-112" href="tel:112">112 경찰 신고 전화 연결</a>
        <button class="missing-v3-done" type="button" data-modal-action="done">닫기</button>
      </div>`;
  }

  function renderModal() {
    const body = document.querySelector("#missingV3ModalBody");
    if (!body) return;
    if (state.modalMode === "choice") body.innerHTML = choiceView();
    else if (state.modalMode === "form") body.innerHTML = formView(state.draftType);
    else if (state.modalMode === "review") body.innerHTML = reviewView(state.draftType);
    else body.innerHTML = successView(state.draftType);
    bindModalControls();
  }

  function captureForm() {
    const previous = { ...state.draft };
    state.draft = {
      ...previous,
      name: document.querySelector("#missingV3Name")?.value.trim() || "",
      gender: state.draft.gender || "",
      age: document.querySelector("#missingV3Age")?.value || "",
      features: document.querySelector("#missingV3Features")?.value.trim() || "",
      zone: document.querySelector("#missingV3Zone")?.value.trim() || ""
    };
    if (state.draftType === "report" && state.draft.lastSeenMode === "custom") {
      state.draft.lastSeenCustom = document.querySelector("#missingV3CustomTime")?.value || state.draft.lastSeenCustom || "";
    }
  }

  function validateDraft() {
    if (!state.draft.name || !state.draft.gender || state.draft.age === "" || !state.draft.features || !state.draft.zone) return false;
    if (state.draftType === "report" && state.draft.lastSeenMode === "custom" && !state.draft.lastSeenCustom) return false;
    return true;
  }

  function bindModalControls() {
    document.querySelectorAll("[data-modal-action]").forEach((button) => button.addEventListener("click", () => {
      const action = button.dataset.modalAction;
      if (action === "choose-report" || action === "choose-tip") {
        state.draftType = action === "choose-report" ? "report" : "tip";
        state.draft = { zone: selectedZone(), lastSeenMode: "preset", lastSeenMinutes: 5, lastSeenCustom: "" };
        state.modalMode = "form";
        renderModal();
      } else if (action === "back-choice") {
        captureForm();
        state.modalMode = "choice";
        renderModal();
      } else if (action === "back-form") {
        state.modalMode = "form";
        renderModal();
      } else if (action === "final-submit") {
        finalSubmit();
      } else if (action === "done") closeModal();
    }));

    document.querySelectorAll("[data-gender]").forEach((button) => button.addEventListener("click", () => {
      state.draft.gender = button.dataset.gender;
      document.querySelectorAll("[data-gender]").forEach((b) => b.classList.toggle("active", b === button));
    }));

    document.querySelectorAll("[data-last-seen-minutes]").forEach((button) => button.addEventListener("click", () => {
      state.draft.lastSeenMode = "preset";
      state.draft.lastSeenMinutes = Number(button.dataset.lastSeenMinutes || 0);
      state.draft.lastSeenCustom = "";
      document.querySelectorAll(".missing-v3-time-btn").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      const custom = document.querySelector("#missingV3CustomTime");
      if (custom) { custom.hidden = true; custom.value = ""; }
    }));

    document.querySelector("[data-last-seen-custom-toggle]")?.addEventListener("click", (event) => {
      state.draft.lastSeenMode = "custom";
      document.querySelectorAll(".missing-v3-time-btn").forEach((b) => b.classList.remove("active"));
      event.currentTarget.classList.add("active");
      const custom = document.querySelector("#missingV3CustomTime");
      if (custom) { custom.hidden = false; custom.focus(); }
    });

    document.querySelector("#missingV3CustomTime")?.addEventListener("input", (event) => {
      state.draft.lastSeenMode = "custom";
      state.draft.lastSeenCustom = event.target.value;
    });

    document.querySelector("#missingV3UseZone")?.addEventListener("click", () => {
      const input = document.querySelector("#missingV3Zone");
      if (input) input.value = selectedZone();
    });

    document.querySelector("#missingV3Form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      captureForm();
      if (!validateDraft()) {
        if (!state.draft.gender) alert("성별을 선택해주세요.");
        else if (state.draftType === "report" && state.draft.lastSeenMode === "custom" && !state.draft.lastSeenCustom) alert("마지막으로 본 시간을 입력해주세요.");
        else event.currentTarget.reportValidity();
        return;
      }
      state.modalMode = "review";
      renderModal();
    });
  }

  function finalSubmit() {
    if (!validateDraft()) return;
    const now = Date.now();
    const common = {
      id: `${state.draftType}-${now}`,
      createdAt: now,
      name: state.draft.name,
      gender: state.draft.gender,
      age: Number(state.draft.age),
      features: state.draft.features,
      zone: state.draft.zone,
      beach: beachName()
    };
    if (state.draftType === "report") {
      const profiles = readJson(PROFILE_KEY);
      const profile = {
        ...common,
        lastSeenTime: lastSeenLabel(state.draft),
        lastSeenMode: state.draft.lastSeenMode || "preset",
        lastSeenMinutes: Number(state.draft.lastSeenMinutes ?? 5),
        lastSeenCustom: state.draft.lastSeenCustom || "",
        status: "신고 접수"
      };
      profiles.unshift(profile);
      writeJson(PROFILE_KEY, profiles.slice(0, 50));
      state.lastSubmitted = profile;
      renderProfiles();
    } else {
      const tips = readJson(TIP_KEY);
      const tip = { ...common, type: "발견 제보" };
      tips.unshift(tip);
      writeJson(TIP_KEY, tips.slice(0, 50));
      state.lastSubmitted = tip;
      renderTips();
    }
    updateCount();
    state.modalMode = "success";
    renderModal();
  }

  function profileShareText(profile) {
    return `[미아 수색 보조 정보]\n상태: ${profile.status}\n이름: ${profile.name}\n성별: ${profile.gender}\n나이: ${profile.age}세\n특징: ${profile.features}\n마지막 발견 시간: ${profile.lastSeenTime || "미입력"}\n마지막 발견 구역: ${profile.zone}\n해변: ${profile.beach}\n※ 앱 내부 기록이며 112 자동 신고가 아닙니다.`;
  }

  async function shareText(text) {
    try {
      if (navigator.share) await navigator.share({ title: "미아 수색 보조 정보", text, url: location.href });
      else await navigator.clipboard.writeText(text);
    } catch (error) {
      if (error.name !== "AbortError") alert("공유하지 못했습니다. 다시 시도해주세요.");
    }
  }

  function renderProfiles() {
    const box = document.querySelector("#missingV3Profiles");
    if (!box) return;
    const profiles = readJson(PROFILE_KEY);
    if (!profiles.length) {
      box.innerHTML = '<div class="missing-v3-empty">등록된 미아 프로필이 없습니다.<br>빨간 신고·제보하기 버튼에서 최종 신고하기를 누르면 여기에 등록됩니다.</div>';
      return;
    }
    box.innerHTML = profiles.map((p) => `
      <article class="missing-v3-profile" data-profile-id="${esc(p.id)}">
        <div class="missing-v3-profile-head"><div class="missing-v3-avatar">${esc((p.name || "?").slice(0,1))}</div><div><h4>${esc(p.name)}</h4><small>${esc(p.gender)} · ${esc(p.age)}세 · ${esc(p.beach)}</small><p><b>특징</b> ${esc(p.features)}<br><b>마지막으로 본 시간</b> ${esc(p.lastSeenTime || "미입력")}<br><b>마지막 발견 구역</b> ${esc(p.zone)}</p></div></div>
        <div class="missing-v3-status">${STATUS_OPTIONS.map((status) => `<button type="button" data-status="${status}" class="${p.status === status ? "active" : ""}">${status}</button>`).join("")}</div>
        <div class="missing-v3-profile-actions"><button type="button" data-profile-action="share">정보 공유</button><button type="button" data-profile-action="focus">구역 확인</button></div>
      </article>`).join("");

    box.querySelectorAll(".missing-v3-profile").forEach((card) => {
      const id = card.dataset.profileId;
      card.querySelectorAll("[data-status]").forEach((button) => button.addEventListener("click", () => {
        const profilesNow = readJson(PROFILE_KEY);
        const profile = profilesNow.find((p) => p.id === id);
        if (!profile) return;
        profile.status = button.dataset.status;
        writeJson(PROFILE_KEY, profilesNow);
        renderProfiles();
        updateCount();
      }));
      card.querySelector('[data-profile-action="share"]')?.addEventListener("click", () => {
        const profile = readJson(PROFILE_KEY).find((p) => p.id === id);
        if (profile) shareText(profileShareText(profile));
      });
      card.querySelector('[data-profile-action="focus"]')?.addEventListener("click", () => {
        const profile = readJson(PROFILE_KEY).find((p) => p.id === id);
        if (!profile) return;
        setNotice(`${profile.name} · ${profile.beach} · 마지막 발견 구역 ${profile.zone} · 마지막 목격 ${profile.lastSeenTime || "미입력"} · 현재 상태 ${profile.status}`);
      });
    });
  }

  function renderTips() {
    const box = document.querySelector("#missingV3Tips");
    if (!box) return;
    const tips = readJson(TIP_KEY);
    if (!tips.length) {
      box.innerHTML = '<div class="missing-v3-empty">접수된 발견 제보가 없습니다.</div>';
      return;
    }
    box.innerHTML = tips.map((p) => `<article class="missing-v3-profile"><div class="missing-v3-profile-head"><div class="missing-v3-avatar">📍</div><div><h4>${esc(p.name)}</h4><small>${esc(p.gender)} · ${esc(p.age)}세 · ${esc(p.beach)}</small><p><b>특징</b> ${esc(p.features)}<br><b>발견 구역</b> ${esc(p.zone)}</p></div></div></article>`).join("");
  }

  function updateCount() {
    const active = readJson(PROFILE_KEY).filter((p) => p.status !== "수색 완료").length;
    const count = document.querySelector("#missingV3Count");
    if (count) count.textContent = String(active);
  }

  function switchPane(name) {
    document.querySelectorAll(".missing-v3-tab").forEach((button) => button.classList.toggle("active", button.dataset.pane === name));
    document.querySelector("#missingV3ProfilesPane").hidden = name !== "profiles";
    document.querySelector("#missingV3TipsPane").hidden = name !== "tips";
    if (name === "profiles") renderProfiles(); else renderTips();
  }

  function init() {
    addStyles();
    renderShell();
    renderProfiles();
    renderTips();
    updateCount();

    document.querySelector("#missingV3Launch")?.addEventListener("click", openModal);
    document.querySelector("#missingV3Close")?.addEventListener("click", closeModal);
    document.querySelector("#missingV3Overlay")?.addEventListener("click", (event) => {
      if (event.target.id === "missingV3Overlay") closeModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !document.querySelector("#missingV3Overlay")?.hidden) closeModal();
    });
    document.querySelectorAll(".missing-v3-tab").forEach((button) => button.addEventListener("click", () => switchPane(button.dataset.pane)));
  }

  if (document.readyState === "complete") init();
  else window.addEventListener("load", init, { once: true });
})();