import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("events timeline UI", () => {
  it("event detail shows snapshot and optional clip without workflow actions", () => {
    const page = readFileSync(resolve(__dirname, "[id]/page.tsx"), "utf8");
    const detail = readFileSync(resolve(__dirname, "../../../components/events/EventDetailView.tsx"), "utf8");
    expect(page).toContain("EventDetailView");
    expect(detail).toContain("snapshotBlob");
    expect(detail).toContain("clipBlob");
    expect(detail).toContain("poster=");
    expect(detail).toContain("event-clip-player");
    expect(detail).toContain("event-play-clip");
    expect(detail).toContain("eventMediaUnavailable");
    expect(detail).not.toContain("showEventClip");
    expect(detail).not.toContain('t("acknowledge")');
    expect(detail).not.toContain("stateHe");
    expect(detail).not.toContain('t("filterNew")');
  });

  it("events feed uses shared EventTimeline without thumbnails or status filters", () => {
    const feed = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
    const timeline = readFileSync(
      resolve(__dirname, "../../../components/events/EventTimeline.tsx"),
      "utf8",
    );
    expect(feed).toContain("EventTimeline");
    expect(feed).not.toContain("EventCard");
    expect(feed).not.toContain("filterNew");
    expect(feed).not.toContain("filterAcknowledged");
    expect(feed).not.toContain("track_id");
    expect(timeline).toContain("event-timeline-row");
    expect(timeline).toContain("eventTypeIcon");
    expect(timeline).toContain("formatEventTime");
    expect(timeline).not.toContain("EventThumbnail");
    expect(timeline).not.toContain("stateHe");
    expect(timeline).not.toContain("חדש");
    expect(timeline).not.toContain("אושר");
    expect(timeline).not.toContain("טופל");
  });

  it("camera operations panel shows camera-scoped timeline", () => {
    const panel = readFileSync(resolve(__dirname, "../../../components/operations/CameraOpsPanel.tsx"), "utf8");
    expect(panel).toContain("EventTimeline");
    expect(panel).toContain("camera-tab-events");
    expect(panel).toContain("cameraEvents");
    expect(panel).toContain("onSelect");
    expect(panel).toContain("ops-panel-back");
    expect(panel).toContain("backToEvents");
    expect(panel).not.toContain("EventCard");
    expect(panel).not.toContain("filterNew");
    expect(panel).not.toContain("eventFilter");
  });

  it("event detail is media-first with optional technical details for developers", () => {
    const detail = readFileSync(resolve(__dirname, "../../../components/events/EventDetailView.tsx"), "utf8");
    expect(detail.indexOf("event-media")).toBeLessThan(detail.indexOf("eventDetailsSection"));
    expect(detail).toContain("<details");
    expect(detail).toContain("technicalDetails");
    expect(detail).toContain("devSourceBadge");
    expect(detail).not.toContain('t("acknowledge")');
    expect(detail).toContain("matchedRule");
    expect(detail).toContain("playClip");
  });

  it("timeline groups by date via shared helper", () => {
    const helper = readFileSync(resolve(__dirname, "../../../lib/event-timeline.ts"), "utf8");
    expect(helper).toContain("groupEventsByDate");
    expect(helper).toContain("היום");
    expect(helper).toContain("אתמול");
  });
});
