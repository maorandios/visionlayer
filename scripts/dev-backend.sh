#!/usr/bin/env bash
# Start VisionLayer Edge API for local visual QA (Phases 0–2).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/services/edge-api"

if [[ ! -d .venv ]]; then
  python -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -e ".[dev]" -q

export VL_ENV="${VL_ENV:-development}"
export VL_SEED_DEMO="${VL_SEED_DEMO:-true}"
export FEATURE_SIMULATE_DETECTIONS="${FEATURE_SIMULATE_DETECTIONS:-true}"
export VL_CORS_ORIGINS="${VL_CORS_ORIGINS:-http://localhost:3000,http://127.0.0.1:3000}"

mkdir -p data
echo "Edge API → http://localhost:8000  (login admin / admin123)"
exec uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
