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
} from "@/lib/types-video-lab";
