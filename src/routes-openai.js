import { db } from "./db.js";
import { getUsableKeys, markFailure, markSuccess, logRequest, resolveModel, getProvider } from "./keyring.js";
import { forwardOnce, isRetryableStatus, statusToError, buildUpstreamHeaders } from "./proxy.js";

function requireGatewayAuth(app, req, reply) {
  const expected = process.env.GATEWAY_API_KEY;
  if (!expected) return true;
  const h = req.headers.authorization;
  const got = h?.startsWith("Bearer ") ? h.slice(7) : req.headers["x-api-key"];
  if (got !== expected) {
    reply.code(401).send({ error: { message: "Gateway API key salah", code: 401 } });
    return false;
  }
  return true;
}

async function handleProxy(app, req, reply, overrideModel) {
  if (!requireGatewayAuth(app, req, reply)) return;
  const body = req.body ?? {};
  const alias = overrideModel ?? body.model;
  if (!alias) return reply.code(400).send({ error: { message: "Field 'model' wajib diisi", code: 400 } });

  const mapping = resolveModel(alias);
  if (!mapping) {
    return reply.code(404).send({
      error: { message: `Model '${alias}' tidak dikenal. Daftarkan dulu di dashboard.`, code: 404 },
    });
  }

  const upstreamBody = { ...body, model: mapping.upstream_model };
  const provider = getProvider(mapping.provider_id);
  const rawQuery = req.raw.url.split("?")[1] ?? "";
  const urlPath = req.raw.url.split("?")[0].replace(/^\/v1/, "") || "/";
  const t0 = Date.now();
  const keys = getUsableKeys(provider.id);
  if (keys.length === 0) {
    logRequest(alias, provider.id, null, 503, Date.now() - t0, "Semua API key habis / cooldown / invalid");
    return reply.code(503).send({
      error: { message: `Semua API key provider '${provider.name}' habis/cooldown.`, code: 503 },
    });
  }

  let lastErr = "";
  for (const k of keys) {
    try {
      const res = await forwardOnce(provider, k.key_value, urlPath, rawQuery, req.method, upstreamBody, req.headers);
      if (res.status >= 200 && res.status < 300) {
        markSuccess(k.id);
        logRequest(alias, provider.id, k.id, res.status, Date.now() - t0, "");
        reply.code(res.status);
        if (res.headers["content-type"]) reply.header("content-type", res.headers["content-type"]);
        return reply.send(Buffer.from(res.body));
      }
      const text = Buffer.from(res.body).toString("utf8");
      lastErr = statusToError(res.status, text);
      markFailure(k.id, res.status, text);
      if (isRetryableStatus(res.status)) continue;
      logRequest(alias, provider.id, k.id, res.status, Date.now() - t0, lastErr);
      return reply.code(res.status).send({ error: { message: lastErr, code: res.status } });
    } catch (e) {
      lastErr = e?.name === "AbortError" ? "Timeout ke upstream" : `Network: ${e?.message}`;
      markFailure(k.id, 0, lastErr);
      continue;
    }
  }
  logRequest(alias, provider.id, null, 503, Date.now() - t0, lastErr);
  return reply.code(503).send({
    error: { message: `Semua ${keys.length} API key gagal untuk model '${alias}'. Terakhir: ${lastErr}`, code: 503 },
  });
}

