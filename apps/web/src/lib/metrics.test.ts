import { describe, expect, it } from "vitest";
import { fillBuckets, formatSeconds, rangeFor } from "@/lib/metrics";

describe("metrics helpers", () => {
  it("rangeFor('today') spans the local day", () => {
    const now = new Date(2026, 9, 6, 14, 30); // Oct 6 2026 14:30 local
    const { from, to } = rangeFor("today", now);
    expect(new Date(from).getTime()).toBe(new Date(2026, 9, 6, 0, 0).getTime());
    expect(new Date(to).getTime()).toBe(new Date(2026, 9, 7, 0, 0).getTime());
  });

  it("rangeFor('7d') includes today and the 6 previous days", () => {
    const now = new Date(2026, 9, 6, 14, 30);
    const { from } = rangeFor("7d", now);
    expect(new Date(from).getTime()).toBe(new Date(2026, 8, 30, 0, 0).getTime());
  });

  it("fillBuckets produces 24 hourly points for today and maps values by bucket start", () => {
    const now = new Date(2026, 9, 6, 14, 30);
    const nine = new Date(2026, 9, 6, 9, 0).toISOString();
    const points = fillBuckets(
      { metric_type: "zone_entries", bucket: "hour", points: [{ bucket_start: nine, value: 7, count: 7 }] },
      "today",
      now,
    );
    expect(points).toHaveLength(24);
    expect(points[9]).toEqual({ label: "09", value: 7 });
    expect(points.filter((p) => p.value > 0)).toHaveLength(1);
  });

  it("fillBuckets produces 7 daily points for 7d", () => {
    const now = new Date(2026, 9, 6, 14, 30);
    const points = fillBuckets(null, "7d", now);
    expect(points).toHaveLength(7);
    expect(points[6].label).toBe("6/10");
  });

  it("formatSeconds is human friendly", () => {
    expect(formatSeconds(0)).toBe("—");
    expect(formatSeconds(20)).toBe("20 שנ׳");
    expect(formatSeconds(90)).toBe("1:30 דק׳");
    expect(formatSeconds(3660)).toBe("1:01 שע׳");
  });
});
