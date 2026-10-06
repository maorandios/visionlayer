"""One-shot QA flow verification against a running Edge API."""

from __future__ import annotations

import json
import urllib.request

BASE = "http://127.0.0.1:8000"


def req(method: str, path: str, data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None if data is None else json.dumps(data).encode()
    request = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request) as res:
        raw = res.read().decode()
        return res.status, json.loads(raw) if raw else None


def main() -> None:
    _, login = req("POST", "/api/v1/auth/login", {"username": "admin", "password": "admin123"})
    token = login["access_token"]
    print("OK login")

    _, cams = req("GET", "/api/v1/cameras", token=token)
    assert len(cams) >= 3, cams
    print(f"OK seed cameras={len(cams)}")

    _, cam = req(
        "POST",
        "/api/v1/cameras",
        {"name": "QA מצלמה", "location": "בדיקה", "enabled": True},
        token=token,
    )
    cam_id = cam["id"]
    print("OK create camera", cam_id)

    poly = [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]
    _, zone = req(
        "POST",
        f"/api/v1/cameras/{cam_id}/zones",
        {"name": "QA אזור", "points": poly, "enabled": True},
        token=token,
    )
    zone_id = zone["id"]
    print("OK create zone", zone_id)

    rule_body = {
        "name": "QA חוק אדם",
        "enabled": True,
        "conditions": {
            "object_classes": ["person"],
            "camera_id": cam_id,
            "zone_id": zone_id,
            "schedule": {"from": "00:00", "to": "23:59"},
            "min_duration_seconds": 0,
        },
        "actions": [{"type": "push_notification"}],
        "cooldown_seconds": 0,
    }
    _, rule = req("POST", "/api/v1/rules", rule_body, token=token)
    print("OK create rule", rule["id"])

    _, sim = req(
        "POST",
        "/api/v1/simulate/scenario",
        {"scenario": "person_enter_zone", "camera_id": cam_id, "zone_id": zone_id},
        token=token,
    )
    assert sim["event_ids"], sim
    event_id = sim["event_ids"][0]
    print("OK simulate event", event_id)

    _, ev = req("GET", f"/api/v1/events/{event_id}", token=token)
    assert ev["state"] == "new"
    assert ev["message_he"]
    print("OK open event")

    _, ack = req("PATCH", f"/api/v1/events/{event_id}/acknowledge", {}, token=token)
    assert ack["state"] == "acknowledged"
    print("OK acknowledge")
    print("FLOW_OK")


if __name__ == "__main__":
    main()
