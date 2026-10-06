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

  it("events feed uses thumbnail component", () => {
    const feed = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
    expect(feed).toContain("EventThumbnail");
    expect(feed).toContain("has_snapshot");
  });

  it("dashboard recent events use thumbnails", () => {
    const dash = readFileSync(resolve(__dirname, "../page.tsx"), "utf8");
    expect(dash).toContain("EventThumbnail");
  });
});
