// First-phase multi-beach extension.
// Keeps Haeundae's verified grid/facility data intact while making map, GPS,
// weather, weather-based safety guidance, location sharing and missing-child
// location marking useful at the other selectable Busan beaches.
(() => {
  const beachMeta = {
    haeundae: { name: "해운대해수욕장", verifiedGrid: true, verifiedFacilities: true, ripCurrent: true },
    gwangalli: { name: "광안리해수욕장", verifiedGrid: false, verifiedFacilities: false, ripCurrent: false },
    songjeong: { name: "송정해수욕장", verifiedGrid: false, verifiedFacilities: false, ripCurrent: false },
    songdo: { name: "송도해수욕장", verifiedGrid: false, verifiedFacilities: false, ripCurrent: false }
  };

  let selectedPoint = null;
  let searchMarker = null;
  let searchCircle = null;

  function beachKey() {
    return document.querySelector("#beachSelect")?.value || "haeundae";
  }

  function meta() {
    return beachMeta[beachKey()] || beachMeta.haeundae;
  }

  function mapCenterPoint() {
    if (!kakaoMap) return null;
    const center = kakaoMap.getCenter();
    return { lat: center.getLat(), lng: center.getLng() };
  }

  function activePoint() {
    return selectedPoint || mapCenterPoint();
  }

  function formatPoint(point) {
    if (!point) return "위치 확인 중";
    return `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
  }

  function ensureStatusNote(container, className) {
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

  function weatherValues() {
    const number = (selector) => {
      const value = parseFloat(document.querySelector(selector)?.textContent || "");
      return Number.isFinite(value) ? value : null;
    };
    return {
      temp: number("#weatherTemp"),
      rain: number("#weatherRain"),
      wind: number("#weatherWind"),
      desc: document.querySelector("#weatherDesc")?.textContent || ""
    };
  }

  function applyWeatherOnlySafety() {
    if (beachKey() === "haeundae") return;
    const { temp, rain, wind, desc } = weatherValues();
    const light = document.querySelector("#safetyIndexLight");
    const label = document.querySelector("#safetyIndexLabel");
    const reason = document.querySelector("#safetyIndexReason");
    const summary = document.querySelector("#conditionSummary");
    const rip = document.querySelector("#conditionRip");
    if (!light || !label || !reason || !summary || !rip) return;

    rip.innerHTML = "<b>이안류</b> · 이 해변의 공식 이안류 연동은 검증 후 추가합니다.";
    if ([temp, rain, wind].some((value) => value === null)) {
      light.textContent = "⚪";
      label.textContent = "기상 확인 중";
      reason.textContent = "선택한 해변의 현재 날씨를 불러온 뒤 기상 기준 참고지수를 표시합니다.";
      summary.textContent = "현재 날씨를 확인하고 있어요. 이안류·조석은 공식 지점 검증 후 단계적으로 연결합니다.";
      return;
    }

    const severe = /뇌우|강한 비|강한 소나기|우박/.test(desc) || wind >= 35 || rain >= 10;
    const caution = wind >= 20 || rain >= 2 || temp >= 34;
    if (severe) {
      light.textContent = "🔴";
      label.textContent = "기상 위험";
      reason.textContent = "강한 비·바람 등 기상 위험요소가 감지됐어요. 공식 해양정보와 현장 통제를 함께 확인하세요.";
      summary.textContent = "현재 기상 조건만으로도 물놀이를 권하기 어려워요. 이안류·조석 공식 연동 전까지 현장 안전요원 안내를 우선하세요.";
    } else if (caution) {
      light.textContent = "🟡";
      label.textContent = "기상 주의";
      reason.textContent = "바람·강수 또는 더위에 주의가 필요해요. 이 해변의 이안류 공식 연동은 검증 후 추가됩니다.";
      summary.textContent = "현재 날씨에는 주의가 필요한 요소가 있어요. 무리한 물놀이는 피하고 현장 파도와 통제 여부를 확인하세요.";
    } else {
      light.textContent = "🟢";
      label.textContent = "기상 양호";
      reason.textContent = "현재 기상 조건은 비교적 안정적입니다. 이안류·조석은 아직 이 해변의 공식 지점 검증 전입니다.";
      summary.textContent = "현재 기상 조건은 비교적 무난해요. 다만 이안류·조석 공식 연동 전이므로 현장 안전요원 안내를 꼭 함께 확인하세요.";
    }
  }

  function syncBeachUI() {
    const key = beachKey();
    const current = meta();
    const point = activePoint();
    const isHaeundae = key === "haeundae";

    document.title = `해변가이드 | ${current.name} 안전 지도`;
    const panelTitle = document.querySelector(".panel-head h2");
    if (panelTitle) panelTitle.textContent = `${current.name} 안전 안내`;

    const panelLead = document.querySelector(".panel-head > p:not(.tag)");
    if (panelLead) panelLead.textContent = isHaeundae
      ? "만남 위치, 내 위치, 접근성 시설을 지도에서 바로 확인하세요."
      : "지도, GPS, 현재 날씨와 기상 안전정보를 확인하세요. 검증이 필요한 해양·시설 정보는 추측해서 표시하지 않습니다.";

    const locationCard = document.querySelector(".location-card");
    if (locationCard) {
      const title = locationCard.querySelector("h3");
      const desc = locationCard.querySelector("p");
      const caption = locationCard.querySelector("span");
      if (isHaeundae) {
        if (caption) caption.textContent = "내가 선택한 장소";
        if (desc) desc.textContent = "해운대해수욕장 모래사장";
      } else {
        if (caption) caption.textContent = "지도에서 선택한 위치";
        if (title) title.innerHTML = `${current.name} <small>· 좌표 위치</small>`;
        if (desc) desc.textContent = formatPoint(point);
      }
    }

    const selectedAddress = document.querySelector("#selectedAddress");
    const copyButton = document.querySelector("#copyAddress");
    if (!isHaeundae && selectedAddress) selectedAddress.innerHTML = `${current.name} <em>위치</em>`;
    if (copyButton) copyButton.textContent = isHaeundae ? "주소 복사" : "위치 복사";

    const locateButton = document.querySelector("#locateMe");
    if (locateButton && !locateButton.disabled) locateButton.innerHTML = isHaeundae ? "내 위치로 격자 찾기 <span>⌖</span>" : "내 현재 위치 지도에서 확인 <span>⌖</span>";

    const reportAddress = document.querySelector("#reportAddress");
    if (!isHaeundae && reportAddress) reportAddress.textContent = `${current.name} · ${formatPoint(point)}`;

    const reportHelp = document.querySelector(".missing-child-group .report-title p");
    if (reportHelp) reportHelp.textContent = isHaeundae
      ? "선택한 격자를 중심으로 수색 범위를 지도에 표시합니다."
      : "지도에서 선택한 지점을 중심으로 임시 수색 위치를 표시합니다.";

    const reportButton = document.querySelector("#reportForm .report-button");
    if (reportButton) reportButton.textContent = isHaeundae ? "지도에 수색 위치 표시하기" : "선택 지점을 수색 위치로 표시하기";

    const facilityGroup = document.querySelector(".facility-group");
    if (facilityGroup) {
      const note = ensureStatusNote(facilityGroup, "multi-beach-facility-note");
      if (note) {
        note.hidden = isHaeundae;
        note.textContent = `${current.name}의 편의·접근성 시설 좌표는 현장 검증 후 추가합니다. 현재는 검증된 해운대 시설만 지도에 표시합니다.`;
      }
      facilityGroup.querySelectorAll("button").forEach((button) => {
        button.disabled = !isHaeundae;
        if (!isHaeundae) button.setAttribute("aria-disabled", "true"); else button.removeAttribute("aria-disabled");
      });
    }

    const ripCard = document.querySelector(".rip-current-card");
    if (ripCard) ripCard.hidden = !current.ripCurrent;

    const tideCard = document.querySelector(".tide-card");
    if (tideCard) {
      const note = ensureStatusNote(tideCard, "multi-beach-tide-note");
      if (note) {
        note.hidden = isHaeundae;
        note.textContent = `${current.name}의 공식 조석 예보지점은 아직 검증 중입니다. 확인되지 않은 지점의 조석값을 대신 표시하지 않습니다.`;
      }
    }

    const indexNote = document.querySelector(".safety-index-note");
    if (indexNote) indexNote.textContent = isHaeundae
      ? "기온·강수·바람과 국립해양조사원 공식 이안류 지수를 함께 반영한 참고지수입니다. 현장 통제와 안전요원 안내를 우선하세요."
      : "현재는 선택한 해변의 기온·강수·바람을 반영한 기상 참고지수입니다. 이안류·조석 공식 지점 검증이 끝나면 종합지수에 추가합니다.";

    const meetText = document.querySelector(".meet-card > p:not(.tag)");
    if (meetText) meetText.textContent = isHaeundae
      ? "선택한 구역과 지도 링크를 친구에게 바로 보냅니다."
      : "지도에서 선택한 위치 좌표와 해변 이름을 친구에게 바로 보냅니다.";

    if (!isHaeundae) applyWeatherOnlySafety();
  }

  function markPoint(point, title) {
    if (!point || !kakaoMap || !window.kakao?.maps) return;
    const position = new window.kakao.maps.LatLng(point.lat, point.lng);
    if (searchMarker) searchMarker.setMap(null);
    if (searchCircle) searchCircle.setMap(null);
    searchMarker = new window.kakao.maps.Marker({ map: kakaoMap, position, title });
    searchCircle = new window.kakao.maps.Circle({ map: kakaoMap, center: position, radius: 35, strokeWeight: 2, strokeColor: "#d93636", strokeOpacity: 0.9, strokeStyle: "shortdash", fillColor: "#e74c4c", fillOpacity: 0.1 });
  }

  function handleNonHaeundaeLocate(event) {
    if (beachKey() === "haeundae") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const button = event.currentTarget;
    if (!navigator.geolocation) { setNotice("이 기기에서는 GPS 위치 기능을 사용할 수 없어요."); return; }
    button.disabled = true;
    button.textContent = "현재 위치를 확인하고 있어요…";
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      selectedPoint = { lat: coords.latitude, lng: coords.longitude };
      const position = new window.kakao.maps.LatLng(selectedPoint.lat, selectedPoint.lng);
      if (myLocationMarker) myLocationMarker.setMap(null);
      myLocationMarker = new window.kakao.maps.Marker({ map: kakaoMap, position, title: "내 현재 위치" });
      kakaoMap.panTo(position);
      setNotice(`${meta().name} 주변에서 현재 GPS 위치를 표시했어요. 정확도는 약 ${Math.round(coords.accuracy)}m예요.`);
      button.disabled = false;
      syncBeachUI();
    }, () => {
      button.disabled = false;
      button.innerHTML = "내 현재 위치 지도에서 확인 <span>⌖</span>";
      setNotice("위치 권한이 필요해요. 브라우저에서 위치 사용을 허용해 주세요.");
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }

  async function handleNonHaeundaeShare(event) {
    if (beachKey() === "haeundae") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const current = meta();
    const point = activePoint();
    const message = `${current.name} 만남 위치: ${formatPoint(point)}\n${location.href}`;
    const result = document.querySelector("#shareResult");
    try {
      if (navigator.share) await navigator.share({ title: `${current.name} 만남 위치`, text: message, url: location.href });
      else await navigator.clipboard.writeText(message);
      result.hidden = false;
      result.textContent = navigator.share ? "공유 창을 열었어요." : "해변 이름과 위치 좌표를 복사했어요.";
    } catch (error) {
      if (error.name !== "AbortError") { result.hidden = false; result.textContent = "공유하지 못했어요. 다시 시도해 주세요."; }
    }
  }

  async function handleNonHaeundaeCopy(event) {
    if (beachKey() === "haeundae") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const text = `${meta().name} ${formatPoint(activePoint())}`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${meta().name} 위치 좌표를 복사했어요.`);
    } catch {
      setNotice(`현재 위치: ${text}`);
    }
  }

  function handleNonHaeundaeReport(event) {
    if (beachKey() === "haeundae") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const form = event.currentTarget;
    const name = form.querySelector("#childName")?.value.trim();
    const description = form.querySelector("#childDescription")?.value.trim();
    const point = activePoint();
    if (!point) return;
    markPoint(point, `미아 마지막 목격 위치 · ${name || "이름 미입력"}`);
    const result = form.querySelector("#reportResult");
    result.hidden = false;
    result.textContent = `${meta().name} ${formatPoint(point)}에 수색 보조 위치를 표시했어요. 이 표시는 신고 접수가 아닙니다.`;
    setNotice(`미아 수색 보조 위치를 표시했어요. 112 또는 현장 안전요원에게 위치 좌표와 특징을 함께 알려주세요.${description ? ` 특징: ${description}` : ""}`);
    form.reset();
  }

  function init() {
    const select = document.querySelector("#beachSelect");
    const locate = document.querySelector("#locateMe");
    const share = document.querySelector("#shareMeeting");
    const copy = document.querySelector("#copyAddress");
    const report = document.querySelector("#reportForm");

    select?.addEventListener("change", () => {
      selectedPoint = null;
      setTimeout(() => {
        selectedPoint = mapCenterPoint();
        syncBeachUI();
      }, 0);
    });
    locate?.addEventListener("click", handleNonHaeundaeLocate, true);
    share?.addEventListener("click", handleNonHaeundaeShare, true);
    copy?.addEventListener("click", handleNonHaeundaeCopy, true);
    report?.addEventListener("submit", handleNonHaeundaeReport, true);

    if (kakaoMap && window.kakao?.maps) {
      window.kakao.maps.event.addListener(kakaoMap, "click", (mouseEvent) => {
        if (beachKey() === "haeundae") return;
        selectedPoint = { lat: mouseEvent.latLng.getLat(), lng: mouseEvent.latLng.getLng() };
        setNotice(`${meta().name}에서 위치를 선택했어요: ${formatPoint(selectedPoint)}`);
        syncBeachUI();
      });
    }

    const weatherObserver = new MutationObserver(() => {
      if (beachKey() !== "haeundae") queueMicrotask(() => { applyWeatherOnlySafety(); syncBeachUI(); });
    });
    ["#weatherTemp", "#weatherRain", "#weatherWind", "#weatherDesc", "#tideStatus"].forEach((selector) => {
      const node = document.querySelector(selector);
      if (node) weatherObserver.observe(node, { childList: true, subtree: true, characterData: true });
    });

    syncBeachUI();
  }

  if (document.readyState === "complete") init();
  else window.addEventListener("load", init, { once: true });
})();