export async function openaiRoutes(app) {
  app.post("/v1/chat/completions", (req, reply) => handleProxy(app, req, reply));
  app.post("/v1/completions", (req, reply) => handleProxy(app, req, reply));
  app.post("/v1/embeddings", (req, reply) => handleProxy(app, req, reply));
  app.post("/v1/images/generations", (req, reply) => handleProxy(app, req, reply));
  app.post("/v1/audio/transcriptions", (req, reply) => handleProxy(app, req, reply));
  app.post("/v1/audio/speech", (req, reply) => handleProxy(app, req, reply));

  app.get("/v1/models", async () => {
    const rows = db.prepare(
      `SELECT vm.alias AS id, p.name AS owned_by FROM virtual_models vm
       JOIN providers p ON p.id=vm.provider_id WHERE vm.enabled=1 AND p.enabled=1 ORDER BY vm.alias`
    ).all();
    return {
      object: "list",
      data: rows.map((r) => ({ id: r.id, object: "model", created: Math.floor(Date.now() / 1000), owned_by: r.owned_by })),
    };
  });

  // Tes 1 model virtual: kirim chat kecil "ping", laporkan key mana yang sukses + latency.
  app.post("/api/test/:alias", async (req, reply) => {
    const { alias } = req.params;
    const mapping = resolveModel(alias);
    if (!mapping) return reply.code(404).send({ ok: false, error: `Model '${alias}' tidak dikenal.` });
    const provider = getProvider(mapping.provider_id);
    const keys = getUsableKeys(provider.id);
    if (!keys.length) return reply.code(503).send({ ok: false, error: `Provider '${provider.name}' tidak punya key aktif.` });
    const t0 = Date.now();
    const attempts = [];
    for (const k of keys) {
      const a0 = Date.now();
      try {
        const res = await forwardOnce(provider, k.key_value, "/chat/completions", "", "POST",
          { model: mapping.upstream_model, messages: [{ role: "user", content: "ping" }], max_tokens: 8 }, {});
        const ms = Date.now() - a0;
        const text = Buffer.from(res.body).toString("utf8").slice(0, 400);
        if (res.status >= 200 && res.status < 300) {
          let replyText = "";
          try { replyText = JSON.parse(text).choices?.[0]?.message?.content ?? ""; } catch {}
          markSuccess(k.id);
          logRequest(alias, provider.id, k.id, res.status, Date.now() - t0, "");
          return { ok: true, alias, upstream: mapping.upstream_model, provider: provider.name, key_index: keys.indexOf(k) + 1, latency_ms: ms, reply: String(replyText).slice(0, 200), attempts };
        }
        markFailure(k.id, res.status, text);
        attempts.push({ key_mask: `key-${k.id}`, status: res.status, ms, error: statusToError(res.status, text).slice(0, 200) });
        if (!isRetryableStatus(res.status)) break;
      } catch (e) {
        const ms = Date.now() - a0;
        markFailure(k.id, 0, String(e?.message));
        attempts.push({ key_mask: `key-${k.id}`, status: 0, ms, error: `Network/timeout: ${e?.message}` });
      }
    }
    logRequest(alias, provider.id, null, 503, Date.now() - t0, "Tes gagal di semua key");
    return reply.code(503).send({ ok: false, alias, upstream: mapping.upstream_model, provider: provider.name, attempts });
  });

  // Daftar model upstream milik provider (GET /models ala OpenAI), untuk intip nama model yang tersedia.
  app.get("/api/upstream-models/:providerId", async (req, reply) => {
    const { providerId } = req.params;
    const provider = getProvider(Number(providerId));
    if (!provider) return reply.code(404).send({ error: "Provider tidak ditemukan" });
    const keys = getUsableKeys(provider.id);
    if (!keys.length) return reply.code(503).send({ error: `Provider '${provider.name}' tidak punya key aktif.` });
    const headers = buildUpstreamHeaders(provider, keys[0].key_value, {});
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(`${provider.base_url.replace(/\/$/, "")}/models`, { headers, signal: ctrl.signal });
      const text = await res.text();
      if (!res.ok) return reply.code(res.status).send({ error: statusToError(res.status, text).slice(0, 300) });
      let ids = [];
      try {
        const j = JSON.parse(text);
        ids = (j.data || []).map((m) => m.id).filter(Boolean);
      } catch { return reply.code(502).send({ error: "Respons /models bukan JSON" }); }
      return { provider: provider.name, count: ids.length, models: ids.slice(0, 200) };
    } catch (e) {
      return reply.code(502).send({ error: `Gagal ambil /models: ${e?.message}` });
    } finally {
      clearTimeout(t);
    }
  });
}
