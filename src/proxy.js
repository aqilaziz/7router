export function buildUpstreamHeaders(provider, apiKey, incoming) {
  const headers = { "Content-Type": "application/json" };
  if (provider.auth_scheme === "Bearer" && apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  else if (provider.auth_scheme === "x-api-key" && apiKey) headers["x-api-key"] = apiKey;
  else if (provider.auth_scheme === "api-key" && apiKey) headers["api-key"] = apiKey;
  try {
    const extra = JSON.parse(provider.extra_headers || "{}");
    for (const [k, v] of Object.entries(extra)) headers[k] = String(v);
  } catch {}
  const fwd = ["user-agent", "x-title", "http-referer", "openai-organization"];
  for (const k of fwd) {
    const v = incoming[k];
    if (typeof v === "string" && v) headers[k] = v;
  }
  return headers;
}

export async function forwardOnce(provider, apiKey, path, query, method, body, incomingHeaders) {
  const base = provider.base_url.replace(/\/$/, "");
  const url = `${base}${path}${query ? "?" + query : ""}`;
  const headers = buildUpstreamHeaders(provider, apiKey, incomingHeaders);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), provider.timeout_ms || 60000);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    const out = {};
    const ct = res.headers.get("content-type");
    if (ct) out["content-type"] = ct;
    return { status: res.status, headers: out, body: buf };
  } finally {
    clearTimeout(t);
  }
}

export function isRetryableStatus(status) {
  return status === 429 || status === 401 || status === 403 || status >= 500;
}

export function statusToError(status, bodyText) {
  const t = bodyText.slice(0, 300);
  if (status === 429) return `Kuota/rate-limit habis (429): ${t}`;
  if (status === 401 || status === 403) return `API key ditolak (${status}): ${t}`;
  if (status >= 500) return `Upstream error (${status}): ${t}`;
  return `Upstream status ${status}: ${t}`;
}
