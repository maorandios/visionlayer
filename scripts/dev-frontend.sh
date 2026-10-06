#!/usr/bin/env bash
# Start VisionLayer Web for local visual QA (Phase 2).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/web"

if [[ ! -d node_modules ]]; then
  npm install
fi

export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8000}"
echo "Web → http://localhost:3000  (API: $NEXT_PUBLIC_API_URL)"
exec npm run dev -- --hostname 127.0.0.1 --port 3000
