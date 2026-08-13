// Moraepin stability layer: missing-child workflow, tester mode, and safety-state recovery.
(() => {
  const PROFILE_KEY = 'beachGuideMissingChildrenV3';
  const TIP_KEY = 'beachGuideMissingTipsV3';
  const API = 'https://beach-guide-missing-child-api.chopyoz1207.workers.dev';
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  let profiles = Array.isArray(read(PROFILE_KEY)) ? read(PROFILE_KEY) : [];
  let tips = Array.isArray(read(TIP_KEY)) ? read(TIP_KEY) : [];
  let modalMode = 'choice';
  let draftType = null;
  let draft = {};

  const style = document.createElement('style');
  style.id = 'moraepinStabilityStyles';
  style.textContent = `
    .tester-sync-pin,.tester-map-pin,#testerDomLayer{display:none!important}
    .tester-mode-switch{position:fixed;z-index:8500;top:12px;left:12px;display:flex;gap:3px;padding:4px;border:1px solid #bfd3da;border-radius:12px;background:rgba(255,255,255,.97);box-shadow:0 5px 18px rgba(17,53,68,.2)}
    .tester-mode-switch button{border:0;border-radius:8px;padding:7px 9px;background:transparent;color:#536d78;font-size:10px;font-weight:900;cursor:pointer}
    .tester-mode-switch button.active{background:#123f69;color:#fff}
    .tester-mode-badge{position:fixed;z-index:8499;top:58px;left:12px;max-width:250px;padding:8px 10px;border-radius:10px;background:#fff8d9;border:1px solid #e6cc6c;color:#66521c;font-size:9px;font-weight:800;line-height:1.45;box-shadow:0 4px 14px rgba(55,47,14,.14)}
    .tester-mode-badge[hidden]{display:none!important}
    .moraepin-tester-pin{position:relative;display:block;padding:8px 10px;border:3px solid #fff;border-radius:11px;box-shadow:0 5px 16px rgba(12,48,68,.36);white-space:nowrap;font-size:10px;font-weight:900;line-height:1.15}
    .moraepin-tester-pin.selected{background:#ffbf3c;color:#493400}.moraepin-tester-pin.current{background:#1976d2;color:#fff}
    .moraepin-tester-pin:after{content:'';position:absolute;left:50%;bottom:-9px;transform:translateX(-50%);border-left:7px solid transparent;border-right:7px solid transparent}
    .moraepin-tester-pin.selected:after{border-top:9px solid #ffbf3c}.moraepin-tester-pin.current:after{border-top:9px solid #1976d2}
    .missing-child-group{background:#fffdfb!important;border-color:#ecc7bd!important}
    .missing-v3-launch{width:100%;border:0;border-radius:13px;padding:14px;background:#e54843;color:#fff;font-weight:900;font-size:15px;cursor:pointer}
    .missing-v3-note{margin:9px 0;color:#86645d;font-size:10px;line-height:1.55}
    .missing-v3-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:12px}
    .missing-v3-tab{border:1px solid #c8d8de;background:#fff;color:#355766;border-radius:9px;padding:9px;font-size:10px;font-weight:800;cursor:pointer}
    .missing-v3-tab.active{background:#123f69;color:#fff;border-color:#123f69}
    .missing-v3-count{display:inline-block;margin-left:4px;min-width:16px;padding:1px 5px;border-radius:999px;background:#e54843;color:#fff;font-size:9px}
    .missing-v3-pane[hidden]{display:none!important}.missing-v3-list{display:grid;gap:9px;margin-top:10px}
    .missing-v3-empty,.missing-v3-profile{padding:12px;border:1px solid #dbe5e8;border-radius:11px;background:#fff;font-size:10px}
    .missing-v3-profile h4{margin:0 0 5px;color:#173b50;font-size:13px}.missing-v3-profile p{margin:4px 0;color:#5d7580;line-height:1.55}
    .missing-v3-status{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:9px}
    .missing-v3-status button{padding:7px 4px;border:1px solid #ccd9de;border-radius:8px;background:#fff;font-size:9px;font-weight:800;cursor:pointer}
    .missing-v3-status button.active{background:#eef8ff;color:#174f79;border-color:#9fc6df}
    .missing-v3-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(8,29,39,.5);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
    .missing-v3-overlay[hidden]{display:none!important}
    .missing-v3-modal{position:relative;width:min(430px,calc(100vw - 24px));max-height:88dvh;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;border-radius:16px;background:#fff;padding:18px;box-shadow:0 18px 60px rgba(0,0,0,.3);box-sizing:border-box}
    .missing-v3-close{position:sticky;float:right;top:0;z-index:4;width:34px;height:34px;border:0;border-radius:50%;background:#eef3f5;color:#284953;font-size:21px;cursor:pointer}
    .missing-v3-title{margin:3px 40px 10px 0;color:#12384c;font-size:20px}.missing-v3-sub{font-size:11px;color:#667b83;line-height:1.5}
    .missing-v3-choice-grid,.missing-v3-form{display:grid;gap:10px;clear:both}.missing-v3-choice{padding:14px;border:1px solid #d6e0e4;border-radius:11px;background:#fff;text-align:left;cursor:pointer}.missing-v3-choice.report{background:#fff8f7;border-color:#efb1ad}
    .missing-v3-field{display:block;font-size:10px;font-weight:900;color:#294e5e}.missing-v3-field input,.missing-v3-field textarea,.missing-v3-field select{display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #cbd8dd;border-radius:9px;background:#fff;font-size:16px}.missing-v3-field textarea{min-height:74px}
    .missing-v3-gender,.missing-v3-time-grid,.missing-v3-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.missing-v3-time-grid{grid-template-columns:repeat(4,1fr);margin-top:6px}.missing-v3-gender button,.missing-v3-time-grid button,.missing-v3-actions button{padding:10px;border:1px solid #cbd8dd;border-radius:9px;background:#fff;font-weight:800;cursor:pointer}.missing-v3-gender button.active,.missing-v3-time-grid button.active{background:#eaf4ff;border-color:#9fc4e5}.missing-v3-primary{background:#e54843!important;color:#fff;border:0!important}
    .missing-v3-review{clear:both;padding:12px;border-radius:10px;background:#f6f9fa;font-size:11px;line-height:1.75}.missing-v3-success{text-align:center;clear:both}.missing-v3-112{display:block;margin:12px 0 0;padding:12px;border-radius:10px;background:#123f69;color:#fff;text-decoration:none;font-weight:900}.missing-v3-done{width:100%;margin-top:8px;padding:10px}
    @media(max-width:520px){.missing-v3-overlay{align-items:flex-start;padding:7px}.missing-v3-modal{width:100%;max-height:none;margin:0 auto 24px;padding:14px 13px 22px;overflow:visible}.missing-v3-time-grid{grid-template-columns:1fr 1fr}.missing-v3-status,.missing-v3-actions{grid-template-columns:1fr}.tester-mode-switch{top:7px;left:7px}.tester-mode-badge{top:49px;left:7px;max-width:210px}}
  `;
  document.head.appendChild(style);

  const counts = () => {
    if ($('#missingV3Count')) $('#missingV3Count').textContent = String(profiles.length);
    if ($('#missingV3TipCount')) $('#missingV3TipCount').textContent = String(tips.length);
  };

  async function pushShared() {
    write(PROFILE_KEY, profiles); write(TIP_KEY, tips); counts();
    try {
      const r = await fetch(`${API}/records`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({profiles,tips}) });
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d.profiles)) profiles = d.profiles;
        if (Array.isArray(d.tips)) tips = d.tips;
        write(PROFILE_KEY, profiles); write(TIP_KEY, tips); renderLists();
      }
    } catch {}
  }

  async function pullShared() {
    try {
      const r = await fetch(`${API}/records`, { cache:'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      if (Array.isArray(d.profiles)) profiles = d.profiles;
      if (Array.isArray(d.tips)) tips = d.tips;
      write(PROFILE_KEY, profiles); write(TIP_KEY, tips); renderLists();
    } catch {}
  }

  function renderLists() {
    const p = $('#missingV3Profiles'), t = $('#missingV3Tips');
    if (p) p.innerHTML = profiles.length ? profiles.map((x) => `<article class="missing-v3-profile" data-id="${esc(x.id)}"><h4>${esc(x.name)}</h4><p>${esc(x.gender)} · ${esc(x.age)}세 · ${esc(x.beach || '해변')}</p><p><b>특징</b> ${esc(x.features)}<br><b>마지막 발견</b> ${esc(x.zone)} · ${esc(x.lastSeenTime || '')}</p><div class="missing-v3-status">${['신고 접수','수색 중','수색 완료'].map((s) => `<button type="button" data-status="${s}" class="${x.status===s?'active':''}">${s}</button>`).join('')}</div></article>`).join('') : '<div class="missing-v3-empty">등록된 미아가 없습니다.</div>';
    if (t) t.innerHTML = tips.length ? tips.map((x) => `<article class="missing-v3-profile"><h4>📍 ${esc(x.name)}</h4><p>${esc(x.gender)} · ${esc(x.age)}세 · ${esc(x.beach || '해변')}</p><p><b>특징</b> ${esc(x.features)}<br><b>발견 구역</b> ${esc(x.zone)}</p></article>`).join('') : '<div class="missing-v3-empty">발견 제보 기록이 없습니다.</div>';
    p?.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => {
      const card = b.closest('[data-id]'), item = profiles.find((v) => v.id === card?.dataset.id);
      if (!item) return; item.status = b.dataset.status; item.updatedAt = Date.now(); renderLists(); pushShared();
    }));
    counts();
  }

  function shell() {
    const g = $('.missing-child-group'); if (!g) return;
    g.innerHTML = `<section class="emergency-card"><p class="tag">MISSING CHILD</p><h3>미아 신고·발견 제보</h3><p>신고 또는 발견 제보를 선택해 필요한 정보를 정리합니다.</p></section><button id="missingV3Launch" class="missing-v3-launch" type="button">🚨 신고·제보하기</button><p class="missing-v3-note">접수만으로 112에 자동 전화되지 않습니다. 긴급 상황은 사용자가 직접 112 또는 현장 안전요원에게 연락하세요.</p><div class="missing-v3-tabs"><button class="missing-v3-tab active" type="button" data-pane="profiles">등록된 미아 <span id="missingV3Count" class="missing-v3-count">0</span></button><button class="missing-v3-tab" type="button" data-pane="tips">발견 제보 기록 <span id="missingV3TipCount" class="missing-v3-count">0</span></button></div><div id="missingV3ProfilesPane" class="missing-v3-pane"><div id="missingV3Profiles" class="missing-v3-list"></div></div><div id="missingV3TipsPane" class="missing-v3-pane" hidden><div id="missingV3Tips" class="missing-v3-list"></div></div><div id="missingV3Overlay" class="missing-v3-overlay" hidden><section class="missing-v3-modal"><button id="missingV3Close" class="missing-v3-close" type="button" aria-label="닫기">×</button><div id="missingV3Body"></div></section></div>`;
  }

  const beachName = () => $('#beachSelect')?.selectedOptions?.[0]?.textContent?.split(' · ')[0] || '해운대해수욕장';
  const selectedZone = () => $('#selectedAddress')?.textContent?.replace(/\s+/g,' ').trim() || 'HD-D6 구역';
  const lastLabel = () => Number(draft.minutes ?? 5) === 0 ? '방금 전' : `${Number(draft.minutes ?? 5)}분 전`;

  function renderModal() {
    const b = $('#missingV3Body'); if (!b) return;
    if (modalMode === 'choice') b.innerHTML = `<h2 class="missing-v3-title">상황에 맞는 항목을 선택해주세요.</h2><p class="missing-v3-sub">미아 신고 또는 발견 제보를 선택하세요.</p><div class="missing-v3-choice-grid"><button class="missing-v3-choice report" type="button" data-a="report"><strong>🚨 미아 신고</strong></button><button class="missing-v3-choice" type="button" data-a="tip"><strong>📍 발견 제보</strong></button></div>`;
    else if (modalMode === 'form') {
      const report = draftType === 'report';
      b.innerHTML = `<h2 class="missing-v3-title">${report?'미아 신고':'발견 제보'} 정보 입력</h2><form id="missingForm" class="missing-v3-form"><label class="missing-v3-field">이름<input id="mn" required value="${esc(draft.name || '')}"></label><div class="missing-v3-field">성별<div class="missing-v3-gender"><button type="button" data-g="남자" class="${draft.gender==='남자'?'active':''}">남자</button><button type="button" data-g="여자" class="${draft.gender==='여자'?'active':''}">여자</button></div></div><label class="missing-v3-field">나이<select id="ma"><option value="">선택</option>${Array.from({length:19},(_,i)=>`<option value="${i}" ${String(draft.age)===String(i)?'selected':''}>${i}세</option>`).join('')}</select></label><label class="missing-v3-field">특징<textarea id="mf" required>${esc(draft.features || '')}</textarea></label>${report?`<div class="missing-v3-field">마지막으로 본 시간<div class="missing-v3-time-grid">${[[0,'방금 전'],[5,'5분 전'],[10,'10분 전'],[30,'30분 전']].map(([n,l])=>`<button type="button" data-min="${n}" class="${draft.minutes===n?'active':''}">${l}</button>`).join('')}</div></div>`:''}<label class="missing-v3-field">${report?'마지막으로 본 구역':'발견 구역'}<input id="mz" required value="${esc(draft.zone || selectedZone())}"></label><div class="missing-v3-actions"><button type="button" data-a="back">이전</button><button class="missing-v3-primary" type="submit">${report?'신고하기':'제보하기'}</button></div></form>`;
    } else if (modalMode === 'review') {
      b.innerHTML = `<h2 class="missing-v3-title">최종 확인</h2><div class="missing-v3-review">이름: ${esc(draft.name)}<br>성별: ${esc(draft.gender)} · ${esc(draft.age)}세<br>특징: ${esc(draft.features)}<br>구역: ${esc(draft.zone)}${draftType==='report'?`<br>마지막 목격: ${esc(lastLabel())}`:''}</div><div class="missing-v3-actions" style="margin-top:10px"><button type="button" data-a="edit">취소하기</button><button type="button" class="missing-v3-primary" data-a="submit">${draftType==='report'?'신고하기':'제보하기'}</button></div>`;
    } else b.innerHTML = `<div class="missing-v3-success"><h2>접수되었습니다.</h2><p>등록 정보는 공유 서버가 연결된 기기에서 함께 표시됩니다.</p><a class="missing-v3-112" href="tel:112">112 경찰 신고 전화 연결</a><button class="missing-v3-done" type="button" data-a="done">닫기</button></div>`;
    bindModal();
    b.closest('.missing-v3-modal')?.scrollTo(0,0);
  }

  function capture() {
    draft = {...draft, name:$('#mn')?.value.trim() || '', age:$('#ma')?.value || '', features:$('#mf')?.value.trim() || '', zone:$('#mz')?.value.trim() || ''};
  }
  function validDraft() { return draft.name && draft.gender && draft.age !== '' && draft.features && draft.zone; }

  function bindModal() {
    document.querySelectorAll('[data-a]').forEach((x) => x.addEventListener('click', () => {
      const a = x.dataset.a;
      if (a === 'report' || a === 'tip') { draftType = a; draft = {zone:selectedZone(), minutes:5}; modalMode='form'; renderModal(); }
      else if (a === 'back') { capture(); modalMode='choice'; renderModal(); }
      else if (a === 'edit') { modalMode='form'; renderModal(); }
      else if (a === 'submit') {
        if (!validDraft()) return;
        const now = Date.now(), item = {id:`${draftType}-${now}-${Math.random().toString(36).slice(2,6)}`,createdAt:now,updatedAt:now,name:draft.name,gender:draft.gender,age:Number(draft.age),features:draft.features,zone:draft.zone,beach:beachName()};
        if (draftType === 'report') profiles.unshift({...item,lastSeenTime:lastLabel(),status:'신고 접수'}); else tips.unshift({...item,type:'발견 제보'});
        write(PROFILE_KEY,profiles); write(TIP_KEY,tips); renderLists(); pushShared(); modalMode='success'; renderModal();
      } else if (a === 'done') closeModal();
    }));
    document.querySelectorAll('[data-g]').forEach((x) => x.addEventListener('click', () => { draft.gender=x.dataset.g; renderModal(); }));
    document.querySelectorAll('[data-min]').forEach((x) => x.addEventListener('click', () => { draft.minutes=Number(x.dataset.min); renderModal(); }));
    $('#missingForm')?.addEventListener('submit', (e) => { e.preventDefault(); capture(); if (!validDraft()) { alert('입력하지 않은 항목을 확인해주세요.'); return; } modalMode='review'; renderModal(); });
  }

  function openModal() { modalMode='choice'; draft={}; $('#missingV3Overlay').hidden=false; document.body.style.overflow='hidden'; renderModal(); }
  function closeModal() { $('#missingV3Overlay').hidden=true; document.body.style.overflow=''; }

  // Presentation tester mode: both labels are attached to Kakao coordinates, never to screen pixels.
  const TESTER_D6 = {lat:35.15666694214876,lng:129.15504264332188};
  let selectedOverlay = null, currentOverlay = null, testerMarker = null;
  function clearTesterMap() {
    try { selectedOverlay?.setMap(null); currentOverlay?.setMap(null); testerMarker?.setMap(null); } catch {}
    selectedOverlay = currentOverlay = testerMarker = null;
    document.querySelectorAll('.tester-sync-pin,.tester-map-pin').forEach((n)=>n.style.display='none');
  }
  function testerPin(text, kind, xAnchor) {
    const html = `<div class="moraepin-tester-pin ${kind}" style="display:block!important">${text}</div>`;
    return new kakao.maps.CustomOverlay({map:kakaoMap,position:new kakao.maps.LatLng(TESTER_D6.lat,TESTER_D6.lng),content:html,xAnchor,yAnchor:1.45,zIndex:999});
  }
  function showTesterMap() {
    if (!document.documentElement.classList.contains('tester-mode')) return;
    try {
      if (!window.kakao?.maps || !kakaoMap) throw new Error('map not ready');
      clearTesterMap();
      selectedOverlay = testerPin('선택 위치 HD-D6','selected',1.10);
      currentOverlay = testerPin('내 현재 위치 · TEST','current',-0.10);
      testerMarker = new kakao.maps.Marker({map:kakaoMap,position:new kakao.maps.LatLng(TESTER_D6.lat,TESTER_D6.lng),title:'발표용 현재 위치'});
      kakaoMap.panTo(new kakao.maps.LatLng(TESTER_D6.lat,TESTER_D6.lng));
      if ($('#selectedAddress')) $('#selectedAddress').innerHTML='HD-D6 <em>구역</em>';
      if ($('#mapNotice')) $('#mapNotice').textContent='TESTER MODE · 노란색은 선택 위치, 파란색은 발표용 현재 위치입니다. 두 표시는 같은 HD-D6 격자를 시연합니다.';
    } catch {
      if ($('#mapNotice')) $('#mapNotice').textContent='TESTER MODE · 지도가 준비되면 발표용 HD-D6 위치를 표시합니다.';
      setTimeout(showTesterMap,500);
    }
  }
  function testerUI() {
    document.querySelectorAll('.tester-mode-switch,.tester-mode-badge').forEach((n)=>n.remove());
    const box=document.createElement('div'); box.className='tester-mode-switch'; box.innerHTML='<button id="testerNormal" class="active" type="button">일반 모드</button><button id="testerDemo" type="button">TESTER</button>'; document.body.appendChild(box);
    const badge=document.createElement('div'); badge.className='tester-mode-badge'; badge.hidden=true; badge.textContent='발표용 위치 시연 중 · 실제 GPS와 신고 데이터는 변경하지 않습니다.'; document.body.appendChild(badge);
    $('#testerDemo').onclick=()=>{document.documentElement.classList.add('tester-mode');$('#testerDemo').classList.add('active');$('#testerNormal').classList.remove('active');badge.hidden=false;if($('#locateMe'))$('#locateMe').innerHTML='발표용 현재 위치 다시 보기 <span>⌖</span>';showTesterMap();setTimeout(showTesterMap,350);};
    $('#testerNormal').onclick=()=>{document.documentElement.classList.remove('tester-mode');$('#testerNormal').classList.add('active');$('#testerDemo').classList.remove('active');badge.hidden=true;clearTesterMap();if($('#locateMe'))$('#locateMe').innerHTML='내 위치로 격자 찾기 <span>⌖</span>';};
    document.addEventListener('click',(e)=>{if(document.documentElement.classList.contains('tester-mode')&&e.target.closest?.('#locateMe')){e.preventDefault();e.stopImmediatePropagation();showTesterMap();}},true);
  }

  function init() {
    shell(); renderLists(); counts();
    $('#missingV3Launch')?.addEventListener('click',openModal); $('#missingV3Close')?.addEventListener('click',closeModal);
    $('#missingV3Overlay')?.addEventListener('click',(e)=>{if(e.target.id==='missingV3Overlay')closeModal();});
    document.querySelectorAll('.missing-v3-tab').forEach((b)=>b.addEventListener('click',()=>{document.querySelectorAll('.missing-v3-tab').forEach((x)=>x.classList.toggle('active',x===b));$('#missingV3ProfilesPane').hidden=b.dataset.pane!=='profiles';$('#missingV3TipsPane').hidden=b.dataset.pane!=='tips';}));
    testerUI(); pullShared(); setInterval(pullShared,30000);
  }
  if (document.readyState === 'loading') window.addEventListener('load',init,{once:true}); else init();
})();

