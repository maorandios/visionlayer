/**
 * Camera source abstraction — future-proof for RTSP/ONVIF/Jetson.
 * UI must not couple Camera experience to Video Lab internals.
 */

export type CameraSourceType = "video_lab" | "rtsp" | "onvif" | "future";

export type CameraSourceStatus = "ready" | "checking" | "unavailable" | "unsupported";

export type CameraSource = {
  type: CameraSourceType;
  status: CameraSourceStatus;
  configuration: Record<string, unknown>;
};

/** POC-supported source choices offered in Add Camera. */
export type AddCameraSourceChoice = "video_lab" | "network_soon";

export function sourceTypeLabelHe(type: CameraSourceType | AddCameraSourceChoice): string {
  switch (type) {
    case "video_lab":
      return "סרטון בדיקה";
    case "rtsp":
    case "onvif":
    case "network_soon":
      return "מצלמת רשת";
    case "future":
      return "מקור עתידי";
  }
}

/** Infer source from existing camera identity conventions (no DB migration required). */
export function inferCameraSource(camera: { id: string; status: string }): CameraSource {
  if (camera.id.startsWith("vcam_")) {
    return {
      type: "video_lab",
      status: camera.status === "offline" ? "unavailable" : "ready",
      configuration: { cameraId: camera.id },
    };
  }
  return {
    type: "future",
    status: camera.status === "online" ? "ready" : "unavailable",
    configuration: {},
  };
}
