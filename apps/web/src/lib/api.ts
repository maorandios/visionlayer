import type {
  Camera,
  EventItem,
  HubInfo,
  Line,
  MetricBreakdownBy,
  MetricBucket,
  MetricFilters,
  MetricType,
  MetricsBreakdown,
  MetricsSummary,
  MetricsTimeseries,
  Rule,
  User,
  Zone,
} from "@/lib/types";
import type { MetricDefinition } from "@/lib/metric-wizard/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    const msg = body?.error?.message ?? "לא הצלחנו לטעון את הנתונים";
    const code = body?.error?.code;
    return new ApiError(msg, res.status, code);
  } catch {
    return new ApiError("לא הצלחנו לטעון את הנתונים", res.status);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.headers) {
    Object.assign(headers, options.headers as Record<string, string>);
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    throw await parseError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

function metricQuery(filters: MetricFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...extra })) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const api = {
  baseUrl: API_BASE,
  wsEventsUrl(token: string) {
    const http = new URL(API_BASE);
    http.protocol = http.protocol === "https:" ? "wss:" : "ws:";
    http.pathname = "/ws/events";
    http.search = "";
    http.searchParams.set("token", token);
    return http.toString();
  },

  hub(): Promise<HubInfo> {
    return request<HubInfo>("/");
  },

  health() {
    return request<{ status: string; service?: string; version?: string }>("/health");
  },

  ready() {
    return request<{ status: string; checks?: { database?: boolean } }>("/ready");
  },

  login(username: string, password: string) {
    return request<{ access_token: string; token_type: string }>(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify({ username, password }) },
    );
  },

  logout(token: string) {
    return request("/api/v1/auth/logout", { method: "POST" }, token);
  },

  me(token: string) {
    return request<User>("/api/v1/auth/me", {}, token);
  },

  cameras: {
    list(token: string) {
      return request<Camera[]>("/api/v1/cameras", {}, token);
    },
    get(token: string, id: string) {
      return request<Camera>(`/api/v1/cameras/${id}`, {}, token);
    },
    async snapshotBlob(token: string, id: string) {
      const res = await fetch(`${API_BASE}/api/v1/cameras/${id}/snapshot`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw await parseError(res);
      return res.blob();
    },
    create(token: string, body: Partial<Camera> & { name: string; location?: string | null }) {
      return request<Camera>(
        "/api/v1/cameras",
        { method: "POST", body: JSON.stringify(body) },
        token,
      );
    },
    update(token: string, id: string, body: Record<string, unknown>) {
      return request<Camera>(
        `/api/v1/cameras/${id}`,
        { method: "PATCH", body: JSON.stringify(body) },
        token,
      );
    },
    delete(token: string, id: string) {
      return request<void>(`/api/v1/cameras/${id}`, { method: "DELETE" }, token);
    },
    enable(token: string, id: string) {
      return request<Camera>(`/api/v1/cameras/${id}/enable`, { method: "POST" }, token);
    },
    disable(token: string, id: string) {
      return request<Camera>(`/api/v1/cameras/${id}/disable`, { method: "POST" }, token);
    },
    aiTest(token: string, id: string) {
      return request<{
        run_id: string;
        job_id: string;
        status: string;
        asset_id: string;
        progress?: Record<string, unknown>;
      }>(`/api/v1/cameras/${id}/ai-test`, { method: "POST" }, token);
    },
    aiTestStatus(token: string, id: string) {
      return request<import("@/lib/types").CameraAiTestStatus>(`/api/v1/cameras/${id}/ai-test`, {}, token);
    },
  },

  zones: {
    listForCamera(token: string, cameraId: string) {
      return request<Zone[]>(`/api/v1/cameras/${cameraId}/zones`, {}, token);
    },
    create(token: string, cameraId: string, body: Record<string, unknown>) {
      return request<Zone>(
        `/api/v1/cameras/${cameraId}/zones`,
        { method: "POST", body: JSON.stringify(body) },
        token,
      );
    },
    update(token: string, zoneId: string, body: Record<string, unknown>) {
      return request<Zone>(
        `/api/v1/zones/${zoneId}`,
        { method: "PATCH", body: JSON.stringify(body) },
        token,
      );
    },
    delete(token: string, zoneId: string) {
      return request<void>(`/api/v1/zones/${zoneId}`, { method: "DELETE" }, token);
    },
  },

  lines: {
    listForCamera(token: string, cameraId: string) {
      return request<Line[]>(`/api/v1/cameras/${cameraId}/lines`, {}, token);
    },
    create(token: string, cameraId: string, body: Record<string, unknown>) {
      return request<Line>(
        `/api/v1/cameras/${cameraId}/lines`,
        { method: "POST", body: JSON.stringify(body) },
        token,
      );
    },
    update(token: string, lineId: string, body: Record<string, unknown>) {
      return request<Line>(
        `/api/v1/lines/${lineId}`,
        { method: "PATCH", body: JSON.stringify(body) },
        token,
      );
    },
    delete(token: string, lineId: string) {
      return request<void>(`/api/v1/lines/${lineId}`, { method: "DELETE" }, token);
    },
  },

  rules: {
    list(token: string) {
      return request<Rule[]>("/api/v1/rules", {}, token);
    },
    get(token: string, id: string) {
      return request<Rule>(`/api/v1/rules/${id}`, {}, token);
    },
    create(token: string, body: Record<string, unknown>) {
      return request<Rule>(
        "/api/v1/rules",
        { method: "POST", body: JSON.stringify(body) },
        token,
      );
    },
    update(token: string, id: string, body: Record<string, unknown>) {
      return request<Rule>(
        `/api/v1/rules/${id}`,
        { method: "PATCH", body: JSON.stringify(body) },
        token,
      );
    },
    delete(token: string, id: string) {
      return request<void>(`/api/v1/rules/${id}`, { method: "DELETE" }, token);
    },
    duplicate(token: string, id: string) {
      return request<Rule>(`/api/v1/rules/${id}/duplicate`, { method: "POST" }, token);
    },
    validate(token: string, body: Record<string, unknown>) {
      return request<{ valid: boolean; errors: string[] }>(
        "/api/v1/rules/validate",
        { method: "POST", body: JSON.stringify(body) },
        token,
      );
    },
  },

  events: {
    list(token: string, params?: { camera_id?: string; state?: string; limit?: number }) {
      const q = new URLSearchParams();
      if (params?.camera_id) q.set("camera_id", params.camera_id);
      if (params?.state) q.set("state", params.state);
      if (params?.limit) q.set("limit", String(params.limit));
      const suffix = q.toString() ? `?${q}` : "";
      return request<EventItem[]>(`/api/v1/events${suffix}`, {}, token);
    },
    get(token: string, id: string) {
      return request<EventItem>(`/api/v1/events/${id}`, {}, token);
    },
    acknowledge(token: string, id: string) {
      return request<{ id: string; state: string }>(
        `/api/v1/events/${id}/acknowledge`,
        { method: "PATCH" },
        token,
      );
    },
    async snapshotBlob(token: string, id: string) {
      const res = await fetch(`${API_BASE}/api/v1/events/${id}/snapshot`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("snapshot_unavailable");
      return res.blob();
    },
    async clipBlob(token: string, id: string) {
      const res = await fetch(`${API_BASE}/api/v1/events/${id}/clip`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("clip_unavailable");
      const blob = await res.blob();
      // Browsers need an explicit video MIME for <video> blob URLs
      if (blob.type && blob.type.startsWith("video/")) return blob;
      return new Blob([blob], { type: "video/mp4" });
    },
  },

  metrics: {
    summary(token: string, filters: MetricFilters = {}) {
      return request<MetricsSummary>(`/api/v1/metrics/summary${metricQuery(filters)}`, {}, token);
    },
    timeseries(token: string, metricType: MetricType, bucket: MetricBucket, filters: MetricFilters = {}) {
      return request<MetricsTimeseries>(
        `/api/v1/metrics/timeseries${metricQuery(filters, { metric_type: metricType, bucket })}`,
        {},
        token,
      );
    },
    breakdown(token: string, metricType: MetricType, by: MetricBreakdownBy, filters: MetricFilters = {}) {
      return request<MetricsBreakdown>(
        `/api/v1/metrics/breakdown${metricQuery(filters, { metric_type: metricType, by })}`,
        {},
        token,
      );
    },
  },

  /** Persisted Metric Definitions (what the camera continuously measures). */
  metricDefinitions: {
    list(token: string, cameraId: string) {
      return request<MetricDefinition[]>(`/api/v1/cameras/${cameraId}/metrics`, {}, token);
    },
    create(token: string, cameraId: string, body: Record<string, unknown>) {
      return request<MetricDefinition>(
        `/api/v1/cameras/${cameraId}/metrics`,
        { method: "POST", body: JSON.stringify(body) },
        token,
      );
    },
    get(token: string, id: string) {
      return request<MetricDefinition>(`/api/v1/metric-definitions/${id}`, {}, token);
    },
    update(token: string, id: string, body: Record<string, unknown>) {
      return request<MetricDefinition>(
        `/api/v1/metric-definitions/${id}`,
        { method: "PATCH", body: JSON.stringify(body) },
        token,
      );
    },
    delete(token: string, id: string) {
      return request<void>(`/api/v1/metric-definitions/${id}`, { method: "DELETE" }, token);
    },
  },

  simulate: {
    scenario(token: string, body: Record<string, unknown>) {
      return request<{ detections_published: number; event_ids: string[] }>(
        "/api/v1/simulate/scenario",
        { method: "POST", body: JSON.stringify(body) },
        token,
      );
    },
  },

  videoLab: {
    list(token: string) {
      return request<import("@/lib/types").VideoLabAsset[]>("/api/v1/video-lab/assets", {}, token);
    },
    async upload(token: string, file: File, nameHe: string, location?: string) {
      const form = new FormData();
      form.append("file", file);
      form.append("name_he", nameHe);
      if (location) form.append("location", location);
      const res = await fetch(`${API_BASE}/api/v1/video-lab/assets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw await parseError(res);
      return res.json() as Promise<import("@/lib/types").VideoLabAsset>;
    },
    get(token: string, id: string) {
      return request<import("@/lib/types").VideoLabAsset>(`/api/v1/video-lab/assets/${id}`, {}, token);
    },
    delete(token: string, id: string) {
      return request<{ status: string }>(`/api/v1/video-lab/assets/${id}`, { method: "DELETE" }, token);
    },
    analyze(token: string, id: string) {
      return request<import("@/lib/types").VideoLabJob>(
        `/api/v1/video-lab/assets/${id}/analyze`,
        { method: "POST" },
        token,
      );
    },
    getJob(token: string, jobId: string) {
      return request<import("@/lib/types").VideoLabJob>(`/api/v1/video-lab/jobs/${jobId}`, {}, token);
    },
    async videoBlob(token: string, id: string) {
      const res = await fetch(`${API_BASE}/api/v1/video-lab/assets/${id}/video`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw await parseError(res);
      return res.blob();
    },
    async previewBlob(token: string, id: string) {
      const res = await fetch(`${API_BASE}/api/v1/video-lab/assets/${id}/preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw await parseError(res);
      return res.blob();
    },
    async frameBlob(token: string, jobId: string, imageKey: string) {
      const res = await fetch(`${API_BASE}/api/v1/video-lab/jobs/${jobId}/frames/${encodeURIComponent(imageKey)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw await parseError(res);
      return res.blob();
    },
    async trackImageBlob(token: string, jobId: string, trackId: number) {
      const res = await fetch(`${API_BASE}/api/v1/video-lab/jobs/${jobId}/tracks/${trackId}/image`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw await parseError(res);
      return res.blob();
    },
    listRuns(token: string, assetId: string) {
      return request<import("@/lib/types").BenchmarkHistoryItem[]>(
        `/api/v1/video-lab/assets/${assetId}/runs`,
        {},
        token,
      );
    },
    getRun(token: string, runId: string) {
      return request<import("@/lib/types").BenchmarkRun>(`/api/v1/video-lab/runs/${runId}`, {}, token);
    },
    setTrackReview(
      token: string,
      runId: string,
      trackId: number,
      reviewStatus: import("@/lib/types").TrackReviewStatus,
    ) {
      return request<import("@/lib/types").BenchmarkRun>(
        `/api/v1/video-lab/runs/${runId}/tracks/${trackId}/review`,
        { method: "PATCH", body: JSON.stringify({ review_status: reviewStatus }) },
        token,
      );
    },
  },
};
