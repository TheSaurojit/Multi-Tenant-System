<#
.SYNOPSIS
  Runs the 50 VU k6 load test against the Next.js Multi-Tenant SaaS Analytics Platform.

.DESCRIPTION
  This script verifies prerequisites, checks for generated session tokens,
  and executes scripts/k6-load-test.js to measure dashboard and CSV export p(95) latency.

.PARAMETER Quick
  Runs a 15-second verification smoke test (50 VUs) instead of the full 2m30s scenario.

.PARAMETER VUs
  The number of concurrent virtual users (defaults to 50).

.PARAMETER BaseUrl
  The base application URL (defaults to http://localhost:3000).

.EXAMPLE
  .\scripts\run-loadtest.ps1 -Quick
  .\scripts\run-loadtest.ps1
#>

param(
  [switch]$Quick,
  [int]$VUs = 50,
  [string]$BaseUrl = "http://localhost:3000"
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "    🚀 Multi-Tenant SaaS Platform - 50 VU k6 Load Test     " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check if tokens file exists
$tokensPath = Join-Path $PSScriptRoot "..\loadtest-tokens.json"
if (-not (Test-Path $tokensPath)) {
  Write-Host "⚠️  loadtest-tokens.json not found! Generating 50 user session tokens now..." -ForegroundColor Yellow
  npm run loadtest:users
  if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to generate load-test users. Please ensure Docker/Postgres is running." -ForegroundColor Red
    exit 1
  }
}

# 2. Check if target server is running
Write-Host "🔍 Checking server connection at $BaseUrl ..." -ForegroundColor Gray
$serverActive = $false
try {
  $response = Invoke-WebRequest -Uri "$BaseUrl/login" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
  if ($response.StatusCode -eq 200 -or $response.StatusCode -eq 307 -or $response.StatusCode -eq 308) {
    $serverActive = $true
  }
} catch {
  $serverActive = $false
}

if (-not $serverActive) {
  Write-Host ""
  Write-Host "⚠️  Server at $BaseUrl is not responding!" -ForegroundColor Yellow
  Write-Host "   Please ensure your production server is running:" -ForegroundColor White
  Write-Host "   Terminal 1: npm run build; npm start" -ForegroundColor Cyan
  Write-Host "   Then re-run this script in Terminal 2." -ForegroundColor White
  Write-Host ""
  exit 1
}

Write-Host "✅ Server is live at $BaseUrl" -ForegroundColor Green
Write-Host "👥 Target VUs: $VUs" -ForegroundColor White

# Pre-warm server endpoints (dashboard + export) so JIT and cache are primed
Write-Host "🔥 Pre-warming dashboard and export endpoints..." -ForegroundColor Gray
try {
  $tokensRaw = Get-Content $tokensPath -Raw | ConvertFrom-Json
  $cfgPath = Join-Path $PSScriptRoot "..\loadtest-config.json"
  $cfg = if (Test-Path $cfgPath) { Get-Content $cfgPath -Raw | ConvertFrom-Json } else { $null }
  $orgHeader = if ($cfg -and $cfg.activeOrg) { "; saas_active_org=$($cfg.activeOrg)" } else { "" }
  $wsHeader = if ($cfg -and $cfg.activeWorkspace) { "; saas_active_workspace=$($cfg.activeWorkspace)" } else { "" }
  $cookieVal = "saas_auth_token=$($tokensRaw[0])$orgHeader$wsHeader"

  & curl.exe -s -o NUL -H "Cookie: $cookieVal" -H "Accept-Encoding: gzip, deflate" "$BaseUrl/dashboard?range=last7"
  & curl.exe -s -o NUL -H "Cookie: $cookieVal" -H "Accept-Encoding: gzip, deflate" "$BaseUrl/api/workspace/export?range=last30"
  Write-Host "✅ Server pre-warmed successfully." -ForegroundColor Green
} catch {
  Write-Host "⚠️  Pre-warm skipped." -ForegroundColor Gray
}

# 3. Determine run flags
$env:BASE_URL = $BaseUrl
$env:VUS = $VUs

if ($Quick) {
  Write-Host "⚡ Running quick 15s verification run (3s ramp, 10s hold, 2s cooldown)..." -ForegroundColor Magenta
  $env:RAMP_DURATION = "3s"
  $env:DURATION = "10s"
  $env:COOLDOWN_DURATION = "2s"
} else {
  Write-Host "⏱️  Running full benchmark (20s ramp, 2m hold, 10s cooldown)..." -ForegroundColor White
  $env:RAMP_DURATION = "20s"
  $env:DURATION = "2m"
  $env:COOLDOWN_DURATION = "10s"
}

Write-Host ""
Write-Host "Executing: k6 run scripts/k6-load-test.js" -ForegroundColor Gray
Write-Host "------------------------------------------------------------" -ForegroundColor Gray

k6 run (Join-Path $PSScriptRoot "k6-load-test.js")
$k6ExitCode = $LASTEXITCODE

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor Gray
if ($k6ExitCode -eq 0) {
  Write-Host "🎉 SUCCESS! All thresholds passed: p(95) < 2000ms and zero failed requests." -ForegroundColor Green
} else {
  Write-Host "⚠️  k6 completed with threshold warnings or crossed limits (exit code $k6ExitCode)." -ForegroundColor Yellow
  Write-Host "   Review the p(95) metrics above for export_duration and dashboard_duration." -ForegroundColor Yellow
}
Write-Host "============================================================" -ForegroundColor Cyan

exit $k6ExitCode
