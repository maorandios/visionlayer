/**
 * Frontend helpers for the Metrics Engine (ranges, labels, formatting).
 */
import type { MetricsTimeseries } from "@/lib/types";

export type RangeKey = "today" | "7d" | "30d";

export const RANGE_OPTIONS: { id: RangeKey; label: string }[] = [
  { id: "today", label: "היום" },
  { id: "7d", label: "7 ימים" },
  { id: "30d", label: "30 ימים" },
];

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Inclusive-from / exclusive-to ISO range in the browser's local timezone. */
export function rangeFor(key: RangeKey, now: Date = new Date()): { from: string; to: string } {
  const todayStart = startOfLocalDay(now);
  const to = new Date(todayStart.getTime() + 24 * 3600 * 1000);
  const days = key === "today" ? 1 : key === "7d" ? 7 : 30;
  const from = new Date(todayStart.getTime() - (days - 1) * 24 * 3600 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function rangeLabel(key: RangeKey): string {
  return key === "today" ? "היום" : key === "7d" ? "ב־7 הימים האחרונים" : "ב־30 הימים האחרונים";
}

/** Fill a full set of hourly (or daily) buckets so the chart has a stable X axis. */
export function fillBuckets(
  series: MetricsTimeseries | null | undefined,
  key: RangeKey,
  now: Date = new Date(),
): { label: string; value: number }[] {
  const points = new Map<number, number>();
  for (const p of series?.points ?? []) {
    points.set(new Date(p.bucket_start).getTime(), p.value);
  }
  const todayStart = startOfLocalDay(now);
  if (key === "today") {
    return Array.from({ length: 24 }, (_, h) => {
      const start = new Date(todayStart);
      start.setHours(h);
      return { label: `${String(h).padStart(2, "0")}`, value: points.get(start.getTime()) ?? 0 };
    });
  }
  const days = key === "7d" ? 7 : 30;
  return Array.from({ length: days }, (_, i) => {
    const start = new Date(todayStart.getTime() - (days - 1 - i) * 24 * 3600 * 1000);
    return {
      label: `${start.getDate()}/${start.getMonth() + 1}`,
      value: points.get(start.getTime()) ?? 0,
    };
  });
}

/** "1:45" style, or "12 שנ׳" for < 60s. */
export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)} שנ׳`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}:${String(s).padStart(2, "0")} דק׳`;
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, "0")} שע׳`;
}

export function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(n);
}

export const METRIC_TYPE_HE: Record<string, string> = {
  zone_entries: "כניסות לאזור",
  zone_exits: "יציאות מאזור",
  line_crossings: "חציות קו",
  unique_objects: "אובייקטים ייחודיים",
  dwell: "זמן שהייה",
  occupancy_peak: "שיא תפוסה",
};

export const DIRECTION_HE: Record<string, string> = {
  a_to_b: "A→B",
  b_to_a: "B→A",
  any: "כל כיוון",
};
