# Helper push 7router ke GitHub - jalankan sekali saja
# Cara pakai: klik kanan file ini > Run with PowerShell,
# atau dari PowerShell: .\push-to-github.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "git belum terinstall. Install dari https://git-scm.com/download/win lalu ulangi." -ForegroundColor Red
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

Write-Host ""
Write-Host "Push ke https://github.com/aqilaziz/7router.git ..." -ForegroundColor Cyan
Write-Host "Login: username=aqilaziz, password=Personal Access Token (bukan password akun)." -ForegroundColor Yellow
git push -u origin main
Write-Host "Selesai!" -ForegroundColor Green
