export type FeatureFlags = Record<string, boolean>;

export type HubInfo = {
  name: string;
  version: string;
  environment: string;
  features: FeatureFlags;
  phase?: number;
};

export type User = {
  id: string;
  username: string;
  role: string;
};

export type Camera = {
  id: string;
  name: string;
  location: string | null;
  enabled: boolean;
  status: string;
  created_at: string;
  updated_at: string;
};

/** GET /api/v1/cameras/{id}/ai-test */
export type CameraAiTestStatus = {
  supports_manual_analysis: boolean;
  asset_id: string | null;
  has_rules_or_metrics: boolean;
  active_job: {
    id: string;
    status: string;
    progress?: {
      percent?: number;
      frames_done?: number;
      frames_total?: number;
      phase_he?: string;
    } | null;
    error_he?: string | null;
  } | null;
  latest_job: {
    id: string;
    status: string;
    error_he?: string | null;
    finished_at?: string | null;
  } | null;
  latest_successful_run: {
    id: string;
    analyzed_at: string | null;
    events_total: number;
    analysis_time_seconds: number;
    video_duration_sec: number;
    status: string;
  } | null;
  config_changed_since_last_run: boolean;
};

export type Zone = {
  id: string;
  camera_id: string;
  name: string;
  kind: string;
  points: number[][];
  enabled: boolean;
  created_at: string;
};

export type Line = {
  id: string;
  camera_id: string;
  name: string;
  points: number[][];
  direction: "any" | "a_to_b" | "b_to_a" | string;
  /** Human-readable direction names (e.g. "כניסה" / "יציאה"); optional. */
  label_a_to_b?: string | null;
  label_b_to_a?: string | null;
  enabled: boolean;
  created_at: string;
};

export type RuleAction = { type: "push_notification" | "create_event" };

export type RuleConditions = {
  object_classes: string[];
  camera_id?: string | null;
  zone_id?: string | null;
  line_id?: string | null;
  direction?: "any" | "a_to_b" | "b_to_a" | string | null;
  trigger?:
    | "zone_presence"
    | "zone_enter"
    | "zone_exit"
    | "line_cross"
    | "dwell"
    | "count_threshold"
    | string
    | null;
  schedule?: { from: string; to: string; days?: number[]; timezone?: string };
  min_duration_seconds?: number;
  count?: number | null;
  threshold?: number | null;
  operator?: "gte" | "gt" | "lte" | "lt" | "eq" | string | null;
  aggregation_window_seconds?: number | null;
  aggregation?: {
    metric?: string;
    window_seconds?: number;
    operator?: string;
    threshold?: number;
    count_on?: string;
  } | null;
};

export type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  conditions: RuleConditions;
  actions: RuleAction[];
  cooldown_seconds: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EventItem = {
  id: string;
  camera_id: string;
  rule_id: string | null;
  type: string;
  severity: string;
  object_class: string | null;
  track_id: number | null;
  zone_id: string | null;
  confidence: number | null;
  started_at: string;
  ended_at: string | null;
  state: string;
  message_he: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  media_status?: string;
  trigger_timestamp_sec?: number | null;
  source_analysis_run_id?: string | null;
  has_snapshot?: boolean;
  has_clip?: boolean;
};

// ---- Metrics (mirrors services/edge-api/app/api/metrics_schemas.py) ----

export type MetricScope = "production" | "video_lab";
export type MetricType =
  | "zone_entries"
  | "zone_exits"
  | "line_crossings"
  | "unique_objects"
  | "dwell"
  | "occupancy_peak";
export type MetricBucket = "hour" | "day";
export type MetricBreakdownBy = "camera" | "zone" | "line" | "object_class" | "direction";

export type MetricFilters = {
  scope?: MetricScope;
  analysis_run_id?: string | null;
  from?: string;
  to?: string;
  camera_id?: string;
  zone_id?: string;
  line_id?: string;
  object_class?: string;
  direction?: string;
};

export type MetricsSummary = {
  scope: MetricScope;
  analysis_run_id: string | null;
  from: string | null;
  to: string | null;
  totals: {
    zone_entries: number;
    zone_exits: number;
    line_crossings: number;
    unique_objects: number;
    events_total: number;
  };
  dwell: { sessions: number; total_seconds: number; avg_seconds: number; max_seconds: number };
  occupancy: {
    camera_id: string;
    zone_id: string;
    current: number;
    peak: number;
    peak_at: string | null;
    updated_at: string | null;
  }[];
  peak_occupancy: number;
  by_class: {
    object_class: string;
    unique_objects: number;
    zone_entries: number;
    zone_exits?: number;
    line_crossings: number;
  }[];
  vehicles: { unique_objects: number; zone_entries: number; zone_exits?: number; line_crossings: number };
  persons: { unique_objects: number; zone_entries: number; zone_exits?: number; line_crossings: number };
};

export type MetricsTimeseries = {
  metric_type: MetricType;
  bucket: MetricBucket;
  points: { bucket_start: string; value: number; count: number }[];
};

export type MetricsBreakdown = {
  metric_type: MetricType;
  by: MetricBreakdownBy;
  items: { key: string; value: number; count: number }[];
};

export type WsMessage =
  | { type: "event.created"; event: EventItem }
  | { type: string; event?: EventItem };

export type {
  VideoLabAsset,
  VideoLabJob,
  VideoLabTrackCard,
  VideoLabBestFrame,
  BenchmarkRun,
  BenchmarkHistoryItem,
  TrackReviewStatus,
  AiTestDebugBundle,
} from "@/lib/types-video-lab";
