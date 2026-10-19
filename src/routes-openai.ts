import type { FastifyInstance } from "fastify";
import { db } from "./db.js";
import { getUsableKeys, markFailure, markSuccess, logRequest, resolveModel, getProvider } from "./keyring.js";
import { forwardOnce, isRetryableStatus, statusToError } from "./proxy.js";

function requireGatewayAuth(app: FastifyInstance, req: any, reply: any): boolean {
  const expected = process.env.GATEWAY_API_KEY;
  if (!expected) return true; // mode santai
  const h = req.headers.authorization as string | undefined;
  const got = h?.startsWith("Bearer ") ? h.slice(7) : (req.headers["x-api-key"] as string | undefined);
  if (got !== expected) {
    reply.code(401).send({ error: { message: "Gateway API key salah", code: 401 } });
    return false;
  }
  return true;
}

async function handleProxy(app: FastifyInstance, req: any, reply: any, overrideModel?: string) {
  if (!requireGatewayAuth(app, req, reply)) return;
  const body: any = req.body ?? {};
  const alias: string | undefined = overrideModel ?? body.model;
  if (!alias) return reply.code(400).send({ error: { message: "Field 'model' wajib diisi", code: 400 } });

  const mapping = resolveModel(alias);
  if (!mapping) {
    return reply.code(404).send({
      error: { message: `Model '${alias}' tidak dikenal. Daftarkan dulu di dashboard (nama model + provider + upstream model).`, code: 404 },
    });
  }

  // Pakai upstream model asli saat forward ke provider
  const upstreamBody = { ...body, model: mapping.upstream_model };
  const provider = getProvider(mapping.provider_id)!;
  const rawQuery = (req.raw.url as string).split("?")[1] ?? "";
  const urlPath = (req.raw.url as string).split("?")[0].replace(/^\/v1/, "") || "/";
  // path upstream: provider base_url + path yang sama (mis. /chat/completions)
  const t0 = Date.now();
  const keys = getUsableKeys(provider.id);
  if (keys.length === 0) {
    logRequest(alias, provider.id, null, 503, Date.now() - t0, "Semua API key habis / cooldown / invalid");
    return reply.code(503).send({
      error: { message: `Semua API key provider '${provider.name}' habis/cooldown. Tambahkan key baru atau reset di dashboard.`, code: 503 },
    });
  }

  let lastErr = "";
  let lastStatus = 502;
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
      lastStatus = res.status;
      if (isRetryableStatus(res.status)) {
        markFailure(k.id, res.status, text);
        continue; // -> coba key berikutnya
      }
      markFailure(k.id, res.status, text);
      logRequest(alias, provider.id, k.id, res.status, Date.now() - t0, lastErr);
      return reply.code(res.status).send({ error: { message: lastErr, code: res.status } });
    } catch (e: any) {
      lastErr = e?.name === "AbortError" ? "Timeout ke upstream" : `Network: ${e?.message}`;
      lastStatus = 502;
      markFailure(k.id, 0, lastErr);
      continue; // -> key berikutnya
    }
  }
  logRequest(alias, provider.id, null, 503, Date.now() - t0, lastErr);
  return reply.code(503).send({
    error: { message: `Semua ${keys.length} API key gagal untuk model '${alias}'. Terakhir: ${lastErr}`, code: 503 },
  });
}

export async function openaiRoutes(app: FastifyInstance) {
  // OpenAI-compatible endpoints (dipakai BYOK VS Code / Cline / Continue / Roo)
  app.post("/v1/chat/completions", (req, reply) => handleProxy(app, req, reply));
  app.post("/v1/completions", (req, reply) => handleProxy(app, req, reply));
  app.post("/v1/embeddings", (req, reply) => handleProxy(app, req, reply));
  app.post("/v1/images/generations", (req, reply) => handleProxy(app, req, reply));
  app.post("/v1/audio/transcriptions", (req, reply) => handleProxy(app, req, reply));
  app.post("/v1/audio/speech", (req, reply) => handleProxy(app, req, reply));

  // Daftar model virtual (format OpenAI)
  app.get("/v1/models", async () => {
    const rows = db.prepare(
      `SELECT vm.alias AS id, p.name AS owned_by FROM virtual_models vm
       JOIN providers p ON p.id=vm.provider_id WHERE vm.enabled=1 AND p.enabled=1 ORDER BY vm.alias`
    ).all() as any[];
    return {
      object: "list",
      data: rows.map((r) => ({ id: r.id, object: "model", created: Math.floor(Date.now() / 1000), owned_by: r.owned_by })),
    };
  });
}
