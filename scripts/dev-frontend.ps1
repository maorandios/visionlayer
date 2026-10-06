# Start VisionLayer Web for local visual QA (Phase 2).
$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$WebDir = Join-Path $RepoRoot "apps\web"
Set-Location $WebDir

if (-not (Test-Path "node_modules")) {
  npm install
}

if (-not $env:NEXT_PUBLIC_API_URL) {
  $env:NEXT_PUBLIC_API_URL = "http://localhost:8000"
}

Write-Host "Web → http://localhost:3000  (API: $($env:NEXT_PUBLIC_API_URL))"
npm run dev -- --hostname 127.0.0.1 --port 3000
