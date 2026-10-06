import { describe, expect, it } from "vitest";
import { clamp01, pixelToNormalized, pointsToSvgPath } from "@/lib/polygon";

describe("polygon coords", () => {
  it("normalizes pixel to 0-1", () => {
    expect(pixelToNormalized(960, 540, 1920, 1080)).toEqual([0.5, 0.5]);
  });

  it("clamps values", () => {
    expect(clamp01(1.2)).toBe(1);
    expect(clamp01(-0.1)).toBe(0);
  });

  it("builds svg path from normalized points", () => {
    const path = pointsToSvgPath(
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      100,
      100,
    );
    expect(path).toContain("Z");
  });
});
