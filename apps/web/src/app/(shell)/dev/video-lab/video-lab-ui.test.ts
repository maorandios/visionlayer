import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("video lab UI", () => {
  it("page wires upload analyze progress and unique-track gallery", () => {
    const src = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
    expect(src).toContain("api.videoLab.upload");
    expect(src).toContain("api.videoLab.analyze");
    expect(src).toContain("api.videoLab.getJob");
    expect(src).toContain("analysisProgress");
    expect(src).toContain("track_gallery");
    expect(src).toContain("TrackCard");
    expect(src).toContain("detectionGallery");
    expect(src).toContain("metricDetections");
    expect(src).toContain("metricUniqueObjects");
    expect(src).toContain("metricFalsePositives");
    expect(src).toContain("analysisHistory");
    expect(src).toContain("setTrackReview");
    expect(src).toContain("showSourceVideo");
    expect(src).toContain("devDiagnostics");
    expect(src).toContain("willSearch");
    expect(src).toContain("canAnalyze");
    expect(src).toContain("labHref");
    expect(src).toContain("returnTo");
    expect(src).toContain("syncUrl");
    expect(src).toContain("video-lab-results");
    expect(src).toContain("clearResultsView");
    expect(src).toContain("lab=1");
    expect(src).toContain("runId");
    expect(src).toContain("VideoLabInner");
    expect(src).not.toContain("jumpToFrame");
    expect(src).not.toContain("BestFrameCard");
  });

  it("event detail can return to video lab run", () => {
    const src = readFileSync(resolve(__dirname, "../../events/[id]/page.tsx"), "utf8");
    expect(src).toContain("backToVideoLabRun");
    expect(src).toContain("video_lab_asset_id");
    expect(src).toContain("video_lab_run_id");
    expect(src).toContain("returnTo");
  });

  it("events list preserves returnTo for lab navigation", () => {
    const src = readFileSync(resolve(__dirname, "../../events/page.tsx"), "utf8");
    expect(src).toContain("returnTo");
    expect(src).toContain("backToVideoLabRun");
    expect(src).toContain("/dev/video-lab");
  });
});
