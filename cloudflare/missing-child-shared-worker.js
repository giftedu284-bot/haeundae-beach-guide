// Cloudflare Worker for shared missing-child reports.
// Bind a Workers KV namespace to the variable name MISSING_CHILD_STORE.
const DATA_KEY = "records-v1";
const EMPTY = { profiles: [], tips: [], updatedAt: 0 };

function cors(origin) {
  const allowed = [
    "https://giftedu284-bot.github.io",
    "http://localhost:3000",
    "http://127.0.0.1:5500"
  ];
  const value = allowed.includes(origin) ? origin : "https://giftedu284-bot.github.io";
  return {
    "Access-Control-Allow-Origin": value,
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) }
  });
}

function normalize(list) {
  const byId = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || typeof item !== "object" || !item.id) continue;
    const clean = {
      id: String(item.id).slice(0, 120),
      createdAt: Number(item.createdAt || Date.now()),
      updatedAt: Number(item.updatedAt || item.createdAt || Date.now()),
      name: String(item.name || "").slice(0, 80),
      gender: String(item.gender || "").slice(0, 20),
      age: Math.max(0, Math.min(18, Number(item.age || 0))),
      features: String(item.features || "").slice(0, 500),
      zone: String(item.zone || "").slice(0, 120),
      beach: String(item.beach || "").slice(0, 80)
    };
    if (item.status !== undefined) clean.status = String(item.status).slice(0, 40);
    if (item.lastSeenTime !== undefined) clean.lastSeenTime = String(item.lastSeenTime).slice(0, 80);
    if (item.lastSeenMode !== undefined) clean.lastSeenMode = String(item.lastSeenMode).slice(0, 20);
    if (item.lastSeenMinutes !== undefined) clean.lastSeenMinutes = Number(item.lastSeenMinutes || 0);
    if (item.lastSeenCustom !== undefined) clean.lastSeenCustom = String(item.lastSeenCustom).slice(0, 80);
    if (item.type !== undefined) clean.type = String(item.type).slice(0, 40);
    const old = byId.get(clean.id);
    if (!old || clean.updatedAt >= Number(old.updatedAt || old.createdAt || 0)) byId.set(clean.id, clean);
  }
  return [...byId.values()].sort((a,b)=>b.createdAt-a.createdAt).slice(0,100);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, service: "beach-guide-missing-child-api" }, 200, origin);
    if (url.pathname !== "/records") return json({ error: "not_found" }, 404, origin);
    if (!env.MISSING_CHILD_STORE) return json({ error: "kv_binding_missing" }, 500, origin);

    if (request.method === "GET") {
      const stored = await env.MISSING_CHILD_STORE.get(DATA_KEY, "json");
      return json(stored || EMPTY, 200, origin);
    }

    if (request.method === "PUT") {
      let incoming;
      try { incoming = await request.json(); }
      catch { return json({ error: "invalid_json" }, 400, origin); }
      const current = (await env.MISSING_CHILD_STORE.get(DATA_KEY, "json")) || EMPTY;
      const profiles = normalize([...(current.profiles || []), ...(incoming.profiles || [])]);
      const tips = normalize([...(current.tips || []), ...(incoming.tips || [])]);
      const result = { profiles, tips, updatedAt: Date.now() };
      await env.MISSING_CHILD_STORE.put(DATA_KEY, JSON.stringify(result));
      return json(result, 200, origin);
    }

    return json({ error: "method_not_allowed" }, 405, origin);
  }
};