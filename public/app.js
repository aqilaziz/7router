const base = location.origin;
document.getElementById('baseUrl').textContent = base;
document.getElementById('byokBase').textContent = base + '/v1';
const api = (m, u, b) => {
  const opts = { method: m };
  if (b !== undefined) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(b); }
  return fetch(u, opts).then(async r => {
    const t = await r.text();
    try { return JSON.parse(t); } catch { return { ok: r.ok, raw: t.slice(0, 300) }; }
  });
};
async function copyText(elId, btn) {
  const t = document.getElementById(elId).textContent.trim();
  try { await navigator.clipboard.writeText(t); }
  catch { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  if (btn) { const o = btn.textContent; btn.textContent = 'ok!'; setTimeout(() => btn.textContent = o, 1200); }
}
async function loadGatewayKey() {
  try {
    const c = await api('GET', '/api/config');
    document.getElementById('byokKey').textContent = c.gateway_key || '(kosong - bebas isi apa saja)';
  } catch { document.getElementById('byokKey').textContent = '(gagal memuat)'; }
}
loadGatewayKey();
const PRESETS = {
  openrouter: ['openrouter', 'https://openrouter.ai/api/v1', 'Bearer'],
  groq: ['groq', 'https://api.groq.com/openai/v1', 'Bearer'],
  cerebras: ['cerebras', 'https://api.cerebras.ai/v1', 'Bearer'],
  gemini: ['gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', 'Bearer'],
  deepseek: ['deepseek', 'https://api.deepseek.com/v1', 'Bearer']
};
function preset(k) { const v = PRESETS[k]; pName.value = v[0]; pBase.value = v[1]; pAuth.value = v[2]; }
async function addProvider() {
  const r = await api('POST', '/api/providers', { name: pName.value.trim(), base_url: pBase.value.trim(), auth_scheme: pAuth.value });
  if (r.error) return alert(r.error);
  pName.value = ''; pBase.value = ''; load();
}
async function delProvider(id) { if (!confirm('Hapus provider + semua key & modelnya?')) return; const r = await api('DELETE', '/api/providers/' + id); if (r && r.error) alert('Gagal hapus provider: ' + r.error); load(); }
async function toggleProvider(id, en) { await api('PUT', '/api/providers/' + id, { enabled: en ? 0 : 1 }); load(); }
async function addKey(pid) {
  const el = document.getElementById('k_' + pid);
  if (!el.value.trim()) return alert('Isi API key dulu');
  const r = await api('POST', '/api/providers/' + pid + '/keys', { label: 'key', key_value: el.value.trim() });
  if (r.error) return alert(r.error);
  el.value = ''; load();
}
async function delKey(id) { if (!confirm('Hapus key ini?')) return; const r = await api('DELETE', '/api/keys/' + id); if (r && r.error) alert('Gagal hapus key: ' + r.error); load(); }
async function delModel(id) { if (!confirm('Hapus model?')) return; const r = await api('DELETE', '/api/models/' + id); if (r && r.error) alert('Gagal hapus model: ' + r.error); load(); }
const shownKeys = {};
async function toggleShowKey(id) {
  if (shownKeys[id]) { delete shownKeys[id]; load(); return; }
  const r = await api('GET', '/api/keys/' + id);
  if (r.error) return alert('Gagal ambil key: ' + r.error);
  shownKeys[id] = r.key_value;
  load();
}
async function copyKey(id) {
  const r = await api('GET', '/api/keys/' + id);
  if (r.error) return alert('Gagal ambil key: ' + r.error);
  const v = r.key_value || '';
  try { await navigator.clipboard.writeText(v); alert('Key tersalin!'); }
  catch { const ta = document.createElement('textarea'); ta.value = v; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); alert('Key tersalin!'); }
}
async function resetKey(id) { await api('POST', '/api/keys/' + id + '/reset'); load(); }
async function toggleKey(id, en) { await api('PUT', '/api/keys/' + id, { enabled: en ? 0 : 1 }); load(); }
async function prioKey(id, p, d) { await api('PUT', '/api/keys/' + id, { priority: p + d }); load(); }
async function addModel() {
  const r = await api('POST', '/api/models', { alias: mAlias.value.trim(), provider_id: Number(mProv.value), upstream_model: mUp.value.trim() });
  if (r.error) return alert(r.error);
  mAlias.value = ''; mUp.value = ''; load();
}
async function toggleModel(id, en) { await api('PUT', '/api/models/' + id, { enabled: en ? 0 : 1 }); load(); }
async function testModel(alias) {
  const box = document.getElementById('testResult');
  box.innerHTML = '<p class="mut">Tes ' + alias + ' ...</p>';
  const r = await api('POST', '/api/test/' + encodeURIComponent(alias));
  if (r.ok) box.innerHTML = '<p style="color:#22c55e"><b>OK</b> ' + alias + ' -> ' + r.upstream + ' via key #' + r.key_index + ' (' + r.latency_ms + ' ms). Balasan: <code>' + (r.reply || '(kosong)').replace(/</g, '&lt;') + '</code></p>';
  else {
    const det = r.error || (r.attempts || []).map(a => '[key status ' + a.status + '] ' + (a.error || '')).join(' | ');
    box.innerHTML = '<p style="color:#ef4444"><b>GAGAL</b> ' + alias + ': ' + String(det).slice(0, 800).replace(/</g, '&lt;') + '</p>';
  }
  load();
}
async function showUpstream(pid, pname) {
  const box = document.getElementById('testResult');
  box.innerHTML = '<p class="mut">Ambil daftar model ' + pname + ' ...</p>';
  const r = await api('GET', '/api/upstream-models/' + pid);
  if (r.error) { box.innerHTML = '<p style="color:#ef4444"><b>Gagal:</b> ' + r.error + '</p>'; return; }
  box.innerHTML = '<p class="mut">' + r.provider + ': ' + r.count + ' model. Klik nama untuk isi ke form upstream.</p>' +
    r.models.map(m => '<button class="ghost small" style="margin:2px" onclick="pickUpstream(\'' + m.replace(/'/g, '') + '\')">' + m + '</button>').join('');
}
function pickUpstream(name) { mUp.value = name; window.scrollTo(0, 0); mUp.focus(); }
