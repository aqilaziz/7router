# Helper push 7router ke GitHub - JALANKAN MANUAL DARI POWERSHELL KAMU
# Cara pakai: klik kanan file ini > Run with PowerShell,
# atau dari PowerShell: .\push-to-github.ps1
#
# PENTING: jangan pernah tulis token di file ini / di chat.
# Siapkan token di variabel environment dulu:
#   $env:GITHUB_PAT = "ghp_xxxx"   (tempel token baru, tutup petik)
# Lalu jalankan script ini. Token tidak tersimpan di file / history repo.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "git belum terinstall. Install dari https://git-scm.com/download/win lalu ulangi." -ForegroundColor Red
  exit 1
}
if (-not $env:GITHUB_PAT) {
  Write-Host "Set dulu token: " -NoNewline -ForegroundColor Yellow
  Write-Host '$env:GITHUB_PAT = "ghp_xxxx"' -ForegroundColor White
  exit 1
}

if (-not (Test-Path ".git")) {
  git init
  git branch -M main
  git remote add origin https://github.com/aqilaziz/7router.git
  Write-Host "Repo lokal init + remote origin ditambahkan." -ForegroundColor Green
}

git add .
$status = git status --short
if (-not $status) { Write-Host "Tidak ada perubahan untuk di-commit." -ForegroundColor Yellow }
else {
  $msg = Read-Host "Pesan commit (Enter = 'feat: 7router update')"
  if (-not $msg) { $msg = "feat: 7router update" }
  git commit -m $msg
}

Write-Host "Push ke https://github.com/aqilaziz/7router.git ..." -ForegroundColor Cyan
git push https://aqilaziz:$env:GITHUB_PAT@github.com/aqilaziz/7router.git main:main
Remove-Variable GITHUB_PAT -Scope Global -ErrorAction SilentlyContinue
$env:GITHUB_PAT = $null
Write-Host "Selesai! Token dihapus dari memory." -ForegroundColor Green

