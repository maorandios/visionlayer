/**
 * Geometry helpers for visual line-crossing direction (perpendicular arrows).
 * Internal mapping: a_to_b / b_to_a / any — never shown as A/B to users.
 */
import type { Point } from "@/lib/polygon";
import type { MetricDirection } from "@/lib/metric-wizard/types";

export type LineMetricMode = "entry" | "exit" | "crossing";

export type PixelPt = { x: number; y: number };

/** Convert normalized [0–1] points to pixel space. */
export function toPixels(a: Point, b: Point, w: number, h: number): { a: PixelPt; b: PixelPt } {
  return { a: { x: a[0] * w, y: a[1] * h }, b: { x: b[0] * w, y: b[1] * h } };
}

/** Unit perpendicular vectors to the line (left/right of A→B). */
export function perpendicularUnit(a: PixelPt, b: PixelPt): { left: PixelPt; right: PixelPt } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Rotate 90° CCW → left of A→B; CW → right of A→B
  const left = { x: -dy / len, y: dx / len };
  const right = { x: dy / len, y: -dx / len };
  return { left, right };
}

/**
 * Crossing from the "left" side of A→B toward the "right" side is a_to_b
 * in VisionLayer spatial convention (signed side flip +→− along normal).
 * We map:
 *   arrow pointing along `left`  (away from line on left side)  → visual "from right toward left"
 * Actually for UX we show arrows pointing AWAY from the line on each side,
 * indicating "crossing toward that side".
 *
 * Crossing toward the left side of A→B  ↔  b_to_a  (arriving on left = came from right = b_to_a?)
 *
 * Keep mapping stable and documented:
 *   left-side arrow selected  → a_to_b
 *   right-side arrow selected → b_to_a
 *
 * (Matches point order: point0=A, point1=B; left of AB.)
 */
export function arrowDirection(side: "left" | "right"): Exclude<MetricDirection, "any"> {
  return side === "left" ? "a_to_b" : "b_to_a";
}

export function sideForDirection(dir: Exclude<MetricDirection, "any">): "left" | "right" {
  return dir === "a_to_b" ? "left" : "right";
}

export type ArrowLayout = {
  side: "left" | "right";
  direction: Exclude<MetricDirection, "any">;
  /** Tip of arrow (away from line). */
  tip: PixelPt;
  /** Base of arrow (near line midpoint). */
  base: PixelPt;
  /** Label anchor. */
  label: PixelPt;
};

export function computeArrowLayouts(
  a: PixelPt,
  b: PixelPt,
  arrowLen = 48,
  gap = 18,
): ArrowLayout[] {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const { left, right } = perpendicularUnit(a, b);

  function layout(side: "left" | "right", u: PixelPt): ArrowLayout {
    const base = { x: mid.x + u.x * gap, y: mid.y + u.y * gap };
    const tip = { x: mid.x + u.x * (gap + arrowLen), y: mid.y + u.y * (gap + arrowLen) };
    const label = { x: mid.x + u.x * (gap + arrowLen + 16), y: mid.y + u.y * (gap + arrowLen + 16) };
    return { side, direction: arrowDirection(side), tip, base, label };
  }

  return [layout("left", left), layout("right", right)];
}

export function modeFromMetricType(metricType: "entries" | "exits" | "line_crossings"): LineMetricMode {
  if (metricType === "entries") return "entry";
  if (metricType === "exits") return "exit";
  return "crossing";
}

export function defaultLineName(mode: LineMetricMode, existingNames: string[]): string {
  const base = mode === "entry" ? "קו כניסה" : mode === "exit" ? "קו יציאה" : "קו מעבר";
  if (!existingNames.includes(base)) return base;
  let n = 2;
  while (existingNames.includes(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export type LineSetupVariant = "metric" | "rule";

export function lineSetupCopy(mode: LineMetricMode, variant: LineSetupVariant = "metric"): {
  drawTitle: string;
  drawHint: string;
  directionTitle: string;
  directionConfirm: string;
  crossingBoth: string;
  crossingOne: string;
  pickOneTitle: string;
} {
  if (variant === "rule" && mode === "crossing") {
    return {
      drawTitle: "סמנו את הקו על התמונה",
      drawHint: "לחצו על שתי נקודות כדי למתוח קו, למשל לרוחב השער.",
      directionTitle: "מתי החוק יופעל?",
      directionConfirm: "כיוון המעבר שנבחר",
      crossingBoth: "בכל חצייה",
      crossingOne: "כיוון מעבר אחד",
      pickOneTitle: "לחצו על החץ — באיזה כיוון מעבר יופעל החוק?",
    };
  }
  if (mode === "entry") {
    return {
      drawTitle: "סמן את קו הכניסה",
      drawHint: "לחץ על שתי נקודות בתמונה כדי ליצור קו",
      directionTitle: "איזה כיוון נחשב כניסה?",
      directionConfirm: "זהו כיוון הכניסה",
      crossingBoth: "",
      crossingOne: "",
      pickOneTitle: "",
    };
  }
  if (mode === "exit") {
    return {
      drawTitle: "סמן את קו היציאה",
      drawHint: "לחץ על שתי נקודות בתמונה כדי ליצור קו",
      directionTitle: "איזה כיוון נחשב יציאה?",
      directionConfirm: "זהו כיוון היציאה",
      crossingBoth: "",
      crossingOne: "",
      pickOneTitle: "",
    };
  }
  return {
    drawTitle: "סמן את קו המעבר",
    drawHint: "לחץ על שתי נקודות בתמונה כדי ליצור קו",
    directionTitle: "אילו חציות לספור?",
    directionConfirm: "זהו כיוון החצייה",
    crossingBoth: "שני הכיוונים",
    crossingOne: "כיוון אחד",
    pickOneTitle: "בחר את כיוון החצייה",
  };
}

export function lineSetupSummary(opts: {
  mode: LineMetricMode;
  objectLabel: string;
  direction: MetricDirection | null;
  variant?: LineSetupVariant;
}): string {
  const { mode, objectLabel, direction, variant = "metric" } = opts;
  if (variant === "rule" && mode === "crossing") {
    if (direction === "any" || !direction) {
      return "החוק יופעל בכל פעם שהאובייקט חוצה את הקו.";
    }
    return "החוק יופעל כשהאובייקט חוצה את הקו בכיוון המסומן.";
  }
  if (mode === "entry") {
    return `${objectLabel} שחוצים את הקו בכיוון המסומן ייספרו ככניסה.`;
  }
  if (mode === "exit") {
    return `${objectLabel} שחוצים את הקו בכיוון המסומן ייספרו כיציאה.`;
  }
  if (direction === "any" || !direction) {
    return `כל ${objectLabel.replace(/ים$/, "") || objectLabel} שחוצה את הקו ייספר.`.replace(
      /^כל  /,
      "כל ",
    );
  }
  return `${objectLabel} שחוצים את הקו בכיוון המסומן ייספרו.`;
}

/** Cleaner crossing-both summary. */
export function crossingBothSummary(objectLabel: string): string {
  // objectLabel is plural Hebrew e.g. "רכבים" / "אנשים"
  if (objectLabel === "אנשים") return "כל אדם שחוצה את הקו ייספר.";
  if (objectLabel === "רכבים") return "כל רכב שחוצה את הקו ייספר.";
  return `כל מעבר של ${objectLabel} מעל הקו ייספר.`;
}
