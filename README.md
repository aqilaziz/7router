# 7router (provider lokal mirip 9Router, jalan lokal)

Gateway OpenAI-compatible + dashboard web. Cocok untuk BYOK di VS Code
(Cline, Roo Code, Continue, dll).

## Fitur sesuai permintaan
1. **Tambah provider** via dashboard: nama + base URL + skema auth (Bearer / x-api-key).
2. **Banyak API key per provider**, dipakai **berurutan** (priority kecil dulu).
   Kalau key kena 429 / kuota habis / 401 / 5xx / timeout -> otomatis **failover
   ke key berikutnya**. Key 401 ditandai `invalid`, key 429 masuk `cooldown`.
3. **Nama model + base URL sendiri**: daftarkan *alias model* (mis. `auto-free`)
   yang dipetakan ke `upstream_model` provider. Akses via `http://localhost:8787/v1`
   selama service jalan.

## Teknologi
- **Node.js + TypeScript + Fastify** (ringan, cepat, satu proses)
- **better-sqlite3** (database file lokal, tanpa server tambahan)
- **Dashboard HTML/JS murni** (tanpa build step)
- Protokol **OpenAI-compatible**: `/v1/chat/completions`, `/v1/completions`,
  `/v1/embeddings`, `/v1/models`, dll.

## Cara jalan (di PC sendiri setelah clone dari GitHub)
```powershell
git clone https://github.com/aqilaziz/7router.git
cd 7router
copy .env.example .env
npm install
npm run dev
```
Buka http://localhost:8787

> Catatan: file `.env` dan folder `data/` TIDAK ikut di-push (sudah ada di
> `.gitignore`), jadi tiap orang yang clone wajib `copy .env.example .env`
> lalu isi `GATEWAY_API_KEY` sendiri + tempel API key provider masing-masing
> lewat dashboard.

## Cara pakai di VS Code (BYOK)
- **Base URL**: `http://localhost:8787/v1`
- **API Key**: isi `GATEWAY_API_KEY` dari file `.env` (default `local-dev-key-123`)
- **Model**: alias yang kamu daftarkan di dashboard (mis. `auto-free`)

Contoh Cline / Roo Code: pilih provider **OpenAI Compatible**, isi 3 field di atas.
Contoh Continue `config.yaml`:
```yaml
models:
  - name: auto-free (via lokal)
    provider: openai
    model: auto-free
    apiBase: http://localhost:8787/v1
    apiKey: local-dev-key-123
```

## Alur kerja yang disarankan
1. Tambah provider (atau pakai preset OpenRouter/Groq/Cerebras/Gemini/DeepSeek).
2. Tambahkan 1..n API key gratis ke provider itu (tombol "+ Key").
3. Daftarkan alias model, mis. alias `auto-free` -> upstream
   `meta-llama/llama-3.3-70b-instruct:free` di provider openrouter.
4. Pakai alias itu dari VS Code. Kalau key #1 limit habis, router otomatis
   pakai key #2, dst. Cek tab Status & Log untuk melihat key mana yang cooldown.

## Struktur data (SQLite)
- `providers(id, name, base_url, auth_scheme, ...)`
- `api_keys(id, provider_id, label, key_value, status, priority, cooldown_until, ...)`
- `virtual_models(alias, provider_id, upstream_model)`
- `request_logs(...)`
