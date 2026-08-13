// Missing-child workflow v2.
// This feature does NOT submit a police report or publish data to a server.
// It organizes information, marks map locations, stores profiles only in this
// browser (localStorage), and prepares shareable text for 112 / safety staff.
(() => {
  const STORAGE_KEY = "beachGuideMissingChildrenV2";
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
    activeReport: null
  };

  const beachName = () => document.querySelector("#beachSelect")?.selectedOptions?.[0]?.textContent?.split(" · ")[0] || "선택한 해변";
  const fmt = (point) => point ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` : "좌표 확인 중";

  function readProfiles() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  }

  function writeProfiles(profiles) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles.slice(0, 30)));
  }

  function lastSeenTimeText() {
    if (state.customTime) {
      const d = new Date(state.customTime);
      if (!Number.isNaN(d.getTime())) return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    return state.minutesAgo === 0 ? "방금 전" : `${state.minutesAgo}분 전`;
  }

  function addStyles() {
    if (document.querySelector("#missingV2Styles")) return;
    const style = document.createElement("style");
    style.id = "missingV2Styles";
    style.textContent = `
      .missing-child-group{background:#fffdfb!important;border-color:#ecc7bd!important}
      .missing-start{width:100%;border:0;border-radius:12px;padding:13px;background:#e54843;color:#fff;font-weight:900;font-size:14px;cursor:pointer}
      .missing-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 0}
      .missing-tab{border:1px solid #c7d7dd;background:#fff;color:#385765;border-radius:10px;padding:9px;font-weight:800;cursor:pointer}
      .missing-tab.active{background:#113f68;color:#fff;border-color:#113f68}
      .missing-pane[hidden]{display:none!important}
      .missing-flow-intro{margin:0 0 12px;padding:11px;border-radius:10px;background:#fff3ef;color:#735149;font-size:10px;line-height:1.55}
      .missing-step{margin-top:10px;padding:12px;border:1px solid #e2e9ec;border-radius:12px;background:#fff}
      .missing-step-head{display:flex;align-items:center;gap:8px;margin-bottom:9px}
      .missing-step-no{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:#123f69;color:#fff;font-weight:900;font-size:11px}
      .missing-step-head strong{font-size:13px;color:#173b50}
      .missing-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      .missing-choice,.missing-time-btn{border:1px solid #bfd3dc;background:#f8fcfd;color:#17495f;border-radius:9px;padding:9px 7px;font-weight:800;font-size:10px;cursor:pointer}
      .missing-choice.active,.missing-time-btn.active{background:#123f69;color:#fff;border-color:#123f69}
      .missing-state{margin:8px 0 0;padding:8px;border-radius:8px;background:#f3f7f8;color:#58717b;font-size:10px;line-height:1.5}
      .missing-time-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
      .missing-field{display:block;margin-top:8px;color:#294e5f;font-size:10px;font-weight:800}
      .missing-field input,.missing-field select,.missing-field textarea{display:block;width:100%;box-sizing:border-box;margin-top:5px;border:1px solid #c9d7dc;border-radius:8px;padding:9px;background:#fff;font:inherit;color:#173847}
      .missing-field textarea{min-height:58px;resize:vertical}
      .missing-hat{display:flex;gap:6px;margin-top:5px}.missing-hat label{flex:1;border:1px solid #c9d7dc;border-radius:8px;padding:7px;text-align:center;font-size:10px;background:#fff}
      .missing-review{padding:9px;border-radius:8px;background:#f7fafb;color:#536d77;font-size:10px;line-height:1.6}
      .missing-report-btn{width:100%;margin-top:10px;border:0;border-radius:10px;padding:12px;background:#e54843;color:#fff;font-weight:900;cursor:pointer}
      .missing-warning{margin:8px 0 0;color:#8b6259;font-size:9px;line-height:1.5}
      .missing-complete{margin-top:10px;padding:11px;border-radius:11px;background:#f1f8ff;border:1px solid #bed8ec}
      .missing-complete[hidden]{display:none!important}
      .missing-map-legend{display:flex;gap:12px;margin:8px 0;font-size:9px;color:#536d77}.missing-map-legend span:before{content:"";display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px}.missing-map-legend .last:before{background:#e54843}.missing-map-legend .reporter:before{background:#2375c4}
      .missing-after-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.missing-after-actions button{border:1px solid #9fc2da;background:#fff;color:#185889;border-radius:9px;padding:10px;font-weight:900;cursor:pointer}.missing-after-actions .tip-btn{background:#123f69;color:#fff;border-color:#123f69}
      .missing-emergency-links{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.missing-emergency-links a{text-align:center;text-decoration:none;padding:9px;border-radius:8px;border:1px solid #e8b0aa;color:#b52a25;background:#fff;font-weight:900;font-size:10px}
      .missing-profile-list{display:grid;gap:9px}.missing-empty{padding:16px;border:1px dashed #cad8de;border-radius:10px;color:#6a7f87;text-align:center;font-size:10px;line-height:1.5}
      .missing-profile{padding:11px;border:1px solid #dde6e9;border-radius:12px;background:#fff}.missing-profile-top{display:flex;justify-content:space-between;gap:8px;align-items:start}.missing-avatar{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#fff0ed;color:#c83530;font-size:20px;font-weight:900;flex:0 0 auto}.missing-profile h4{margin:0;color:#173b50;font-size:13px}.missing-profile small{color:#7a8b91}.missing-profile p{margin:7px 0 0;color:#566f79;font-size:10px;line-height:1.55}.missing-profile-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:9px}.missing-profile-actions button{border:1px solid #c2d5dd;background:#f9fcfd;color:#17495f;border-radius:8px;padding:8px;font-weight:800;font-size:10px;cursor:pointer}.missing-profile-actions .resolved{border-color:#abd3bb;color:#276b43;background:#f3fbf6}
      .missing-count{display:inline-block;margin-left:4px;padding:1px 6px;border-radius:999px;background:#e54843;color:#fff;font-size:9px}
      @media(max-width:520px){.missing-actions,.missing-after-actions{grid-template-columns:1fr}.missing-time-grid{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(style);
  }

  function renderShell() {
    const group = document.querySelector(".missing-child-group");
    if (!group) return;
    group.innerHTML = `
      <section class="emergency-card">
        <p class="tag">MISSING CHILD</p><h3 id="missingChildTitle">미아 찾기</h3>
        <p>미아 정보를 단계별로 정리하고 마지막 발견 위치를 지도에 표시해 안전요원에게 빠르게 공유합니다.</p>
        <div><a href="tel:112">112 경찰 신고</a><a href="tel:119">119 구조 요청</a></div>
      </section>
      <button id="missingStart" class="missing-start" type="button">미아 찾기 시작하기</button>
      <div class="missing-tabs" role="tablist">
        <button class="missing-tab active" type="button" data-tab="report">미아 신고 작성</button>
        <button class="missing-tab" type="button" data-tab="profiles">등록된 미아 <span id="missingCount" class="missing-count">0</span></button>
      </div>
      <div id="missingReportPane" class="missing-pane">
        <p class="missing-flow-intro">이 앱은 경찰·소방 시스템에 자동 신고하지 않습니다. 실제 신고는 112 또는 현장 안전요원에게 직접 해주세요.</p>
        <form id="reportForm" hidden>
          <section class="missing-step"><div class="missing-step-head"><span class="missing-step-no">1</span><strong>마지막 발견 위치 선택</strong></div><div class="missing-actions"><button id="missingUseCurrent" class="missing-choice" type="button">현재 위치 사용</button><button id="missingPickMap" class="missing-choice" type="button">지도에서 선택</button></div><p id="missingLocationState" class="missing-state">위치를 선택해 주세요.</p><div class="report-location"><span>마지막 발견 위치</span><b id="reportAddress">위치 선택 필요</b></div></section>
          <section class="missing-step"><div class="missing-step-head"><span class="missing-step-no">2</span><strong>마지막으로 본 시간 선택</strong></div><div class="missing-time-grid"><button class="missing-time-btn" type="button" data-minutes="0">방금 전</button><button class="missing-time-btn active" type="button" data-minutes="5">5분 전</button><button class="missing-time-btn" type="button" data-minutes="10">10분 전</button><button class="missing-time-btn" type="button" data-minutes="30">30분 전</button></div><label class="missing-field">직접 입력<input id="missingCustomTime" type="datetime-local" /></label></section>
          <section class="missing-step"><div class="missing-step-head"><span class="missing-step-no">3</span><strong>아이 정보 입력</strong></div><label class="missing-field">이름 또는 부르는 이름<input id="childName" required placeholder="예: 민준" /></label><label class="missing-field">옷 색상<select id="childClothesColor" required><option value="">선택</option><option>빨간색</option><option>주황색</option><option>노란색</option><option>초록색</option><option>파란색</option><option>보라색</option><option>검정색</option><option>흰색</option><option>회색</option><option>기타/여러 색</option></select></label><div class="missing-field">모자 착용 여부<div class="missing-hat"><label><input type="radio" name="missingHat" value="착용" required /> 착용</label><label><input type="radio" name="missingHat" value="미착용" /> 미착용</label><label><input type="radio" name="missingHat" value="모름" /> 모름</label></div></div><label class="missing-field">인상착의·기타 특징<textarea id="childDescription" required placeholder="예: 노란 반바지, 검정 샌들, 키 약 120cm"></textarea></label></section>
          <section class="missing-step"><div class="missing-step-head"><span class="missing-step-no">4</span><strong>미아 신고하기</strong></div><div id="missingReview" class="missing-review">입력한 정보가 여기에 정리됩니다.</div><button class="missing-report-btn" type="submit">미아 신고하기</button><p class="missing-warning">이 버튼은 앱 안에 미아 프로필을 등록하고 위치를 표시합니다. 112 자동 접수 기능은 아닙니다.</p><p id="reportResult" class="report-result" hidden></p></section>
          <section id="missingComplete" class="missing-complete" hidden><div class="missing-step-head"><span class="missing-step-no">5</span><strong>신고 완료 및 위치 확인</strong></div><p id="missingCompleteText"></p><div class="missing-map-legend"><span class="last">마지막 발견 위치</span><span class="reporter">현재 위치</span></div><div class="missing-after-actions"><button id="missingShare" type="button">위치·특징 공유</button><button id="missingTip" class="tip-btn" type="button">제보하기</button></div><div class="missing-emergency-links"><a href="tel:112">112에 전화</a><a href="tel:119">119 구조 요청</a></div></section>
        </form>
      </div>
      <div id="missingProfilesPane" class="missing-pane" hidden><div id="missingProfiles" class="missing-profile-list"></div></div>
    `;
  }

  function switchTab(tab) {
    document.querySelectorAll(".missing-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelector("#missingReportPane").hidden = tab !== "report";
    document.querySelector("#missingProfilesPane").hidden = tab !== "profiles";
    if (tab === "profiles") renderProfiles();
  }

  function setLocation(point, label) {
    state.lastSeenPoint = point; state.lastSeenLabel = label; state.mapPickMode = false;
    document.querySelector("#missingUseCurrent")?.classList.toggle("active", label.includes("현재"));
    document.querySelector("#missingPickMap")?.classList.toggle("active", label.includes("지도"));
    document.querySelector("#missingLocationState").textContent = `${label} · ${fmt(point)}`;
    document.querySelector("#reportAddress").textContent = `${beachName()} · ${label}`;
    updateReview();
  }

  function updateReview() {
    const review = document.querySelector("#missingReview"); if (!review) return;
    const name = document.querySelector("#childName")?.value.trim() || "이름 미입력";
    const color = document.querySelector("#childClothesColor")?.value || "옷 색상 미입력";
    const hat = document.querySelector('input[name="missingHat"]:checked')?.value || "모자 여부 미입력";
    const desc = document.querySelector("#childDescription")?.value.trim() || "특징 미입력";
    review.innerHTML = `<b>${name}</b><br>마지막 발견: ${state.lastSeenLabel || "미선택"} · ${lastSeenTimeText()}<br>인상착의: ${color} 옷 · 모자 ${hat}<br>특징: ${desc}`;
  }

  function makeDot(point, color, text) {
    const el = document.createElement("div");
    el.style.cssText = `display:flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;background:#fff;border:2px solid ${color};box-shadow:0 2px 8px #0002;font-size:10px;font-weight:900;color:#173847;white-space:nowrap`;
    el.innerHTML = `<span style="width:9px;height:9px;border-radius:50%;background:${color}"></span>${text}`;
    return new window.kakao.maps.CustomOverlay({ map: kakaoMap, position: new window.kakao.maps.LatLng(point.lat, point.lng), yAnchor: 1.4, content: el });
  }

  function markPositions() {
    if (!kakaoMap || !state.lastSeenPoint) return;
    [state.lastSeenOverlay,state.reporterOverlay,state.lastSeenCircle,state.reporterCircle].forEach((o)=>o?.setMap(null));
    state.lastSeenOverlay = makeDot(state.lastSeenPoint, "#e54843", "마지막 발견");
    state.lastSeenCircle = new window.kakao.maps.Circle({ map:kakaoMap, center:new window.kakao.maps.LatLng(state.lastSeenPoint.lat,state.lastSeenPoint.lng), radius:25, strokeWeight:2, strokeColor:"#e54843", strokeOpacity:.9, strokeStyle:"shortdash", fillColor:"#e54843", fillOpacity:.08 });
    if (state.reporterPoint) {
      state.reporterOverlay = makeDot(state.reporterPoint, "#2375c4", "현재 위치");
      state.reporterCircle = new window.kakao.maps.Circle({ map:kakaoMap, center:new window.kakao.maps.LatLng(state.reporterPoint.lat,state.reporterPoint.lng), radius:12, strokeWeight:2, strokeColor:"#2375c4", strokeOpacity:.9, fillColor:"#2375c4", fillOpacity:.08 });
    }
    kakaoMap.panTo(new window.kakao.maps.LatLng(state.lastSeenPoint.lat,state.lastSeenPoint.lng));
  }

  function getGps() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(({coords})=>resolve({lat:coords.latitude,lng:coords.longitude}),()=>resolve(null),{enableHighAccuracy:true,timeout:6000,maximumAge:15000});
    });
  }

  function summaryFor(profile) {
    return `[미아 수색 보조 정보]\n이름: ${profile.name}\n해변: ${profile.beach}\n마지막 발견 위치: ${profile.locationLabel} (${fmt(profile.lastSeenPoint)})\n마지막 발견 시간: ${profile.timeText}\n인상착의: ${profile.color} 옷 · 모자 ${profile.hat}\n특징: ${profile.description}${profile.reporterPoint?`\n현재 신고자 위치: ${fmt(profile.reporterPoint)}`:""}\n지도: ${location.href}\n※ 앱 내 수색 보조 정보이며 112 자동 신고가 아닙니다.`;
  }

  async function submitReport(event) {
    event.preventDefault(); event.stopImmediatePropagation();
    const result = document.querySelector("#reportResult");
    if (!state.lastSeenPoint) { result.hidden=false; result.textContent="먼저 마지막 발견 위치를 선택해 주세요."; return; }
    if (!event.currentTarget.reportValidity()) return;
    state.reporterPoint = await getGps();
    const profile = {
      id: `missing-${Date.now()}`,
      createdAt: Date.now(),
      name: document.querySelector("#childName").value.trim(),
      color: document.querySelector("#childClothesColor").value,
      hat: document.querySelector('input[name="missingHat"]:checked')?.value || "모름",
      description: document.querySelector("#childDescription").value.trim(),
      beach: beachName(),
      locationLabel: state.lastSeenLabel,
      lastSeenPoint: state.lastSeenPoint,
      reporterPoint: state.reporterPoint,
      timeText: lastSeenTimeText(),
      resolved: false
    };
    const profiles = readProfiles(); profiles.unshift(profile); writeProfiles(profiles); state.activeReport = profile;
    markPositions(); updateCount(); renderProfiles();
    document.querySelector("#missingComplete").hidden = false;
    document.querySelector("#missingCompleteText").textContent = `${profile.name} 아동을 앱의 미아 목록에 등록하고 마지막 발견 위치를 지도에 표시했습니다.${profile.reporterPoint?" 현재 신고자 위치도 파란색으로 표시했습니다.":" 현재 위치 권한을 받지 못해 신고자 위치는 표시하지 않았습니다."}`;
    result.hidden=false; result.textContent="앱 내 등록이 완료됐어요. 실제 신고는 112 또는 현장 안전요원에게 전달해 주세요.";
    setNotice("미아 수색 보조 정보가 등록됐어요. 112 또는 현장 안전요원에게 위치·시간·인상착의를 전달하세요.");
  }

  async function shareActive(extra="") {
    if (!state.activeReport) return;
    const text = `${summaryFor(state.activeReport)}${extra?`\n${extra}`:""}`;
    try {
      if (navigator.share) await navigator.share({title:"미아 수색 보조 정보",text,url:location.href});
      else await navigator.clipboard.writeText(text);
    } catch (e) { if (e.name !== "AbortError") alert("공유하지 못했어요. 다시 시도해 주세요."); }
  }

  function renderProfiles() {
    const box = document.querySelector("#missingProfiles"); if (!box) return;
    const profiles = readProfiles();
    if (!profiles.length) { box.innerHTML = `<div class="missing-empty">이 브라우저에 등록된 미아 프로필이 없습니다.<br>미아 신고 작성 탭에서 등록하면 여기에 표시됩니다.</div>`; return; }
    box.innerHTML = profiles.map((p)=>`<article class="missing-profile" data-id="${p.id}"><div class="missing-profile-top"><div class="missing-avatar">${(p.name||"?").slice(0,1)}</div><div style="flex:1"><h4>${p.name}${p.resolved?" · 발견 완료":""}</h4><small>${p.beach} · ${p.timeText}</small><p><b>인상착의</b> ${p.color} 옷 · 모자 ${p.hat}<br><b>특징</b> ${p.description}<br><b>마지막 발견</b> ${p.locationLabel}<br><b>좌표</b> ${fmt(p.lastSeenPoint)}</p></div></div><div class="missing-profile-actions"><button type="button" data-action="share">정보 공유</button><button type="button" data-action="resolved" class="resolved">${p.resolved?"미발견으로 되돌리기":"발견 완료"}</button></div></article>`).join("");
    box.querySelectorAll(".missing-profile").forEach((card)=>{
      const id=card.dataset.id;
      card.querySelector('[data-action="share"]')?.addEventListener("click",async()=>{const p=readProfiles().find(x=>x.id===id);if(!p)return;state.activeReport=p;await shareActive();});
      card.querySelector('[data-action="resolved"]')?.addEventListener("click",()=>{const list=readProfiles();const p=list.find(x=>x.id===id);if(!p)return;p.resolved=!p.resolved;writeProfiles(list);renderProfiles();updateCount();});
    });
  }

  function updateCount() {
    const active = readProfiles().filter((p)=>!p.resolved).length;
    const count = document.querySelector("#missingCount"); if(count) count.textContent=String(active);
  }

  function init() {
    addStyles(); renderShell(); updateCount(); renderProfiles();
    document.querySelector("#missingStart")?.addEventListener("click",()=>{switchTab("report");const form=document.querySelector("#reportForm");form.hidden=false;form.scrollIntoView({behavior:"smooth",block:"nearest"});});
    document.querySelectorAll(".missing-tab").forEach((b)=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));
    document.querySelector("#missingUseCurrent")?.addEventListener("click",async()=>{const p=await getGps();if(p){setLocation(p,"현재 위치 사용");kakaoMap?.panTo(new window.kakao.maps.LatLng(p.lat,p.lng));}else document.querySelector("#missingLocationState").textContent="위치 권한을 허용하거나 지도에서 선택해 주세요.";});
    document.querySelector("#missingPickMap")?.addEventListener("click",()=>{state.mapPickMode=true;document.querySelector("#missingPickMap").classList.add("active");document.querySelector("#missingLocationState").textContent="왼쪽 지도에서 마지막 발견 위치를 눌러 주세요.";setNotice("지도에서 미아를 마지막으로 본 위치를 눌러 주세요.");});
    document.querySelectorAll(".missing-time-btn").forEach((b)=>b.addEventListener("click",()=>{document.querySelectorAll(".missing-time-btn").forEach(x=>x.classList.toggle("active",x===b));state.minutesAgo=Number(b.dataset.minutes||0);state.customTime="";document.querySelector("#missingCustomTime").value="";updateReview();}));
    document.querySelector("#missingCustomTime")?.addEventListener("input",(e)=>{state.customTime=e.target.value;document.querySelectorAll(".missing-time-btn").forEach(x=>x.classList.remove("active"));updateReview();});
    ["#childName","#childClothesColor","#childDescription"].forEach((s)=>document.querySelector(s)?.addEventListener("input",updateReview));
    document.querySelectorAll('input[name="missingHat"]').forEach((r)=>r.addEventListener("change",updateReview));
    document.querySelector("#reportForm")?.addEventListener("submit",submitReport,true);
    document.querySelector("#missingShare")?.addEventListener("click",()=>shareActive());
    document.querySelector("#missingTip")?.addEventListener("click",()=>shareActive("제보를 받거나 발견 정보를 전달할 때 이 메시지를 함께 공유해 주세요."));
    if (window.kakaoMap && window.kakao?.maps) window.kakao.maps.event.addListener(kakaoMap,"click",(mouseEvent)=>{if(!state.mapPickMode)return;setLocation({lat:mouseEvent.latLng.getLat(),lng:mouseEvent.latLng.getLng()},"지도에서 선택");});
    document.querySelector("#beachSelect")?.addEventListener("change",()=>{state.lastSeenPoint=null;state.lastSeenLabel="";state.mapPickMode=false;state.activeReport=null;const c=document.querySelector("#missingComplete");if(c)c.hidden=true;const s=document.querySelector("#missingLocationState");if(s)s.textContent="위치를 선택해 주세요.";});
  }

  if (document.readyState === "complete") init(); else window.addEventListener("load",init,{once:true});
})();