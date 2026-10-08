/**
 * User-facing camera operational states.
 * Distinguishes video availability from AI pipeline availability.
 */

export type CameraUiStatus =
  | "online"
  | "offline"
  | "connecting"
  | "source_error"
  | "ai_unavailable"
  | "disabled";

export type CameraStatusInput = {
  enabled: boolean;
  status: string;
  /** True when a snapshot/preview frame is available. */
  hasVideo?: boolean;
  /** False when video works but analysis pipeline is down. */
  aiAvailable?: boolean;
};

export function resolveCameraUiStatus(cam: CameraStatusInput): CameraUiStatus {
  if (!cam.enabled) return "disabled";
  const raw = (cam.status || "").toLowerCase();
  if (raw === "offline") return "offline";
  if (raw === "source_error" || raw === "error") return "source_error";
  if (raw === "connecting" || raw === "unknown" || raw === "") {
    if (cam.hasVideo === false) return "connecting";
    return "connecting";
  }
  if (raw === "online" || raw === "ok") {
    if (cam.aiAvailable === false) return "ai_unavailable";
    return "online";
  }
  return "connecting";
}

export function cameraUiStatusLabelHe(status: CameraUiStatus): string {
  switch (status) {
    case "online":
      return "פעילה";
    case "offline":
      return "לא זמינה";
    case "connecting":
      return "מתחברת";
    case "source_error":
      return "בעיה במקור";
    case "ai_unavailable":
      return "הניתוח לא זמין";
    case "disabled":
      return "מושבתת";
  }
}

export function cameraUiStatusDotClass(status: CameraUiStatus): string {
  switch (status) {
    case "online":
      return "bg-success shadow-[0_0_6px_var(--color-success)]";
    case "ai_unavailable":
      return "bg-warning";
    case "connecting":
      return "bg-ink-faint";
    case "offline":
    case "source_error":
    case "disabled":
      return "bg-danger/80";
  }
}
