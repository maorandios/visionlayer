# מעבדת וידאו — סיכום סטאק, זרימה והצגה

מסמך סיכום למצב הנוכחי של **Video Test Lab** ב־VisionLayer: מה בנוי, איך זה עובד, ואיך מוצג ניתוח AI לסרטונים.

> **הקשר:** שכבות 0–2 + מעבדת וידאו (לפני Phase 3 / מצלמות RTSP אמיתיות).  
> **מטרה:** להוכיח את ליבת המוצר עם MP4 מועלה → זיהוי אמיתי → מעקב → אזורים → חוקים → אירועים.

---

## 1. סטאק קיים

### שכבות המערכת

| שכבה | רכיב | תפקיד |
|------|------|--------|
| Frontend | `apps/web` (Next.js) | UI עברי RTL — `/dev/video-lab` |
| Product API | `services/edge-api` (FastAPI) | העלאה, Jobs, אזורים, חוקים, אירועים |
| Vision | `services/vision` | זיהוי + מעקב + צינור ניתוח וידאו |
| Data | `data/test-videos`, `data/test-frames`, `data/models` | קבצי סרטון, תצוגות מקדימות, מודלי ONNX |

**גבול אדריכלי חשוב:** ה־Product Layer (`edge-api`) מייבא מ־vision **רק** את `lab_api` — לא את מודולי הזיהוי ישירות.

### זיהוי ומעקב (רישוי בטוח)

| רכיב | בחירה | רישיון |
|------|--------|--------|
| מודל | YOLOX (COCO) ב־ONNX | Apache-2.0 |
| Runtime | ONNX Runtime | MIT |
| Tracker | **ByteTrack** (`ByteTrackAdapter`, clean-room) | אלגוריתם מפורסם; ייחוס MIT; בלי AGPL |
| Tracker (fallback) | IoU | קוד הפרויקט |
| וידאו I/O | OpenCV | Apache-2.0 |

**לא בשימוש:** Ultralytics / YOLO AGPL; BoxMOT (AGPL).  
פירוט: [`docs/phases/bytetrack.md`](bytetrack.md).

### מודלים מקומיים (עדיפות)

קבצים תחת `data/models/` (לא ב־git):

ברירת מחדל לפיתוח: `yolox_s` (`VISION_YOLOX_MODEL`). YOLOX-M נשאר זמין לדיוק גבוה יותר.

סדר חיפוש: מודל מועדף → `yolox_m` → `yolox_s` → `yolox_tiny` → `yolox_nano`.

הורדה:

```powershell
python scripts/download-dev-model.py
```

אם אין ONNX / מצב `ENVIRONMENT=test` → `ScriptedDetector` (לבדיקות אוטומטיות).

### מחלקות אובייקט פעילות

`person`, `bicycle`, `motorcycle`, `car`, `truck`, `bus`

ספי ביטחון אופייניים (משוערים בקוד): אדם ≥ ~0.40, אופניים ≥ ~0.45, אופנוע ≥ ~0.50.  
בלבול אופניים↔אופנוע מאוחד כשיש חפיפה חזקה בין התיבות.

---

## 2. אופן הפעולה (זרימה מקצה לקצה)

```text
העלאת MP4
  → VideoLabAsset + מצלמה וירטואלית (Camera)
  → (אופציונלי) ציור אזור (Zone) על תמונת תצוגה
  → (אופציונלי) יצירת חוק (Rule) על מצלמה+אזור+מחלקת אובייקט
  → "הרץ ניתוח AI"
       → lab_api.run_video_lab_analysis
            UploadedVideoSource
              → YoloxOnnxDetector
              → ByteTrackAdapter (ברירת מחדל)
              → Detection מאוחד (timestamp של הווידאו, לא שעון קיר)
       → Event Bus / DetectionPipeline
            → ZonePresenceTracker
            → Rule Engine
            → Event (payload.source = development_video)
  → VideoLabJob: סיכום + overlays + timeline + diagnostics
```

### שלבי המשתמש בממשק

1. התחברות → **עוד** → **מעבדת וידאו** (`/dev/video-lab`)
2. העלאת MP4 (עד ~30 שניות) עם שם בעברית
3. פתיחת מצלמה וירטואלית → ציור אזור
4. יצירת חוק (`?lab=1`) — מומלץ משך מינימלי 0 ו־cooldown 0
5. הרצת ניתוח AI
6. צפייה בתיבות, סינון מחלקה, קפיצה לפריים, בדיקת התאמות חוק / אירועים

### API עיקרי

| פעולה | נתיב |
|--------|------|
| רשימת סרטונים | `GET /api/v1/video-lab/assets` |
| העלאה | `POST /api/v1/video-lab/assets` |
| ניתוח | `POST /api/v1/video-lab/assets/{id}/analyze` |
| סטטוס Job | `GET /api/v1/video-lab/jobs/{id}` |
| סטרים וידאו / תצוגה | `.../video`, `.../preview` |
| תמונת מסלול | `GET /api/v1/video-lab/jobs/{id}/tracks/{track_id}/image` |
| פריים ישן (best-of-class) | `GET /api/v1/video-lab/jobs/{id}/frames/{image_key}` |

Feature flag: `FEATURE_VIDEO_LAB` / `features.video_lab`.

### חוקים ואירועים

- חוק מגדיר: **מחלקת אובייקט** + **מצלמה** + **אזור** + לוח זמנים + משך מינימלי באזור.
- זמני הווידאו נשמרים כ־`base_unix_ts + timestamp_sec` כדי שמשך שהייה באזור יהיה נכון גם בניתוח מהיר מהזמן האמיתי.
- אחרי ניתוח נבנית **דיאגנוסטיקה לחוקים** (למה הופעל / לא הופעל): לא זוהה, לא באזור, משך קצר מדי, מחוץ ללוח זמנים, וכו'.

