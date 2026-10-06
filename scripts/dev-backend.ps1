# Start VisionLayer Edge API for local visual QA (Phases 0–2).
$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ApiDir = Join-Path $RepoRoot "services\edge-api"
Set-Location $ApiDir

if (-not (Test-Path ".venv")) {
  python -m venv .venv
}
& .\.venv\Scripts\Activate.ps1
pip install -e ".[dev]" -q

if (-not $env:VL_ENV) { $env:VL_ENV = "development" }
if (-not $env:VL_SEED_DEMO) { $env:VL_SEED_DEMO = "true" }
if (-not $env:FEATURE_SIMULATE_DETECTIONS) { $env:FEATURE_SIMULATE_DETECTIONS = "true" }
if (-not $env:VL_CORS_ORIGINS) {
  $env:VL_CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
}

New-Item -ItemType Directory -Force -Path "data" | Out-Null
Write-Host "Edge API → http://localhost:8000  (login admin / admin123)"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
