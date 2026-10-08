import { describe, expect, it } from "vitest";
import {
  cameraUiStatusLabelHe,
  resolveCameraUiStatus,
} from "@/lib/camera-status";
import { inferCameraSource, sourceTypeLabelHe } from "@/lib/camera-source";
import { buildSystemHealth } from "@/lib/system-health";
import { clearSetupComplete, isSetupComplete, markSetupComplete } from "@/lib/setup-storage";

describe("camera operational status", () => {
  it("maps online / offline / connecting / source_error / ai_unavailable", () => {
    expect(resolveCameraUiStatus({ enabled: true, status: "online" })).toBe("online");
    expect(resolveCameraUiStatus({ enabled: true, status: "offline" })).toBe("offline");
    expect(resolveCameraUiStatus({ enabled: true, status: "unknown" })).toBe("connecting");
    expect(resolveCameraUiStatus({ enabled: true, status: "source_error" })).toBe("source_error");
    expect(resolveCameraUiStatus({ enabled: true, status: "online", aiAvailable: false })).toBe("ai_unavailable");
    expect(resolveCameraUiStatus({ enabled: false, status: "online" })).toBe("disabled");
  });

  it("uses natural Hebrew labels — never raw engine tokens", () => {
    for (const s of ["online", "offline", "connecting", "source_error", "ai_unavailable", "disabled"] as const) {
      const label = cameraUiStatusLabelHe(s);
      expect(label).not.toMatch(/online|offline|source_error|ai_/i);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("keeps AI-unavailable distinct from camera offline", () => {
    expect(cameraUiStatusLabelHe("ai_unavailable")).toBe("הניתוח לא זמין");
    expect(cameraUiStatusLabelHe("offline")).toBe("לא זמינה");
  });
});

describe("camera source abstraction", () => {
  it("infers video_lab from vcam_ cameras", () => {
    expect(inferCameraSource({ id: "vcam_abc", status: "online" }).type).toBe("video_lab");
    expect(inferCameraSource({ id: "cam_1", status: "unknown" }).type).toBe("future");
  });

  it("labels sources in Hebrew without RTSP jargon for users", () => {
    expect(sourceTypeLabelHe("video_lab")).toBe("סרטון בדיקה");
    expect(sourceTypeLabelHe("network_soon")).toBe("מצלמת רשת");
  });
});

describe("system health", () => {
  it("is ok when API and DB are healthy", () => {
    const snap = buildSystemHealth({
      hub: { name: "VisionLayer", version: "0.1.0", environment: "development", features: {} },
      health: { status: "ok", service: "edge-api", version: "0.1.0" },
      ready: { status: "ok", checks: { database: true } },
      cameras: [{ id: "c1", name: "A", location: null, enabled: true, status: "online", created_at: "", updated_at: "" }],
    });
    expect(snap.level).toBe("ok");
    expect(snap.headline).toBe("המערכת פעילה");
    expect(snap.rows.find((r) => r.id === "cameras")?.detail).toContain("1 מתוך 1");
  });

  it("marks attention when cameras are offline", () => {
    const snap = buildSystemHealth({
      hub: null,
      health: { status: "ok" },
      ready: { status: "ok", checks: { database: true } },
      cameras: [{ id: "c1", name: "A", location: null, enabled: true, status: "offline", created_at: "", updated_at: "" }],
    });
    expect(snap.level).toBe("attention");
  });

  it("marks down when API health fails", () => {
    const snap = buildSystemHealth({
      hub: null,
      health: null,
      ready: null,
      cameras: [],
      healthError: true,
    });
    expect(snap.level).toBe("down");
  });

  it("does not invent GPU/Jetson metrics", () => {
    const snap = buildSystemHealth({
      hub: { name: "VisionLayer", version: "0.1.0", environment: "development", features: { video_lab: true } },
      health: { status: "ok" },
      ready: { status: "ok", checks: { database: true } },
      cameras: [],
    });
    const blob = JSON.stringify(snap);
    expect(blob).not.toMatch(/gpu|temperature|jetson|FPS/i);
  });
});

describe("setup storage", () => {
  it("persists completion so setup is not forced again", () => {
    clearSetupComplete();
    expect(isSetupComplete()).toBe(false);
    markSetupComplete();
    expect(isSetupComplete()).toBe(true);
    clearSetupComplete();
  });
});
