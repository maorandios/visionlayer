# VisionLayer

Edge AI platform for IP cameras — Hebrew-first, hardware-agnostic Product Layer.

## Phase status

**Video Test Lab complete** (inserted before original Phase 3 / RTSP).

Phases 0–2 remain. See [docs/phases/video-test-lab.md](docs/phases/video-test-lab.md).

Default login: `admin` / `admin123`.

## Manual visual QA

Guide: **[docs/manual-qa.md](docs/manual-qa.md)**

```powershell
.\scripts\dev-backend.ps1
.\scripts\dev-frontend.ps1
python .\scripts\download-dev-model.py   # optional YOLOX-Nano ONNX
```

Open http://localhost:3000 — Video Lab under **עוד → מעבדת וידאו**.

## Quick start (local)

### Edge API

```bash
cd services/edge-api
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

Requires Python **3.11+**.

### Web

```bash
cd apps/web
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL=http://localhost:8000` if needed.

### Docker Compose

```bash
cd infra/docker
docker compose config
docker compose up --build
```

## Repository layout

See [docs/architecture.md](docs/architecture.md).

## License

Proprietary — all rights reserved.
