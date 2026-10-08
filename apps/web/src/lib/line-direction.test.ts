import { describe, expect, it } from "vitest";
import {
  arrowDirection,
  computeArrowLayouts,
  defaultLineName,
  lineSetupCopy,
  modeFromMetricType,
  perpendicularUnit,
  sideForDirection,
  toPixels,
} from "@/lib/line-direction";

describe("line direction geometry", () => {
  it("maps metric types to modes", () => {
    expect(modeFromMetricType("entries")).toBe("entry");
    expect(modeFromMetricType("exits")).toBe("exit");
    expect(modeFromMetricType("line_crossings")).toBe("crossing");
  });

  it("computes perpendiculars for horizontal and diagonal lines", () => {
    // Screen Y grows downward: left of A→B (CCW) points "down" (+y).
    const h = perpendicularUnit({ x: 0, y: 100 }, { x: 100, y: 100 });
    expect(h.left.y).toBeGreaterThan(0);
    expect(h.right.y).toBeLessThan(0);

    const d = perpendicularUnit({ x: 0, y: 0 }, { x: 100, y: 100 });
    const lenL = Math.hypot(d.left.x, d.left.y);
    expect(lenL).toBeCloseTo(1, 5);
    // left · direction ≈ 0
    expect(d.left.x * 1 + d.left.y * 1).toBeCloseTo(0, 5);
  });

  it("maps arrow sides to a_to_b / b_to_a", () => {
    expect(arrowDirection("left")).toBe("a_to_b");
    expect(arrowDirection("right")).toBe("b_to_a");
    expect(sideForDirection("a_to_b")).toBe("left");
    expect(sideForDirection("b_to_a")).toBe("right");
  });

  it("lays out two arrows for any angle", () => {
    const px = toPixels([0.2, 0.8], [0.8, 0.2], 640, 360);
    const arrows = computeArrowLayouts(px.a, px.b);
    expect(arrows).toHaveLength(2);
    expect(arrows.map((a) => a.direction).sort()).toEqual(["a_to_b", "b_to_a"]);
    // Tips are away from midpoint
    const mid = { x: (px.a.x + px.b.x) / 2, y: (px.a.y + px.b.y) / 2 };
    for (const ar of arrows) {
      const dMid = Math.hypot(ar.tip.x - mid.x, ar.tip.y - mid.y);
      expect(dMid).toBeGreaterThan(20);
    }
  });

  it("auto-names lines without requiring user input", () => {
    expect(defaultLineName("entry", [])).toBe("קו כניסה");
    expect(defaultLineName("entry", ["קו כניסה"])).toBe("קו כניסה 2");
    expect(defaultLineName("crossing", ["קו מעבר", "קו מעבר 2"])).toBe("קו מעבר 3");
  });

  it("uses non-technical Hebrew copy", () => {
    const entry = lineSetupCopy("entry");
    expect(entry.drawTitle).toContain("כניסה");
    expect(entry.directionTitle).not.toMatch(/A|B|צד אחד/);
    const cross = lineSetupCopy("crossing");
    expect(cross.crossingBoth).toBe("שני הכיוונים");
    expect(cross.crossingOne).toBe("כיוון אחד");
  });
});
