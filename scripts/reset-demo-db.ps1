# Reset local SQLite DB so demo seed runs again on next backend start.
$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Db = Join-Path $RepoRoot "services\edge-api\data\visionlayer.db"
if (Test-Path $Db) {
  Remove-Item $Db -Force
  Write-Host "Deleted $Db"
} else {
  Write-Host "No DB file at $Db (already clean)"
}
Write-Host "Restart the backend to re-seed demo data."
