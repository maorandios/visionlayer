#!/usr/bin/env bash
# Validate docker compose files without starting containers.
set -euo pipefail
cd "$(dirname "$0")/../docker"
docker compose config >/dev/null
echo "docker compose config: OK"
