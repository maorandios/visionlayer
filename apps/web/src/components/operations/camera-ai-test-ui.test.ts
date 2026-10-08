import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cameraCapabilities } from "@/lib/camera-capabilities";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("camera AI Test UX", () => {
  it("exposes capabilities only for video_lab / vcam sources", () => {
    expect(cameraCapabilities({ id: "vcam_x", status: "online" }).supportsManualAnalysis).toBe(true);
    expect(cameraCapabilities({ id: "cam_1", status: "online" }).supportsManualAnalysis).toBe(false);
    expect(cameraCapabilities({ id: "vcam_x", status: "online" }).isTestSource).toBe(true);
  });

  it("CameraOpsPanel hosts בדיקת AI and scopes Activity/Events to latest run", () => {
    const panel = read("components/operations/CameraOpsPanel.tsx");
    expect(panel).toContain("CameraAiTestBar");
    expect(panel).toContain("analysisRunId");
    expect(panel).toContain("scopeEventsToRun");
    expect(panel).toContain("latestRunId");
  });

  it("AI Test bar polls camera ai-test status and prevents duplicate starts while running", () => {
    const src = read("components/operations/CameraAiTestBar.tsx");
    expect(src).toContain("aiTestCta");
    expect(src).toContain("api.cameras.aiTest");
    expect(src).toContain("api.cameras.aiTestStatus");
    expect(src).toContain("disabled={running}");
    expect(src).toContain("aiTestConfigChanged");
  });

  it("Activity scopes metrics by analysis_run_id for virtual cameras", () => {
    const src = read("components/operations/ActivityPanel.tsx");
    expect(src).toContain("analysis_run_id");
    expect(src).toContain("aiTestActivityEmpty");
  });

  it("Video Lab remains under Dev Tools only — not a product camera CTA", () => {
    const ops = read("components/operations/OperationsWorkspace.tsx");
    expect(ops).not.toContain('href="/dev/video-lab"');
    expect(ops).toContain("/cameras/new");
    const nav = read("lib/navigation.ts");
    expect(nav).toContain('href: "/dev/video-lab"');
    expect(nav).toContain("DEV_TOOLS");
    expect(nav).not.toContain("NAV_VIDEO_LAB");
  });

  it("test sources use מקור בדיקה badge, not LIVE", () => {
    const card = read("components/operations/CameraOpsCard.tsx");
    expect(card).toContain("testSourceBadge");
    expect(card).not.toContain("LIVE");
  });
});
