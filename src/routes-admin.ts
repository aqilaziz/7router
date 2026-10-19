import type { FastifyInstance } from "fastify";
import { db } from "./db.js";
import { sanitizeKeyRow } from "./keyring.js";

export async function adminRoutes(app: FastifyInstance) {
  // ---- Providers ----
  app.get("/api/providers", async () => {
    const providers = db.prepare("SELECT * FROM providers ORDER BY id").all() as any[];
    return providers.map((p) => {
      const keys = (db.prepare("SELECT * FROM api_keys WHERE provider_id=? ORDER BY priority, id").all(p.id) as any[]).map(sanitizeKeyRow);
      const models = db.prepare("SELECT * FROM virtual_models WHERE provider_id=? ORDER BY alias").all(p.id);
      return { ...p, keys, models };
    });
  });

  app.post("/api/providers", async (req, reply) => {
    const b: any = req.body ?? {};
    if (!b.name || !b.base_url) return reply.code(400).send({ error: "name & base_url wajib" });
    try {
      const r = db.prepare(
        `INSERT INTO providers (name, base_url, auth_scheme, extra_headers, timeout_ms, enabled)
         VALUES (?,?,?,?,?,?)`
      ).run(b.name, b.base_url.replace(/\/$/, ""), b.auth_scheme ?? "Bearer",
        typeof b.extra_headers === "string" ? b.extra_headers : JSON.stringify(b.extra_headers ?? {}),
        b.timeout_ms ?? 60000, b.enabled ?? 1);
      return { id: r.lastInsertRowid };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.put("/api/providers/:id", async (req, reply) => {
    const { id } = req.params as any;
    const b: any = req.body ?? {};
    db.prepare(
      `UPDATE providers SET name=COALESCE(?,name), base_url=COALESCE(?,base_url),
       auth_scheme=COALESCE(?,auth_scheme), extra_headers=COALESCE(?,extra_headers),
       timeout_ms=COALESCE(?,timeout_ms), enabled=COALESCE(?,enabled) WHERE id=?`
    ).run(b.name ?? null, b.base_url ?? null, b.auth_scheme ?? null,
      b.extra_headers !== undefined ? (typeof b.extra_headers === "string" ? b.extra_headers : JSON.stringify(b.extra_headers)) : null,
      b.timeout_ms ?? null, b.enabled ?? null, id);
    return { ok: true };
  });

  app.delete("/api/providers/:id", async (req) => {
    const { id } = req.params as any;
    db.prepare("DELETE FROM api_keys WHERE provider_id=?").run(id);
    db.prepare("DELETE FROM virtual_models WHERE provider_id=?").run(id);
    db.prepare("DELETE FROM providers WHERE id=?").run(id);
    return { ok: true };
  });

  // ---- API Keys (banyak key per provider) ----
  app.post("/api/providers/:id/keys", async (req, reply) => {
    const { id } = req.params as any;
    const b: any = req.body ?? {};
    if (!b.key_value) return reply.code(400).send({ error: "key_value wajib" });
    const r = db.prepare(
      `INSERT INTO api_keys (provider_id, label, key_value, enabled, priority) VALUES (?,?,?,?,?)`
    ).run(id, b.label ?? "", b.key_value.trim(), b.enabled ?? 1, b.priority ?? 0);
    return { id: r.lastInsertRowid };
  });

  app.put("/api/keys/:keyId", async (req) => {
    const { keyId } = req.params as any;
    const b: any = req.body ?? {};
    db.prepare(
      `UPDATE api_keys SET label=COALESCE(?,label), key_value=COALESCE(?,key_value),
       enabled=COALESCE(?,enabled), priority=COALESCE(?,priority) WHERE id=?`
    ).run(b.label ?? null, b.key_value ?? null, b.enabled ?? null, b.priority ?? null, keyId);
    return { ok: true };
  });

  app.post("/api/keys/:keyId/reset", async (req) => {
    const { keyId } = req.params as any;
    db.prepare(
      `UPDATE api_keys SET status='active', consecutive_failures=0, cooldown_until=0, last_error='' WHERE id=?`
    ).run(keyId);
    return { ok: true };
  });

  app.delete("/api/keys/:keyId", async (req) => {
    const { keyId } = req.params as any;
    db.prepare("DELETE FROM api_keys WHERE id=?").run(keyId);
    return { ok: true };
  });

  // ---- Virtual models (nama model + mapping ke upstream) ----
  app.get("/api/models", async () => db.prepare("SELECT * FROM virtual_models ORDER BY alias").all());

  app.post("/api/models", async (req, reply) => {
    const b: any = req.body ?? {};
    if (!b.alias || !b.provider_id || !b.upstream_model)
      return reply.code(400).send({ error: "alias, provider_id, upstream_model wajib" });
    try {
      const r = db.prepare(
        `INSERT INTO virtual_models (alias, provider_id, upstream_model, enabled) VALUES (?,?,?,?)`
      ).run(b.alias, b.provider_id, b.upstream_model, b.enabled ?? 1);
      return { id: r.lastInsertRowid };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.put("/api/models/:id", async (req) => {
    const { id } = req.params as any;
    const b: any = req.body ?? {};
    db.prepare(
      `UPDATE virtual_models SET alias=COALESCE(?,alias), provider_id=COALESCE(?,provider_id),
       upstream_model=COALESCE(?,upstream_model), enabled=COALESCE(?,enabled) WHERE id=?`
    ).run(b.alias ?? null, b.provider_id ?? null, b.upstream_model ?? null, b.enabled ?? null, id);
    return { ok: true };
  });

  app.delete("/api/models/:id", async (req) => {
    const { id } = req.params as any;
    db.prepare("DELETE FROM virtual_models WHERE id=?").run(id);
    return { ok: true };
  });

  // ---- Logs & stats ----
  app.get("/api/logs", async (req) => {
    const q: any = req.query ?? {};
    const limit = Math.min(Number(q.limit ?? 50), 200);
    return db.prepare("SELECT * FROM request_logs ORDER BY id DESC LIMIT ?").all(limit);
  });

  app.get("/api/stats", async () => {
    const keys = db.prepare(
      `SELECT k.id, k.label, k.provider_id, p.name AS provider, k.status, k.enabled,
              k.priority, k.total_requests, k.total_failures, k.last_error, k.cooldown_until
       FROM api_keys k JOIN providers p ON p.id=k.provider_id ORDER BY p.name, k.priority`
    ).all();
    const counts = db.prepare(
      `SELECT status_code, COUNT(*) c FROM request_logs WHERE ts > ? GROUP BY status_code`
    ).all(Date.now() - 24 * 3600 * 1000);
    return { keys, last24h: counts };
  });
}
