import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("Add Camera wizard UI", () => {
  it("opens a multi-step flow without RTSP as a working option", () => {
    const src = read("components/cameras/AddCameraWizard.tsx");
    expect(src).toContain('t("addCamera")');
    expect(src).toContain("cameraHowConnect");
    expect(src).toContain("video_lab");
    expect(src).toContain("comingSoon");
    expect(src).toContain("disabled");
    expect(src).not.toMatch(/rtsp:\/\//i);
    expect(src).toContain("cameraCheckConnecting");
    expect(src).toContain("cameraReadyTitle");
    expect(src).toContain("cameraAddCta");
  });

  it("reuses Video Lab assets / upload — no duplicate processing logic", () => {
    const src = read("components/cameras/AddCameraWizard.tsx");
    expect(src).toContain("api.videoLab.list");
    expect(src).toContain("api.videoLab.upload");
    expect(src).toContain("api.cameras.update");
    expect(src).not.toContain("analyze(");
  });

  it("new camera page renders the wizard", () => {
    expect(read("app/(shell)/cameras/new/page.tsx")).toContain("AddCameraWizard");
  });
});

describe("empty / offline / system / setup surfaces", () => {
  it("camera empty state offers Add Camera primary CTA", () => {
    const src = read("components/operations/OperationsWorkspace.tsx");
    expect(src).toContain("ops-empty");
    expect(src).toContain("cameraAddCta");
    expect(src).toContain("/cameras/new");
  });

  it("camera stage distinguishes offline and AI-unavailable", () => {
    const src = read("components/operations/CameraStage.tsx");
    expect(src).toContain("cameraFocusOffline");
    expect(src).toContain("cameraAiDownTitle");
    expect(src).toContain("ops-camera-offline");
  });

  it("system status page exists and TopBar links to it", () => {
    expect(read("app/(shell)/system-status/page.tsx")).toContain("SystemStatusView");
    expect(read("components/layout/TopBar.tsx")).toContain("/system-status");
    expect(read("components/system/SystemStatusView.tsx")).toContain("system-status");
    expect(read("components/system/SystemStatusView.tsx")).toContain("systemTechDetails");
  });

  it("setup flow reuses camera / metric / rule wizards with skip paths", () => {
    const src = read("components/setup/SetupFlow.tsx");
    expect(src).toContain("AddCameraWizard");
    expect(src).toContain("MetricWizard");
    expect(src).toContain("RuleWizard");
    expect(src).toContain("setupSkipForNow");
    expect(src).toContain("setupSkip");
    expect(src).toContain("markSetupComplete");
    expect(read("app/(shell)/setup/page.tsx")).toContain("SetupFlow");
  });

  it("Activity empty vs error are distinct", () => {
    const src = read("components/operations/ActivityPanel.tsx");
    expect(src).toContain("activityEmptyTitle");
    expect(src).toContain("activityLoadError");
    expect(src).toContain("ErrorBlock");
    expect(src).toContain("EmptyBlock");
  });

  it("Event Detail handles missing media without broken tags", () => {
    const src = read("components/events/EventDetailView.tsx");
    expect(src).toContain("eventMediaUnavailable");
    expect(src).not.toContain("<img src=\"\"");
  });
});
