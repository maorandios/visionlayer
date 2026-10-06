# Phase 2 Visual QA prep

## Delivered

- Demo seed (3 cameras, 4 zones, 3 rules, 5 events) when `VL_SEED_DEMO` is on and DB is empty
- Start scripts: `scripts/dev-backend.*`, `scripts/dev-frontend.*`, `scripts/reset-demo-db.ps1`
- Manual QA guide: `docs/manual-qa.md`
- UI polish: Hebrew labels for camera/zone/rule/state/severity; simulation behind “כלי פיתוח”; no raw IDs in feeds; technical JSON collapsed

## Verification

- edge-api: 48 tests
- web: vitest / lint / typecheck / build / playwright
- `scripts/verify-qa-flow.py` create → zone → rule → simulate → ack

## Phase 3

Not started.
