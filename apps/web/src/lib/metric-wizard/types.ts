import type { MetricDefType, VisionObjectType } from "@/lib/vision-capabilities";

export type MetricScopeType = "camera" | "zone" | "line";
export type MetricDirection = "any" | "a_to_b" | "b_to_a";

export type MetricWizardStep =
  | "type"
  | "object"
  | "place"
  | "summary"
  | "draw-zone";

export type MetricWizardState = {
  metricType: MetricDefType | null;
  objectType: VisionObjectType | null;
  scopeType: MetricScopeType;
  zoneId: string | null;
  lineId: string | null;
  direction: MetricDirection | null;
  name: string;
};

export const DEFAULT_METRIC_WIZARD: MetricWizardState = {
  metricType: null,
  objectType: null,
  scopeType: "camera",
  zoneId: null,
  lineId: null,
  direction: null,
  name: "",
};

export type MetricDefinition = {
  id: string;
  camera_id: string;
  name: string;
  metric_type: MetricDefType;
  object_type: VisionObjectType;
  object_classes: string[];
  scope_type: MetricScopeType;
  zone_id: string | null;
  line_id: string | null;
  direction: MetricDirection | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  engine_metric_type?: string | null;
  value_field?: string | null;
};
