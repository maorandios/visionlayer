export type VideoLabAsset = {
  id: string;
  camera_id: string;
  name_he: string;
  location: string | null;
  original_filename: string;
  duration_sec: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  frame_count: number | null;
  has_preview: boolean;
  created_at: string | null;
};

export type VideoLabClassSighting = {
  class: string;
  class_he: string;
  timestamp_sec: number;
  track_id: number | null;
  confidence: number;
  bbox: number[];
};

export type VideoLabBestFrame = {
  class: string;
  class_he: string;
  confidence: number;
  confidence_pct: number;
  timestamp_sec: number;
  frame_index: number;
  track_id: number;
  bbox: number[];
  image_key: string;
  has_image: boolean;
  unique_tracks: number;
};

export type TrackReviewStatus = "correct" | "false_positive" | "unreviewed";

export type VideoLabTrackCard = {
  track_id: number;
  class: string;
  class_he: string;
  confidence: number;
  confidence_pct: number;
  first_seen: number;
  last_seen: number;
  duration: number;
  representative_timestamp: number;
  frame_index: number;
  bbox: number[];
  observations?: number;
  quality_score?: number;
  image_key: string;
  has_image: boolean;
  image_url: string;
  review_status?: TrackReviewStatus;
};

export type VideoLabHit = {
  event_id: string;
  rule_id: string | null;
  rule_name: string;
  object_class: string | null;
  object_class_he: string;
  zone_id: string | null;
  track_id: number | null;
  timestamp_sec: number;
  message_he: string | null;
  confidence: number | null;
  image_url?: string;
  image_key?: string;
  confidence_pct?: number;
  duration?: number;
};

export type VideoLabRuleCheck = {
  rule_id: string;
  rule_name: string;
  enabled: boolean;
  object_classes: string[];
  object_classes_he: string[];
  zone_id: string | null;
  zone_name: string | null;
  min_duration_seconds: number;
  detected_count: number;
  in_zone_count: number;
  max_duration_sec: number;
  first_in_zone_sec: number | null;
  triggered: boolean;
  status: string;
  reason_he: string;
};

export type VideoLabProgress = {
  percent?: number;
  frames_done?: number;
  frames_total?: number;
  phase_he?: string;
  status?: string;
};

export type BenchmarkFalsePositives = {
  reviewed_tracks: number;
  correct_tracks: number;
  false_positive_tracks: number;
  unreviewed_tracks: number;
  false_positive_rate: number | null;
};

export type BenchmarkRun = {
  id: string;
  job_id: string;
  asset_id: string;
  camera_id: string;
  status: string;
  analyzed_at: string | null;
  created_at?: string | null;
  config: {
    detector_model: string;
    detector_model_display: string;
    tracker: string;
    frame_stride: number;
    detector_confidence?: Record<string, unknown>;
    video_duration_sec: number;
    source_video_fps: number;
    resolution: { width: number; height: number };
    model_path?: string | null;
    onnx_used?: boolean;
    search_classes?: string[];
  };
  metrics: {
    detections_total: number;
    detections_by_class: Record<string, number>;
    unique_tracks_total: number;
    unique_tracks_by_class: Record<string, number>;
    events_total: number;
    events_by_rule: Record<string, number>;
    events_by_type: Record<string, number>;
    analysis_time_seconds: number;
    processing_fps: number;
    video_frames_total: number;
    detector_frames_analyzed: number;
    detector_calls: number;
    false_positives: BenchmarkFalsePositives;
  };
  event_ids: string[];
  track_gallery: VideoLabTrackCard[];
};

export type BenchmarkHistoryItem = {
  id: string;
  job_id: string;
  analyzed_at: string | null;
  detector_model: string;
  detector_model_display: string;
  frame_stride: number;
  analysis_time_seconds: number;
  unique_tracks_total: number;
  events_total: number;
  detections_total: number;
  processing_fps: number;
};

export type VideoLabJob = {
  id: string;
  asset_id: string;
  status: string;
  error_he: string | null;
  metrics: Record<string, unknown>;
  progress?: VideoLabProgress;
  benchmark?: BenchmarkRun;
  benchmark_run_id?: string;
  summary: {
    message_he?: string;
    guidance_he?: string;
    objects_he?: string[];
    search_classes?: string[];
    search_classes_he?: string[];
    class_counts?: Record<string, number>;
    unique_tracks_by_class?: Record<string, number>;
    first_seen_by_class?: Record<string, VideoLabClassSighting>;
    track_gallery?: VideoLabTrackCard[];
    fragmentation_hints?: Array<{ class: string; short_tracks: number; message_he: string }>;
    best_frames?: VideoLabBestFrame[];
    hits?: VideoLabHit[];
    rule_checks?: VideoLabRuleCheck[];
    events_created?: number;
    video_duration_sec?: number;
    analysis_duration_sec?: number;
    unique_tracks?: number;
    detected_classes?: string[];
    rules_triggered?: string[];
    event_ids?: string[];
    base_unix_ts?: number;
    tracker_name?: string;
    benchmark_run_id?: string;
    benchmark?: BenchmarkRun;
  };
  overlays: Array<{
    frame_index: number;
    timestamp_sec: number;
    boxes: Array<{
      track_id: number;
      class: string;
      confidence: number;
      bbox: number[];
    }>;
  }>;
  timeline: Array<{
    timestamp_sec: number;
    kind: string;
    label: string;
    class?: string;
    event_id?: string;
    rule_id?: string;
  }>;
  event_ids: string[];
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
};

/** Developer AI Test debug bundle (from same analysis run as product Activity/Events). */
export type AiTestDebugBundle = {
  schema_version: string;
  run_id: string;
  correctness_mode: boolean;
  mode_he: string;
  summary: {
    run_id: string;
    video_frames: number;
    frames_analyzed: number;
    stride: number;
    detection_threshold: number;
    detections: number;
    confirmed_tracks: number;
    line_crossings: number;
    zone_enters: number;
    zone_exits: number;
    metric_contributions: number;
    events_created: number;
  };
  funnel: {
    stages: Array<{ key: string; label_he: string; count: number; detail?: Record<string, number> }>;
    summary_line: string;
  };
  per_class: Array<{
    class: string;
    class_he: string;
    detections: number;
    tracks: number;
    confidence_avg: number | null;
    confidence_min: number | null;
    confidence_max: number | null;
  }>;
  tracks: Array<Record<string, unknown>>;
  rule_traces: Array<Record<string, unknown>>;
  metric_traces: Array<Record<string, unknown>>;
  event_markers: Array<{
    event_id?: string;
    video_sec?: number;
    label_he?: string;
    rule_id?: string;
    track_id?: number;
  }>;
  overlays: Array<{
    frame_index: number;
    timestamp_sec: number;
    boxes: Array<{
      track_id: number;
      class: string;
      confidence: number;
      bbox: number[];
      anchor_px?: number[];
    }>;
  }>;
  config: Record<string, unknown>;
  expected_vs_actual?: Array<{ label: string; expected: unknown; actual: unknown }> | null;
  rejection_reason_catalog?: Record<string, string>;
  rule_checks?: Array<Record<string, unknown>>;
};
