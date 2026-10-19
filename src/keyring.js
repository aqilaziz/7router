import { db } from "./db.js";

export function maskKey(k) {
  if (!k) return "";
  if (k.length <= 8) return "****";
  return k.slice(0, 4) + "****" + k.slice(-4);
}

export function getProvider(id) {
  return db.prepare("SELECT * FROM providers WHERE id=?").get(id);
}

export function resolveModel(alias) {
  return db
    .prepare(
      `SELECT vm.alias, vm.upstream_model, p.* FROM virtual_models vm
       JOIN providers p ON p.id = vm.provider_id
       WHERE vm.alias = ? AND vm.enabled = 1 AND p.enabled = 1`
    )
    .get(alias);
}

/** Ambil key yang bisa dipakai, berurutan: priority kecil dulu, lalu yang paling lama tidak dipakai (round-robin). */
export function getUsableKeys(providerId) {
  const now = Date.now();
  return db
    .prepare(
      `SELECT * FROM api_keys
       WHERE provider_id = ? AND enabled = 1
         AND (status = 'active' OR (status = 'cooldown' AND cooldown_until <= ?))
       ORDER BY priority ASC, last_used_at ASC, id ASC`
    )
    .all(providerId, now);
}

export function markSuccess(keyId) {
  db.prepare(
    `UPDATE api_keys SET status='active', consecutive_failures=0, cooldown_until=0,
     total_requests=total_requests+1, last_used_at=?, last_error='' WHERE id=?`
  ).run(Date.now(), keyId);
}

export function markFailure(keyId, statusCode, errText) {
  const row = db.prepare("SELECT * FROM api_keys WHERE id=?").get(keyId);
  if (!row) return;
  const err = (errText || "").slice(0, 500);
  const lower = err.toLowerCase();

  // 1. Key salah / revoked -> tandai invalid agar tidak dicoba lagi
  if (statusCode === 401 || statusCode === 403 || lower.includes("invalid api key") || lower.includes("incorrect api key")) {
    db.prepare(
      `UPDATE api_keys SET status='invalid', total_failures=total_failures+1, total_requests=total_requests+1, last_error=? WHERE id=?`
    ).run(`[${statusCode}] ${err}`, keyId);
    return;
  }
  // 2. Kuota / rate limit habis -> cooldown + catat.
  if (
    statusCode === 429 ||
    lower.includes("quota") || lower.includes("insufficient") ||
    lower.includes("free limit") || lower.includes("rate limit") || lower.includes("credit")
  ) {
    const cooldownMs = statusCode === 429 ? 60_000 : 5 * 60_000;
    db.prepare(
      `UPDATE api_keys SET status='cooldown', cooldown_until=?, consecutive_failures=consecutive_failures+1,
       total_failures=total_failures+1, total_requests=total_requests+1, last_error=? WHERE id=?`
    ).run(Date.now() + cooldownMs, `[${statusCode}] ${err}`, keyId);
    return;
  }
  // 3. Error lain (5xx / network): backoff eksponensial, maks 5 menit
  const fails = row.consecutive_failures + 1;
  const backoff = Math.min(5000 * 2 ** Math.min(fails, 6), 300_000);
  const status = fails >= 5 ? "cooldown" : "active";
  db.prepare(
    `UPDATE api_keys SET status=?, cooldown_until=?, consecutive_failures=?, total_failures=total_failures+1,
     total_requests=total_requests+1, last_error=? WHERE id=?`
  ).run(status, status === "cooldown" ? Date.now() + backoff : 0, fails, `[${statusCode}] ${err}`, keyId);
}

export function logRequest(model, providerId, keyId, statusCode, latencyMs, error) {
  db.prepare(
    `INSERT INTO request_logs (ts, model, provider_id, key_id, status_code, latency_ms, error)
     VALUES (?,?,?,?,?,?,?)`
  ).run(Date.now(), model, providerId, keyId, statusCode, latencyMs, (error || "").slice(0, 500));
}

export function sanitizeKeyRow(r) {
  return { ...r, key_value: maskKey(r.key_value) };
}
