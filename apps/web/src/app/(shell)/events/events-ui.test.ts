import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("event media UI", () => {
  it("event detail shows snapshot and optional clip", () => {
    const detail = readFileSync(resolve(__dirname, "[id]/page.tsx"), "utf8");
    expect(detail).toContain("snapshotBlob");
    expect(detail).toContain("showEventClip");
    expect(detail).toContain("eventMediaUnavailable");
  });

  it("events feed uses the media-first EventCard (which renders EventThumbnail)", () => {
    const feed = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
    const card = readFileSync(resolve(__dirname, "../../../components/events/EventCard.tsx"), "utf8");
    expect(feed).toContain("EventCard");
    expect(card).toContain("EventThumbnail");
    expect(card).toContain("has_snapshot");
  });

  it("dashboard recent events use media-first cards", () => {
    const dash = readFileSync(resolve(__dirname, "../page.tsx"), "utf8");
    expect(dash).toContain("EventCard");
  });

  it("event detail is media-first with collapsed technical details", () => {
    const detail = readFileSync(resolve(__dirname, "[id]/page.tsx"), "utf8");
    // hero image comes before the info card
    expect(detail.indexOf("snapshotLargeUrl ?")).toBeLessThan(detail.indexOf('t("eventWhere")'));
    expect(detail).toContain("<details");
    expect(detail).toContain("technicalDetails");
    expect(detail).toContain("devSourceBadge");
    expect(detail).toContain('t("acknowledge")');
  });

  it("events list offers state filters without technical jargon", () => {
    const feed = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
    expect(feed).toContain("filterNew");
    expect(feed).toContain("filterAcknowledged");
    expect(feed).not.toContain("track_id");
  });
});
