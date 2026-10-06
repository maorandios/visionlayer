"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { pixelToNormalized, pointsToSvgPath, type Point } from "@/lib/polygon";
import { t } from "@/i18n/he";

const W = 640;
const H = 360;

type Props = {
  points: Point[];
  onChange: (points: Point[]) => void;
  backgroundImageUrl?: string | null;
};

export function PolygonEditor({ points, onChange, backgroundImageUrl }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handlePointer = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      onChange([...points, pixelToNormalized(x, y, rect.width, rect.height)]);
    },
    [onChange, points],
  );

  return (
    <div className="space-y-3">
      <div
        className="relative overflow-hidden rounded-2xl border border-border bg-muted"
        dir="ltr"
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="aspect-video w-full touch-none bg-neutral-200"
          onPointerDown={(e) => {
            if (dragIndex !== null) return;
            handlePointer(e.clientX, e.clientY);
          }}
        >
          {backgroundImageUrl ? (
            <image href={backgroundImageUrl} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid slice" />
          ) : (
            <>
              <rect width={W} height={H} fill="url(#grid)" opacity={0.15} />
              <defs>
                <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#737373" strokeWidth="0.5" />
                </pattern>
              </defs>
            </>
          )}
          {points.length >= 2 ? (
            <path
              d={pointsToSvgPath(points, W, H)}
              fill="rgba(23,23,23,0.12)"
              stroke="#171717"
              strokeWidth={2}
            />
          ) : null}
          {points.map((p, i) => {
            const x = p[0] * W;
            const y = p[1] * H;
            return (
              <circle
                key={`${p[0]}-${p[1]}-${i}`}
                cx={x}
                cy={y}
                r={8}
                fill="#fff"
                stroke="#171717"
                strokeWidth={2}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDragIndex(i);
                }}
                onPointerMove={(e) => {
                  if (dragIndex !== i) return;
                  const svg = svgRef.current;
                  if (!svg) return;
                  const rect = svg.getBoundingClientRect();
                  const nx = (e.clientX - rect.left) / rect.width;
                  const ny = (e.clientY - rect.top) / rect.height;
                  const next = [...points];
                  next[i] = pixelToNormalized(
                    nx * rect.width,
                    ny * rect.height,
                    rect.width,
                    rect.height,
                  );
                  onChange(next);
                }}
                onPointerUp={() => setDragIndex(null)}
              />
            );
          })}
        </svg>
        {!backgroundImageUrl ? (
          <p className="absolute bottom-2 start-2 rounded-lg bg-surface/90 px-2 py-1 text-xs text-ink-muted">
            {t("previewPlaceholder")}
          </p>
        ) : null}
      </div>
      <p className="text-xs text-ink-muted">{t("tapToAddPoint")}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => onChange(points.slice(0, -1))}
          disabled={points.length === 0}
        >
          {t("undoPoint")}
        </Button>
        <Button variant="secondary" onClick={() => onChange([])} disabled={points.length === 0}>
          {t("clearPoints")}
        </Button>
      </div>
    </div>
  );
}