### קבצים מרכזיים

| אזור | נתיב |
|------|------|
| UI מעבדה | `apps/web/src/app/(shell)/dev/video-lab/page.tsx` |
| Orchestration | `services/edge-api/app/domain/video_lab/service.py` |
| דיאגנוסטיקה | `services/edge-api/app/domain/video_lab/diagnostics.py` |
| כניסת Vision | `services/vision/lab_api.py` |
| צינור ניתוח | `services/vision/pipeline/video_analyzer.py` |
| YOLOX | `services/vision/detectors/yolox_onnx.py` |
| Tracker | `services/vision/trackers/bytetrack_adapter.py` |
| Runtime perf | `services/vision/runtime_config.py` |
| Track gallery | `services/vision/pipeline/track_results.py` |
| Result JPEGs | `services/edge-api/app/domain/video_lab/snapshots.py` |
| Rule engine | `services/edge-api/app/domain/rules/engine.py` |

---

## 3. הצגת ניתוח AI בממשק

מסך `/dev/video-lab` מאורגן סביב **גלריית זיהויים לפי מסלול ייחודי** — לא ניווט חזרה לסרטון כחוויית תוצאה ראשית.

### סיכום אחרי ניתוח

| אלמנט | מה מוצג |
|--------|---------|
| כותרת | «ניתוח הושלם» + הנחיה בעברית |
| סיכום מחלקות | מספרים = **מסלולים ייחודיים** (אדם / מכונית / אופנוע / …) |
| מסנן גלריה | הכל · אנשים · מכוניות · אופנועים · משאיות · אופניים · אוטובוסים |
| גלריית זיהויים | כרטיס אחד לכל `track_id` עם פריים מייצג + BB של האובייקט בלבד |
| חוקים | הותאמו / לא הותאמו |
| אירועים | קישור לפרטי אירוע; תמונה מייצגת כשיש `track_id` תואם |
| סרטון מקור | אופציונלי תחת «הצג סרטון מקור» — לא חובה לבדיקת תוצאות |
| אבחון פיתוח | קטע מתקפל: FPS, stride, threads, מודל, inference |

### כרטיס גלריה

- תמונת JPEG מקומית תחת `data/test-results/{job_id}/track_XXXX.jpg`
- תווית עברית + אחוז ביטחון
- משך נראות בווידאו (שניות)
- `#track_id` רק במצב פיתוח

### הבחנה חשובה במספרים

| מונח | משמעות |
|------|--------|
| זיהויים בפריימים | כמה פעמים המודל סימן אובייקט בכל הפריימים (יכול להיות אלפים) |
| מסלולים ייחודיים | כמה אובייקטים שונים ה־tracker ייצב — **מספר כרטיסי הגלריה** |

---

## 3b. ביצועי פיתוח (CPU)

ברירות מחדל שמרניות (env):

| הגדרה | ברירת מחדל | משתנה |
|--------|-------------|--------|
| מודל מועדף | `yolox_s` | `VISION_YOLOX_MODEL` |
| Frame stride | `3` | `VISION_FRAME_STRIDE` |
| ORT intra threads | `4` | `VISION_ONNX_INTRA_OP_THREADS` |
| ORT inter threads | `1` | `VISION_ONNX_INTER_OP_THREADS` |
| OpenCV threads | `2` | `VISION_OPENCV_NUM_THREADS` |

- ניתוח אחד בלבד בו־זמנית (הודעה בעברית אם כבר רץ ניתוח).
- ByteTrack נשאר ברירת המחדל.
- משכי חוקים מבוססים על **זמן וידאו**, לא על מהירות עיבוד / stride.
- בנצ׳מרק: `scripts/benchmark-video-lab-perf.py` → `docs/phases/video-lab-perf-benchmark.json`

---

## 4. מגבלות ידועות (לשדרוג עתידי)

- **פיצול מסלולים:** ללא ReID, אובייקט אחד עלול להתפצל לכמה `track_id` (מופיע באזהרת fragmentation באבחון).
- **Stride:** דילוג על פריימים מאיץ ניתוח אך עלול להחליש מעקב בסצנות מהירות.
- **דיוק:** סצנות צפופות / אובייקטים קטנים עדיין עלולים לבלבל (אופניים↔אופנוע).
- **Phase 3:** מצלמות RTSP/ONVIF אמיתיות — **עדיין לא התחיל**.

---

## 5. בדיקות ידניות מקוצרות

1. להפעיל backend + frontend (ראו `docs/manual-qa.md`).
2. לוודא מודל ב־`data/models/` (מומלץ `yolox_s.onnx` לפיתוח).
3. להתחבר → מעבדת וידאו → להעלות MP4.
4. לצייר אזור → ליצור חוק על המחלקה הרצויה (משך 0).
5. להריץ ניתוח → לבדוק גלריית כרטיסים (כרטיס אחד לכל מסלול), סינון מחלקה, חוקים/אירועים — **בלי** לקפוץ חזרה לסרטון.

---

## 6. מה זה מוכיח מול Phase 3

המעבדה מוכיחה את אותו נתיב מוצר:

**מקור פריימים → זיהוי → מעקב → אזור → חוק → אירוע → UI**

רק שמקור הפריימים הוא קובץ MP4 + מצלמה וירטואלית, במקום סטרים חי ממצלמה פיזית.
