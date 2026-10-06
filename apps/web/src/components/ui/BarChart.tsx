"use client";

export type BarPoint = { label: string; value: number };

/**
 * One clean bar chart (SVG, grayscale, no dependencies).
 * Designed for ≤ 31 points (hours of a day / days of a month).
 */
export function BarChart({
  points,
  height = 140,
  valueFormatter = (v) => String(Math.round(v)),
  emptyLabel = "אין נתונים",
}: {
  points: BarPoint[];
  height?: number;
  valueFormatter?: (v: number) => string;
  emptyLabel?: string;
}) {
  if (points.length === 0 || points.every((p) => p.value === 0)) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-border text-xs text-ink-muted"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }
  const max = Math.max(...points.map((p) => p.value), 1);
  const w = 100 / points.length;
  const labelEvery = points.length > 12 ? Math.ceil(points.length / 8) : 1;
  return (
    <div dir="ltr" className="w-full">
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
        role="img"
        aria-label="chart"
      >
        {points.map((p, i) => {
          const h = (p.value / max) * (height - 24);
          const x = i * w + w * 0.15;
          return (
            <g key={`${p.label}-${i}`}>
              <rect
                x={x}
                y={height - 18 - h}
                width={w * 0.7}
                height={Math.max(h, p.value > 0 ? 1 : 0)}
                rx={1}
                fill="#171717"
                opacity={0.85}
              >
                <title>{`${p.label}: ${valueFormatter(p.value)}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 grid text-[10px] text-ink-muted" style={{ gridTemplateColumns: `repeat(${points.length}, 1fr)` }}>
        {points.map((p, i) => (
          <span key={`${p.label}-l-${i}`} className="truncate text-center">
            {i % labelEvery === 0 ? p.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
