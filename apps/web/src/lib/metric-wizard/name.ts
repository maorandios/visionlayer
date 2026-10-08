import { OBJECT_TYPE_LABELS, metricTypeConfig, type MetricDefType, type VisionObjectType } from "@/lib/vision-capabilities";

const PLURAL: Record<VisionObjectType, string> = {
  person: "אנשים",
  vehicle: "רכבים",
  car: "מכוניות",
  truck: "משאיות",
  bus: "אוטובוסים",
  motorcycle: "אופנועים",
  bicycle: "אופניים",
};

export function suggestMetricName(opts: {
  metricType: MetricDefType;
  objectType: VisionObjectType;
  placeName?: string | null;
  directionLabel?: string | null;
}): string {
  const { metricType, objectType, placeName, directionLabel } = opts;
  const obj = PLURAL[objectType] ?? OBJECT_TYPE_LABELS[objectType];
  const singular = OBJECT_TYPE_LABELS[objectType];
  const place = (placeName ?? "").trim();

  switch (metricType) {
    case "entries":
      return place ? `כניסות ${obj} ב${place}` : `כניסות ${obj}`;
    case "exits":
      return place ? `יציאות ${obj} מ${place}` : `יציאות ${obj}`;
    case "line_crossings":
      if (place && directionLabel) return `${obj} שחצו את ${place} (${directionLabel})`;
      if (place) return `${obj} שחצו את ${place}`;
      return `חציות קו — ${obj}`;
    case "occupancy_current":
      return place ? `תפוסת ${obj} ב${place}` : `תפוסת ${singular}`;
    case "occupancy_peak":
      return place ? `שיא תפוסת ${obj} ב${place}` : `שיא תפוסת ${obj}`;
    case "dwell_avg":
      return place ? `זמן שהייה ממוצע ב${place}` : "זמן שהייה ממוצע";
    case "dwell_max":
      return place ? `זמן שהייה מקסימלי ב${place}` : "זמן שהייה מקסימלי";
    case "objects_observed":
      return place ? `${obj} שנצפו ב${place}` : `${obj} שנצפו במצלמה`;
    default:
      return metricTypeConfig(metricType).label;
  }
}

export function summarizeMetric(opts: {
  metricType: MetricDefType;
  objectType: VisionObjectType;
  placeName?: string | null;
  directionLabel?: string | null;
  name: string;
}): { title: string; body: string } {
  const cfg = metricTypeConfig(opts.metricType);
  const obj = PLURAL[opts.objectType] ?? OBJECT_TYPE_LABELS[opts.objectType];
  const place = opts.placeName ? `"${opts.placeName}"` : null;
  const dir = opts.directionLabel;

  let body = "";
  switch (opts.metricType) {
    case "entries":
      body = place
        ? `המערכת תספור ${obj} שחוצים את ${place}${dir ? ` בכיוון ${dir}` : ""}.`
        : `המערכת תספור כניסות של ${obj}.`;
      break;
    case "exits":
      body = place
        ? `המערכת תספור ${obj} שיוצאים דרך ${place}${dir ? ` בכיוון ${dir}` : ""}.`
        : `המערכת תספור יציאות של ${obj}.`;
      break;
    case "line_crossings":
      body = place
        ? `המערכת תספור חציות של ${obj} בקו ${place}${dir ? ` (${dir})` : ""}.`
        : `המערכת תספור חציות קו של ${obj}.`;
      break;
    case "occupancy_current":
      body = place
        ? `המערכת תציג כמה ${obj} נמצאים כרגע באזור ${place}.`
        : `המערכת תציג תפוסה נוכחית של ${obj}.`;
      break;
    case "occupancy_peak":
      body = place
        ? `המערכת תעקוב אחרי שיא התפוסה של ${obj} באזור ${place}.`
        : `המערכת תעקוב אחרי שיא תפוסת ${obj}.`;
      break;
    case "dwell_avg":
      body = place
        ? `המערכת תחשב זמן שהייה ממוצע באזור ${place}.`
        : "המערכת תחשב זמן שהייה ממוצע.";
      break;
    case "dwell_max":
      body = place
        ? `המערכת תעקוב אחרי זמן השהייה הארוך ביותר באזור ${place}.`
        : "המערכת תעקוב אחרי זמן שהייה מקסימלי.";
      break;
    case "objects_observed":
      body = place
        ? `המערכת תספור מסלולי מעקב של ${obj} באזור ${place} (לא זהות אדם קבועה).`
        : `המערכת תספור מסלולי מעקב של ${obj} בכל שדה הראייה (לא זהות אדם קבועה).`;
      break;
    default:
      body = cfg.description;
  }

  return { title: opts.name || suggestMetricName(opts), body };
}
