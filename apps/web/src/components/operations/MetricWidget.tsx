"use client";

import { MoreVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ActivityWidget } from "@/lib/activity-metrics";

function MiniSpark({ points }: { points: number[] }) {
  const max = Math.max(...points, 1);
  const w = 64;
  const h = 22;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points
    .map((v, i) => {
      const x = i * step;
      const y = h - (v / max) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-accent" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

type MenuHandlers = {
  onEdit?: () => void;
  onToggleEnabled?: () => void;
  onDelete?: () => void;
  enabled?: boolean;
};

/** Compact glass metric widget for the Activity tab. */
export function MetricWidget({
  widget,
  prominence = "normal",
  menu,
}: {
  widget: ActivityWidget;
  prominence?: "normal" | "hero";
  menu?: MenuHandlers;
}) {
  const pad = prominence === "hero" ? "p-4" : "p-3";
  const valueCls = prominence === "hero" ? "text-3xl" : "text-xl";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div
      className={`glass relative flex flex-col justify-between gap-2 rounded-lg ${pad} ${
        widget.enabled === false ? "opacity-55" : ""
      }`}
      data-testid="activity-metric-widget"
      data-metric-kind={widget.kind}
      data-metric-id={widget.id}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-muted">{widget.label}</p>
        <div className="flex items-center gap-1">
          {widget.realtime ? (
            <span className="text-[10px] text-accent">עכשיו</span>
          ) : widget.trend && widget.trend.length > 1 ? (
            <MiniSpark points={widget.trend} />
          ) : null}
          {menu ? (
            <div className="relative" ref={ref}>
              <button
                type="button"
                aria-label="תפריט מדד"
                data-testid="metric-widget-menu"
                className="flex h-6 w-6 items-center justify-center rounded text-ink-muted hover:bg-white/5 hover:text-ink"
                onClick={() => setOpen((v) => !v)}
              >
                <MoreVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
              {open ? (
                <div className="glass-strong absolute end-0 top-7 z-20 min-w-[9rem] rounded-lg py-1 shadow-float">
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-start text-sm text-ink hover:bg-white/5"
                    onClick={() => {
                      setOpen(false);
                      menu.onEdit?.();
                    }}
                  >
                    עריכת מדד
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-start text-sm text-ink hover:bg-white/5"
                    onClick={() => {
                      setOpen(false);
                      menu.onToggleEnabled?.();
                    }}
                  >
                    {menu.enabled === false ? "הפעל מדד" : "השבת מדד"}
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-start text-sm text-danger hover:bg-white/5"
                    onClick={() => {
                      setOpen(false);
                      menu.onDelete?.();
                    }}
                  >
                    מחיקת מדד
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div>
        <p className={`${valueCls} font-semibold leading-none tracking-tight text-ink tabular-nums`}>
          {widget.value}
          {widget.unit ? <span className="ms-1 text-sm font-medium text-ink-muted">{widget.unit}</span> : null}
        </p>
        {widget.context ? <p className="mt-1 text-[11px] text-ink-faint">{widget.context}</p> : null}
        {widget.breakdown && widget.breakdown.length > 0 ? (
          <ul className="mt-2 space-y-0.5 text-[11px] text-ink-muted">
            {widget.breakdown.slice(0, 4).map((b) => (
              <li key={b.label} className="flex justify-between gap-2">
                <span>{b.label}</span>
                <span className="tabular-nums text-ink">{b.value}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
