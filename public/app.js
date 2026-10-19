const base = location.origin;
document.getElementById('baseUrl').textContent = base;
document.getElementById('byokBase').textContent = base + '/v1';
const api = (m, u, b) => fetch(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(r => r.json());
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
async function delProvider(id) { if (confirm('Hapus provider + semua key & modelnya?')) { await api('DELETE', '/api/providers/' + id); load(); } }
async function toggleProvider(id, en) { await api('PUT', '/api/providers/' + id, { enabled: en ? 0 : 1 }); load(); }
async function addKey(pid) {
  const el = document.getElementById('k_' + pid);
  if (!el.value.trim()) return alert('Isi API key dulu');
  const r = await api('POST', '/api/providers/' + pid + '/keys', { label: 'key', key_value: el.value.trim() });
  if (r.error) return alert(r.error);
  el.value = ''; load();
}
async function delKey(id) { if (confirm('Hapus key ini?')) { await api('DELETE', '/api/keys/' + id); load(); } }
async function resetKey(id) { await api('POST', '/api/keys/' + id + '/reset'); load(); }
async function toggleKey(id, en) { await api('PUT', '/api/keys/' + id, { enabled: en ? 0 : 1 }); load(); }
async function prioKey(id, p, d) { await api('PUT', '/api/keys/' + id, { priority: p + d }); load(); }
async function addModel() {
  const r = await api('POST', '/api/models', { alias: mAlias.value.trim(), provider_id: Number(mProv.value), upstream_model: mUp.value.trim() });
  if (r.error) return alert(r.error);
  mAlias.value = ''; mUp.value = ''; load();
}
async function delModel(id) { if (confirm('Hapus model?')) { await api('DELETE', '/api/models/' + id); load(); } }
async function toggleModel(id, en) { await api('PUT', '/api/models/' + id, { enabled: en ? 0 : 1 }); load(); }
