import json
import tempfile
from pathlib import Path

import cv2
import httpx
import numpy as np

p = Path(tempfile.gettempdir()) / "vl_upload_test.mp4"
w = cv2.VideoWriter(str(p), cv2.VideoWriter_fourcc(*"mp4v"), 10, (160, 120))
for i in range(15):
    img = np.zeros((120, 160, 3), dtype=np.uint8)
    img[:] = 40
    cv2.rectangle(img, (20 + i, 30), (60 + i, 100), (0, 255, 0), -1)
    w.write(img)
w.release()

login = httpx.post(
    "http://127.0.0.1:8000/api/v1/auth/login",
    json={"username": "admin", "password": "admin123"},
)
login.raise_for_status()
token = login.json()["access_token"]
r = httpx.post(
    "http://127.0.0.1:8000/api/v1/video-lab/assets",
    headers={"Authorization": f"Bearer {token}"},
    files={"file": ("t.mp4", p.read_bytes(), "video/mp4")},
    data={"name_he": "בדיקת העלאה", "location": "QA"},
    timeout=60,
)
print("UPLOAD", r.status_code)
print(r.text[:500])
