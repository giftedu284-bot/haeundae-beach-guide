// Shared missing-child record sync.
// Requires the companion Cloudflare Worker in cloudflare/missing-child-shared-worker.js.
(() => {
  const API = "https://beach-guide-missing-child-api.chopyoz1207.workers.dev";
  const PROFILE_KEY = "beachGuideMissingChildrenV3";
  const TIP_KEY = "beachGuideMissingTipsV3";
  const SYNC_MARK = "beachGuideMissingSharedSyncedV1";
  const nativeSetItem = Storage.prototype.setItem;
  let pushing = false;

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); }
    catch { return []; }
  }

  function writeNative(key, value) {
    nativeSetItem.call(localStorage, key, JSON.stringify(Array.isArray(value) ? value : []));
  }

  function normalize(list) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach((item) => {
      if (!item || !item.id) return;
      const previous = map.get(item.id);
      const previousTime = Number(previous?.updatedAt || previous?.createdAt || 0);
      const itemTime = Number(item.updatedAt || item.createdAt || 0);
      if (!previous || itemTime >= previousTime) map.set(item.id, item);
    });
    return [...map.values()].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 100);
  }

  function same(a, b) {
    try { return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b)); }
    catch { return false; }
  }

  function updateBadges() {
    const profiles = read(PROFILE_KEY);
    const tips = read(TIP_KEY);
    const profileCount = document.querySelector("#missingV3Count");
    if (profileCount) profileCount.textContent = String(profiles.length);
    const tipTab = document.querySelector('.missing-v3-tab[data-pane="tips"]');
    if (tipTab) {
      let badge = tipTab.querySelector("#missingV3TipCount");
      if (!badge) {
        badge = document.createElement("span");
        badge.id = "missingV3TipCount";
        badge.className = "missing-v3-count";
        tipTab.appendChild(badge);
      }
      badge.textContent = String(tips.length);
    }
  }

  async function pushShared() {
    if (pushing) return;
    pushing = true;
    try {
      await fetch(`${API}/records`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profiles: read(PROFILE_KEY), tips: read(TIP_KEY) }),
        keepalive: true
      });
    } catch {
      // Keep the local copy; a later change or reload will retry.
    } finally {
      pushing = false;
    }
  }

  Storage.prototype.setItem = function(key, value) {
    nativeSetItem.call(this, key, value);
    if (this === localStorage && (key === PROFILE_KEY || key === TIP_KEY)) {
      updateBadges();
      setTimeout(pushShared, 40);
    }
  };

  async function pullShared() {
    try {
      const response = await fetch(`${API}/records`, { cache: "no-store" });
      if (!response.ok) throw new Error(`shared records ${response.status}`);
      const data = await response.json();
      const localProfiles = read(PROFILE_KEY);
      const localTips = read(TIP_KEY);
      const profiles = normalize([...(data.profiles || []), ...localProfiles]);
      const tips = normalize([...(data.tips || []), ...localTips]);
      const changed = !same(localProfiles, profiles) || !same(localTips, tips);
      writeNative(PROFILE_KEY, profiles);
      writeNative(TIP_KEY, tips);
      updateBadges();
      if (changed && !sessionStorage.getItem(SYNC_MARK)) {
        sessionStorage.setItem(SYNC_MARK, "1");
        location.reload();
        return;
      }
      if (localProfiles.length || localTips.length) pushShared();
    } catch {
      updateBadges();
    }
  }

  window.addEventListener("load", () => {
    updateBadges();
    pullShared();
    setTimeout(updateBadges, 500);
  }, { once: true });
})();