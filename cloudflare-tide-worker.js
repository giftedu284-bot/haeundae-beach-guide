const ALLOWED_ORIGIN = "https://giftedu284-bot.github.io";
const OBSERVATION = { code: "DT_0005", name: "부산 조위관측소" };
const API_URL = "https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

function reply(body, status, origin) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

function todayInKorea() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()).replace(/-/g, "");
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function extractItems(payload) {
  const body = payload?.response?.body ?? payload?.body ?? payload;
  const bucket = body?.items ?? body?.item ?? [];
  return toArray(bucket?.item ?? bucket).filter((item) => item && typeof item === "object");
}

function resultHeader(payload) {
  return payload?.response?.header ?? payload?.header ?? {};
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) return reply({ error: "origin_not_allowed" }, 403, origin);
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/health") {
      return reply({ ok: true, service: "beach-guide-tide-api", observation: OBSERVATION }, 200, origin);
    }
    if (request.method !== "GET" || url.pathname !== "/tide") return reply({ error: "not_found" }, 404, origin);
    if (origin !== ALLOWED_ORIGIN) return reply({ error: "origin_not_allowed" }, 403, origin);
    if (!env.PUBLIC_DATA_SERVICE_KEY) return reply({ error: "service_key_not_configured" }, 503, origin);

    const date = (url.searchParams.get("date") || todayInKorea()).replace(/-/g, "");
    if (!/^\d{8}$/.test(date)) return reply({ error: "invalid_date" }, 400, origin);

    const upstream = new URL(API_URL);
    upstream.search = new URLSearchParams({
      serviceKey: env.PUBLIC_DATA_SERVICE_KEY,
      pageNo: "1", numOfRows: "20", type: "json",
      obsCode: OBSERVATION.code, reqDate: date,
    }).toString();

    try {
      const upstreamResponse = await fetch(upstream);
      const raw = await upstreamResponse.text();
      let payload;
      try { payload = JSON.parse(raw); }
      catch { return reply({ error: "upstream_non_json", upstreamStatus: upstreamResponse.status }, 502, origin); }

      const header = resultHeader(payload);
      const resultCode = String(header.resultCode ?? header.resultcode ?? "");
      const resultMessage = header.resultMsg ?? header.resultMessage ?? header.errMsg ?? "";
      if (!upstreamResponse.ok || (resultCode && resultCode !== "00")) {
        return reply({ error: "upstream_error", upstreamStatus: upstreamResponse.status, resultCode, resultMessage }, 502, origin);
      }

      const items = extractItems(payload);
      return reply({ source: "KHOA", observation: OBSERVATION, date, itemCount: items.length, items }, 200, origin);
    } catch {
      return reply({ error: "network_error" }, 502, origin);
    }
  },
};
