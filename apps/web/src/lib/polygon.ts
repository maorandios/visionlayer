/** Normalized polygon helpers for zone editor (0–1 coords). */

export type Point = [number, number];

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function pixelToNormalized(
  x: number,
  y: number,
  width: number,
  height: number,
): Point {
  return [clamp01(x / width), clamp01(y / height)];
}

export function normalizedToPixel(
  point: Point,
  width: number,
  height: number,
): { x: number; y: number } {
  return { x: point[0] * width, y: point[1] * height };
}

export function pointsToSvgPath(points: Point[], width: number, height: number): string {
  if (points.length === 0) return "";
  const first = normalizedToPixel(points[0], width, height);
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length; i += 1) {
    const p = normalizedToPixel(points[i], width, height);
    d += ` L ${p.x} ${p.y}`;
  }
  if (points.length >= 3) d += " Z";
  return d;
}
