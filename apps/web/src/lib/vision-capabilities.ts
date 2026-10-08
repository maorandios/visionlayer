/**
 * Central VisionLayer capability registry (POC: RF-DETR Large class set).
 * Keep in sync with services/edge-api/app/domain/vision_capabilities.py
 */

export const OBJECT_TYPES = [
  "person",
  "vehicle",
  "car",
  "truck",
  "bus",
  "motorcycle",
  "bicycle",
] as const;

export type VisionObjectType = (typeof OBJECT_TYPES)[number];

export const VEHICLE_CLASSES = ["car", "truck", "bus", "motorcycle"] as const;

export const OBJECT_TYPE_TO_CLASSES: Record<VisionObjectType, readonly string[]> = {
  person: ["person"],
  vehicle: VEHICLE_CLASSES,
  car: ["car"],
  truck: ["truck"],
  bus: ["bus"],
  motorcycle: ["motorcycle"],
  bicycle: ["bicycle"],
};

export const OBJECT_TYPE_LABELS: Record<VisionObjectType, string> = {
  person: "אדם",
  vehicle: "רכב",
  car: "מכונית",
  truck: "משאית",
  bus: "אוטובוס",
  motorcycle: "אופנוע",
  bicycle: "אופניים",
};

export type MetricDefType =
  | "entries"
  | "exits"
  | "line_crossings"
  | "occupancy_current"
  | "occupancy_peak"
  | "dwell_avg"
  | "dwell_max"
  | "objects_observed";

export type MetricSpatialNeed = "line" | "zone" | "optional_zone";

export type MetricTypeConfig = {
  id: MetricDefType;
  label: string;
  description: string;
  spatial: MetricSpatialNeed;
  direction: false | true | "optional";
  realtime?: boolean;
};

export const METRIC_TYPES: MetricTypeConfig[] = [
  {
    id: "entries",
    label: "כניסות",
    description: "כמה אובייקטים נכנסו דרך נקודה מסוימת",
    spatial: "line",
    direction: true,
  },
  {
    id: "exits",
    label: "יציאות",
    description: "כמה אובייקטים יצאו דרך נקודה מסוימת",
    spatial: "line",
    direction: true,
  },
  {
    id: "line_crossings",
    label: "חציות קו",
    description: "כמה אובייקטים חצו קו מסוים",
    spatial: "line",
    direction: "optional",
  },
  {
    id: "occupancy_current",
    label: "כמות כרגע",
    description: "כמה אובייקטים נמצאים עכשיו באזור",
    spatial: "zone",
    direction: false,
    realtime: true,
  },
  {
    id: "occupancy_peak",
    label: "תפוסת שיא",
    description: "הכמות הגבוהה ביותר שנמדדה באזור",
    spatial: "zone",
    direction: false,
  },
  {
    id: "dwell_avg",
    label: "זמן שהייה ממוצע",
    description: "כמה זמן בממוצע אובייקטים שוהים באזור",
    spatial: "zone",
    direction: false,
  },
  {
    id: "dwell_max",
    label: "זמן שהייה מקסימלי",
    description: "השהייה הארוכה ביותר שנמדדה באזור",
    spatial: "zone",
    direction: false,
  },
  {
    id: "objects_observed",
    label: "אובייקטים שנצפו",
    description: "כמה מסלולי מעקב נצפו במצלמה או באזור",
    spatial: "optional_zone",
    direction: false,
  },
];

export type VisionCapabilities = {
  objectTypes: typeof OBJECT_TYPES;
  metricTypes: typeof METRIC_TYPES;
  supportsZones: true;
  supportsLines: true;
  supportsDirection: true;
  supportsTracking: true;
  vehicleClasses: typeof VEHICLE_CLASSES;
};

export const VISION_CAPABILITIES: VisionCapabilities = {
  objectTypes: OBJECT_TYPES,
  metricTypes: METRIC_TYPES,
  supportsZones: true,
  supportsLines: true,
  supportsDirection: true,
  supportsTracking: true,
  vehicleClasses: VEHICLE_CLASSES,
};

export function resolveObjectClasses(objectType: VisionObjectType): string[] {
  return [...OBJECT_TYPE_TO_CLASSES[objectType]];
}

export function metricTypeConfig(id: MetricDefType): MetricTypeConfig {
  const found = METRIC_TYPES.find((m) => m.id === id);
  if (!found) throw new Error(`unknown metric type: ${id}`);
  return found;
}
