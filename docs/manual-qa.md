# Manual Visual QA — Phases 0–2

This guide prepares a complete local session to inspect the Hebrew RTL app
**before** Phase 3 (real cameras).

## Start (two terminals)

### Terminal 1 — Backend

```powershell
cd C:\VISIONLAYER
.\scripts\dev-backend.ps1
```

Or:

```bash
cd /path/to/VISIONLAYER
bash scripts/dev-backend.sh
```

### Terminal 2 — Frontend

```powershell
cd C:\VISIONLAYER
.\scripts\dev-frontend.ps1
```

Or:

```bash
bash scripts/dev-frontend.sh
```

### Open

- App: [http://localhost:3000](http://localhost:3000)
- API health: [http://localhost:8000/health](http://localhost:8000/health)

### Login

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin123` |

Demo data is seeded automatically on a **fresh** DB (`VL_SEED_DEMO=true` in development):

- 3 cameras (שער כניסה, מחסן אחורי, חניון עובדים)
- 4 zones
- 3 rules
- 5 historical events

To re-seed from scratch:

```powershell
.\scripts\reset-demo-db.ps1
# then restart backend
```

## Simulation (dev only)

1. Open **עוד** (bottom nav / sidebar).
2. Under **כלי פיתוח**, open **סימולציה**.
3. Or go directly to [http://localhost:3000/dev/simulate](http://localhost:3000/dev/simulate).

Recommended first trigger:

- Camera: **שער כניסה**
- Zone: **אזור שער**
- Scenario: **אדם נכנס לאזור**

Then open **אירועים** — a new event should appear (toast + list). WebSocket updates the UI live.

## Step-by-step visual QA flow

### A. Seeded path (fast)

1. Login → Dashboard (**בית**) shows stats + recent events.
2. **מצלמות** — browse 3 cameras, open detail, check zones.
3. **חוקים** — browse rules (Hebrew labels, no raw IDs).
4. **אירועים** — open a **חדש** event → **אישור אירוע**.
5. **עוד** → **סימולציה** → run scenario → toast + new event in feed.

### B. Full create path (required)

1. **מצלמות** → **הוספת מצלמה** → name + location → save.
2. Open the new camera → **הוספת אזור** → draw ≥3 polygon points on the mock background → name → save.
3. **חוקים** → **חוק חדש** → guided builder (object / camera / zone / schedule / duration) → save.
4. **עוד** → **סימולציה** → select that camera + zone → **אדם נכנס לאזור** (or loiter if min duration > 0) → run.
5. Confirm toast **אירוע חדש**, event on Dashboard + Events.
6. Open the event → **אישור אירוע** → state becomes **אושר**.

### Visual checklist (every screen)

- Hebrew copy only (no English UI chrome except brand name)
- RTL layout (`dir=rtl`)
- Mobile bottom nav + desktop sidebar
- Loading / empty / error Hebrew states
- Grayscale, rounded cards, Lucide icons
- No raw JSON unless **פרטים טכניים** is expanded
- Simulation marked as internal (not a customer feature)

## Not in scope

RTSP, ONVIF, real video, AI, Live View, Push delivery, Cloud, Phase 3+.
