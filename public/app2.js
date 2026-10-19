async function load() {
  const provs = await api('GET', '/api/providers');
  const models = await api('GET', '/api/models');
  const stats = await api('GET', '/api/stats');
  const logs = await api('GET', '/api/logs?limit=30');
  mProv.innerHTML = provs.map(p => '<option value="' + p.id + '">' + p.name + '</option>').join('');
  let h = '';
  for (const p of provs) {
    h += '<div class="prov"><div class="prov-head"><div><b>' + p.name + '</b> <span class="mut">' + p.base_url + '</span></div>';
    h += '<div class="row"><button class="ghost small" onclick="toggleProvider(' + p.id + ',' + p.enabled + ')">' + (p.enabled ? 'Off' : 'On') + '</button>';
    h += '<button class="danger small" onclick="delProvider(' + p.id + ')">Hapus</button></div></div>';
    h += '<div class="row" style="margin-top:8px"><input id="k_' + p.id + '" placeholder="Tempel API key baru" style="flex:1;min-width:200px">';
    h += '<button class="small" onclick="addKey(' + p.id + ')">+ Key</button></div>';
    h += '<table><tr><th>#</th><th>Key</th><th>Status</th><th>Req</th><th>Aksi</th></tr>';
    if (!p.keys.length) h += '<tr><td colspan="5" class="mut">Belum ada key.</td></tr>';
    p.keys.forEach((k, i) => {
      h += '<tr><td>' + (i + 1) + '</td><td><code>' + k.key_value + '</code></td>';
      h += '<td class="st-' + k.status + '"><b>' + k.status + '</b></td><td>' + k.total_requests + '/' + k.total_failures + '</td><td><div class="row">';
      h += '<button class="ghost small" onclick="toggleKey(' + k.id + ',' + k.enabled + ')">' + (k.enabled ? 'Off' : 'On') + '</button>';
      h += '<button class="ghost small" onclick="resetKey(' + k.id + ')">Reset</button>';
      h += '<button class="danger small" onclick="delKey(' + k.id + ')">x</button></div></td></tr>';
    });
    h += '</table></div>';
  }
  document.getElementById('providers').innerHTML = h || '<p class="mut">Belum ada provider.</p>';
  let mh = '<table><tr><th>Alias</th><th>Provider</th><th>Upstream</th><th>Aksi</th></tr>';
  for (const m of models) {
    const p = provs.find(x => x.id === m.provider_id);
    mh += '<tr><td><code>' + m.alias + '</code></td><td>' + (p ? p.name : m.provider_id) + '</td><td><code>' + m.upstream_model + '</code></td>';
    mh += '<td><div class="row"><button class="ghost small" onclick="toggleModel(' + m.id + ',' + m.enabled + ')">' + (m.enabled ? 'Off' : 'On') + '</button>';
    mh += '<button class="danger small" onclick="delModel(' + m.id + ')">x</button></div></td></tr>';
  }
  document.getElementById('models').innerHTML = mh + '</table>';
  let lh = '<table><tr><th>Waktu</th><th>Model</th><th>Status</th><th>ms</th><th>Error</th></tr>';
  for (const l of logs) lh += '<tr><td class="mut">' + new Date(l.ts).toLocaleTimeString() + '</td><td><code>' + l.model + '</code></td><td>' + l.status_code + '</td><td>' + l.latency_ms + '</td><td class="mut">' + (l.error || '').slice(0, 90) + '</td></tr>';
  document.getElementById('logs').innerHTML = lh + '</table>';
  document.getElementById('stats').innerHTML = '<p class="mut">24 jam: ' + (stats.last24h.map(x => x.status_code + 'x' + x.c).join(', ') || 'belum ada') + '</p>';
}
load();
