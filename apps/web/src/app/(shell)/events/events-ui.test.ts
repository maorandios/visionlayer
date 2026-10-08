import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("event media UI", () => {
  it("event detail shows snapshot and optional clip", () => {
    const page = readFileSync(resolve(__dirname, "[id]/page.tsx"), "utf8");
    const detail = readFileSync(resolve(__dirname, "../../../components/events/EventDetailView.tsx"), "utf8");
    expect(page).toContain("EventDetailView");
    expect(detail).toContain("snapshotBlob");
    expect(detail).toContain("clipBlob");
    expect(detail).toContain("poster=");
    expect(detail).toContain("event-clip-player");
    expect(detail).toContain("eventMediaUnavailable");
    expect(detail).not.toContain("showEventClip");
    expect(detail).not.toContain("acknowledge");
  });

  it("events feed uses the media-first EventCard (which renders EventThumbnail)", () => {
    const feed = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
    const card = readFileSync(resolve(__dirname, "../../../components/events/EventCard.tsx"), "utf8");
    expect(feed).toContain("EventCard");
    expect(card).toContain("EventThumbnail");
    expect(card).toContain("has_snapshot");
  });

  it("camera operations panel shows recent events with media-first cards", () => {
    const panel = readFileSync(resolve(__dirname, "../../../components/operations/CameraOpsPanel.tsx"), "utf8");
    expect(panel).toContain("EventCard");
    expect(panel).toContain("recentEvents");
    expect(panel).toContain("onSelect");
    expect(panel).toContain("ops-panel-back");
  });

  it("event detail is media-first with collapsed technical details", () => {
    const detail = readFileSync(resolve(__dirname, "../../../components/events/EventDetailView.tsx"), "utf8");
    // hero image comes before the info card
    expect(detail.indexOf("snapshotLargeUrl ?")).toBeLessThan(detail.indexOf('t("eventWhere")'));
    expect(detail).toContain("<details");
    expect(detail).toContain("technicalDetails");
    expect(detail).toContain("devSourceBadge");
    expect(detail).not.toContain('t("acknowledge")');
  });

  it("events list offers state filters without technical jargon", () => {
    const feed = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
    expect(feed).toContain("filterNew");
    expect(feed).toContain("filterAcknowledged");
    expect(feed).not.toContain("track_id");
  });
});
