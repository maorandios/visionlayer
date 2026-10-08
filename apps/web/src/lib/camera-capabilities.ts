/**
 * Camera capability flags — keep UI decisions centralized.
 * Test-video (Video Lab) cameras support offline full-video AI Test.
 * Future RTSP/Jetson cameras will run continuously and should not show בדיקת AI.
 */

import { inferCameraSource } from "@/lib/camera-source";
import type { Camera } from "@/lib/types";

export type CameraCapabilities = {
  /** Offline full-video analysis triggered by the user (POC test sources). */
  supportsManualAnalysis: boolean;
  /** Source is an uploaded / Video Lab test video — never label as LIVE. */
  isTestSource: boolean;
};

export function cameraCapabilities(camera: Pick<Camera, "id" | "status">): CameraCapabilities {
  const source = inferCameraSource(camera);
  const isTestSource = source.type === "video_lab";
  return {
    supportsManualAnalysis: isTestSource,
    isTestSource,
  };
}