// Safety UI recovery: do not leave the presentation stuck on "확인 중" when one external API is delayed.
(() => {
  const $ = (s) => document.querySelector(s);
  const num = (s) => { const v=parseFloat($(s)?.textContent || ''); return Number.isFinite(v)?v:null; };
  function ripLevel() {
    const text = `${$('#ripCurrentLevel')?.textContent||''} ${$('#ripCurrentStatus')?.textContent||''}`;
    if (text.includes('위험')) return '위험'; if (text.includes('경계')) return '경계'; if (text.includes('주의')) return '주의'; if (text.includes('관심')) return '관심'; return null;
  }
  function recalc() {
    const temp=num('#weatherTemp'), rain=num('#weatherRain'), wind=num('#weatherWind'), desc=$('#weatherDesc')?.textContent||'', rip=ripLevel();
    const light=$('#safetyIndexLight'), label=$('#safetyIndexLabel'), reason=$('#safetyIndexReason'), summary=$('#conditionSummary'), cw=$('#conditionWind'), cr=$('#conditionRain'), ct=$('#conditionTide'), ci=$('#conditionRip');
    if (!light||!label||!reason||!summary) return;
    if (cw) cw.innerHTML=wind===null?'<b>바람</b> · 날씨 연결 확인 필요':`<b>바람</b> · ${Math.round(wind)} km/h`;
    if (cr) cr.innerHTML=rain===null?'<b>비</b> · 날씨 연결 확인 필요':`<b>비</b> · ${rain} mm`;
    if (ci) ci.innerHTML=`<b>이안류</b> · ${rip ? `${rip} 단계` : '공식 정보 확인 필요'}`;
    if (ct && $('#tideStatus')) ct.innerHTML=`<b>조석</b> · ${$('#tideStatus').textContent || '공식 정보 확인 필요'}`;
    if ([temp,rain,wind].some((v)=>v===null)) {
      light.textContent='⚪'; label.textContent='확인 필요'; reason.textContent='날씨 연결을 확인하고 있습니다. 이안류·조석 정보는 각 항목에서 별도로 확인할 수 있어요.';
      summary.textContent=rip&&['주의','경계','위험'].includes(rip)?`날씨 연결은 확인 중이지만 이안류는 ${rip} 단계입니다. 현장 안전요원 안내를 우선하세요.`:'일부 실시간 정보 연결을 확인하고 있어요. 확인 가능한 이안류·조석 정보와 현장 안내를 함께 이용하세요.'; return;
    }
    const severeWeather=/뇌우|강한 비|강한 소나기|우박/.test(desc)||wind>=35||rain>=10;
    const cautionWeather=wind>=20||rain>=2||temp>=34;
    const severeRip=['경계','위험'].includes(rip), cautionRip=rip==='주의';
    if (severeWeather||severeRip) { light.textContent='🔴';label.textContent='위험';reason.textContent=severeRip?`공식 이안류가 ${rip} 단계입니다. 입수를 피하고 현장 안내를 따르세요.`:'강한 비·바람 등 위험 기상 조건이 감지됐어요.';summary.textContent='현재는 물놀이를 권하기 어려운 조건이에요. 현장 통제와 안전요원 안내를 우선하세요.'; }
    else if (cautionWeather||cautionRip) { light.textContent='🟡';label.textContent='주의';reason.textContent=cautionRip?'공식 이안류가 주의 단계입니다. 깊은 곳으로 들어가지 마세요.':'현재 바람·강수·더위 중 주의할 조건이 있어요.';summary.textContent='현재는 주의가 필요한 상태예요. 무리한 물놀이는 피하고 현장 상태를 확인하세요.'; }
    else { light.textContent='🟢';label.textContent='양호';reason.textContent=rip?`현재 기상 조건이 비교적 안정적이고 이안류는 ${rip} 단계입니다.`:'현재 기상 조건은 비교적 안정적입니다. 이안류 공식 정보는 별도로 확인하세요.';summary.textContent='현재 확인된 기상 조건은 비교적 무난해요. 현장 안전요원 안내도 함께 확인하세요.'; }
  }
  async function weatherRetry() {
    const tempText=$('#weatherTemp')?.textContent||'';
    if (/-?\d/.test(tempText)) { recalc(); return; }
    const key=$('#beachSelect')?.value||'haeundae';
    const coords={haeundae:[35.1587,129.1604],gwangalli:[35.1532,129.1186],songjeong:[35.1785,129.2016],songdo:[35.0767,129.0178]}[key]||[35.1587,129.1604];
    try {
      const q=new URLSearchParams({latitude:coords[0],longitude:coords[1],current:'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',timezone:'Asia/Seoul'});
      const c=new AbortController(), timer=setTimeout(()=>c.abort(),6000);
      const r=await fetch(`https://api.open-meteo.com/v1/forecast?${q}`,{cache:'no-store',signal:c.signal}); clearTimeout(timer); if(!r.ok)throw new Error();
      const d=await r.json(), n=d.current; if(!n)throw new Error();
      const names={0:'맑음',1:'대체로 맑음',2:'구름 조금',3:'흐림',45:'안개',48:'안개',51:'이슬비',53:'이슬비',55:'강한 이슬비',61:'비',63:'비',65:'강한 비',80:'소나기',81:'소나기',82:'강한 소나기',95:'뇌우',96:'우박 동반 뇌우',99:'강한 뇌우'};
      if($('#weatherTemp'))$('#weatherTemp').textContent=`${Math.round(n.temperature_2m)}°C`; if($('#weatherDesc'))$('#weatherDesc').textContent=`${names[n.weather_code]||'현재 날씨'} · 체감 ${Math.round(n.apparent_temperature)}°C`; if($('#weatherRain'))$('#weatherRain').textContent=`${n.precipitation} mm`; if($('#weatherWind'))$('#weatherWind').textContent=`${Math.round(n.wind_speed_10m)} km/h`; if($('#weatherUpdated'))$('#weatherUpdated').textContent=`기준 시각 ${String(n.time||'').replace('T',' ')} · 재연결 완료`;
    } catch {
      if($('#weatherTemp')&&!/-?\d/.test($('#weatherTemp').textContent))$('#weatherTemp').textContent='날씨 연결 확인 필요';
      if($('#weatherUpdated'))$('#weatherUpdated').textContent='외부 날씨 서버 연결을 확인해 주세요.';
    }
    recalc();
  }
  function start() {
    const observer=new MutationObserver(()=>recalc());
    ['#weatherTemp','#weatherRain','#weatherWind','#weatherDesc','#ripCurrentLevel','#ripCurrentStatus','#tideStatus','#tideTimes'].forEach((s)=>{const n=$(s);if(n)observer.observe(n,{childList:true,subtree:true,characterData:true,attributes:true});});
    recalc(); setTimeout(weatherRetry,1800); setTimeout(recalc,4500);
    $('#beachSelect')?.addEventListener('change',()=>{setTimeout(weatherRetry,500);setTimeout(recalc,2200);});
  }
  if(document.readyState==='loading')window.addEventListener('load',start,{once:true});else start();
})();