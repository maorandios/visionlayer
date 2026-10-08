"use client";

/**
 * Shared visual setup for line-based Metrics: entries / exits / line crossings.
 * User draws two points → picks direction on the camera → save.
 * No point numbers, side names, or A/B labels.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSnapshotUrl } from "@/components/rules/wizard/CameraSnapshot";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import {
  computeArrowLayouts,
  crossingBothSummary,
  defaultLineName,
  lineSetupCopy,
  lineSetupSummary,
  type LineMetricMode,
  toPixels,
} from "@/lib/line-direction";
import type { MetricDirection } from "@/lib/metric-wizard/types";
import { pixelToNormalized, type Point } from "@/lib/polygon";
import type { Line } from "@/lib/types";
import { OBJECT_TYPE_LABELS, type VisionObjectType } from "@/lib/vision-capabilities";
import { useAuth } from "@/providers/AuthProvider";

const W = 640;
const H = 360;

type Phase =
  | "choose_source" // pick existing vs draw (only if lines exist)
  | "drawing"
  | "crossing_mode" // both vs one (crossing only)
  | "direction"
  | "ready";

export type LineMetricSetupResult = {
  lineId: string;
  direction: MetricDirection;
  line: Line;
  created: boolean;
};

type Props = {
  mode: LineMetricMode;
  cameraId: string;
  objectType: VisionObjectType;
  /** Metric context title e.g. "כניסות רכבים" */
  contextTitle: string;
  existingLines: Line[];
  /** Preselect an existing line (edit flow). */
  initialLineId?: string | null;
  initialDirection?: MetricDirection | null;
  onCancel: () => void;
  onComplete: (result: LineMetricSetupResult) => void;
};

function pluralHe(objectType: VisionObjectType): string {
  const map: Partial<Record<VisionObjectType, string>> = {
    person: "אנשים",
    vehicle: "רכבים",
    car: "מכוניות",
    truck: "משאיות",
    bus: "אוטובוסים",
    motorcycle: "אופנועים",
    bicycle: "אופניים",
  };
  return map[objectType] ?? OBJECT_TYPE_LABELS[objectType];
}

export function LineMetricSetup({
  mode,
  cameraId,
  objectType,
  contextTitle,
  existingLines,
  initialLineId = null,
  initialDirection = null,
  onCancel,
  onComplete,
}: Props) {
  const { token } = useAuth();
  const bg = useSnapshotUrl(cameraId);
  const copy = lineSetupCopy(mode);
  const objLabel = pluralHe(objectType);

  const [phase, setPhase] = useState<Phase>(() => {
    if (initialLineId) return mode === "crossing" && (!initialDirection || initialDirection === "any") ? "crossing_mode" : "direction";
    return existingLines.length > 0 ? "choose_source" : "drawing";
  });
  const [points, setPoints] = useState<Point[]>(() => {
    const ln = existingLines.find((l) => l.id === initialLineId);
    return ln?.points?.length === 2 ? (ln.points as Point[]) : [];
  });
  const [lineId, setLineId] = useState<string | null>(initialLineId);
  const [direction, setDirection] = useState<MetricDirection | null>(() => {
    if (mode === "crossing" && !initialDirection) return "any";
    return initialDirection;
  });
  const [crossingPickOne, setCrossingPickOne] = useState(
    () => mode === "crossing" && !!initialDirection && initialDirection !== "any",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const a = points[0];
  const b = points[1];
  const lineComplete = !!(a && b);

  useEffect(() => {
    if (phase === "drawing" && lineComplete) {
      if (mode === "crossing") {
        setDirection("any");
        setCrossingPickOne(false);
        setPhase("crossing_mode");
      } else {
        setDirection(null);
        setPhase("direction");
      }
    }
  }, [phase, lineComplete, mode]);

  const arrows = useMemo(() => {
    if (!a || !b) return [];
    const px = toPixels(a, b, W, H);
    return computeArrowLayouts(px.a, px.b);
  }, [a, b]);

  const showArrows =
    phase === "direction" || (phase === "ready" && direction && direction !== "any") || (phase === "crossing_mode" && crossingPickOne);

  const ready =
    lineComplete &&
    (mode === "crossing"
      ? direction === "any" || direction === "a_to_b" || direction === "b_to_a"
      : direction === "a_to_b" || direction === "b_to_a");

  useEffect(() => {
    if (ready && (phase === "direction" || phase === "crossing_mode")) {
      setPhase("ready");
    }
  }, [ready, phase, direction]);

  const addPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (points.length >= 2) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const next = [
        ...points,
        pixelToNormalized(clientX - rect.left, clientY - rect.top, rect.width, rect.height),
      ];
      setPoints(next);
      setLineId(null); // new geometry — not an existing line until saved
    },
    [points],
  );

  function redraw() {
    setPoints([]);
    setLineId(null);
    setDirection(mode === "crossing" ? "any" : null);
    setCrossingPickOne(false);
    setPhase("drawing");
    setError(null);
  }

  function pickExisting(ln: Line) {
    setPoints(ln.points as Point[]);
    setLineId(ln.id);
    setError(null);
    if (mode === "crossing") {
      setDirection("any");
      setCrossingPickOne(false);
      setPhase("crossing_mode");
    } else {
      setDirection(null);
      setPhase("direction");
    }
  }

  function selectArrow(dir: Exclude<MetricDirection, "any">) {
    setDirection(dir);
    setPhase("ready");
  }

  function selectCrossingBoth() {
    setCrossingPickOne(false);
    setDirection("any");
    setPhase("ready");
  }

  function selectCrossingOne() {
    setCrossingPickOne(true);
    setDirection(null);
    setPhase("direction");
  }

  async function saveAndContinue() {
    if (!token || !a || !b || !direction) return;
    if (mode !== "crossing" && direction === "any") return;

    setSaving(true);
    setError(null);
    try {
      let line: Line;
      let created = false;
      if (lineId) {
        const existing = existingLines.find((l) => l.id === lineId);
        if (!existing) throw new Error("הקו לא נמצא");
        line = existing;
      } else {
        const name = defaultLineName(
          mode,
          existingLines.map((l) => l.name),
        );
        line = await api.lines.create(token, cameraId, {
          name,
          points: [a, b],
          direction: "any", // geometry only — Metric stores direction
          enabled: true,
        });
        created = true;
      }
      onComplete({ lineId: line.id, direction, line, created });
    } catch (e) {
      setError(e instanceof Error ? e.message : "שמירת הקו נכשלה");
    } finally {
      setSaving(false);
    }
  }

  const summaryText =
    mode === "crossing" && direction === "any"
      ? crossingBothSummary(objLabel)
      : lineSetupSummary({ mode, objectLabel: objLabel, direction });

  const phaseTitle =
    phase === "choose_source"
      ? "איפה מתבצע המעבר?"
      : phase === "drawing"
        ? copy.drawTitle
        : phase === "crossing_mode"
          ? copy.directionTitle
          : phase === "direction"
            ? mode === "crossing"
              ? copy.pickOneTitle
              : copy.directionTitle
            : copy.directionTitle;

  return (
    <div className="space-y-3" data-testid="line-metric-setup" data-mode={mode} data-phase={phase}>
      <div className="space-y-1">
        <p className="text-xs font-medium text-accent">{contextTitle}</p>
        <h3 className="text-base font-semibold text-ink">{phaseTitle}</h3>
        {phase === "drawing" ? <p className="text-sm text-ink-muted">{copy.drawHint}</p> : null}
        {phase === "direction" && mode !== "crossing" && direction ? (
          <p className="text-sm text-accent">{copy.directionConfirm}</p>
        ) : null}
        {phase === "ready" && mode !== "crossing" && direction && direction !== "any" ? (
          <p className="text-sm text-accent">{copy.directionConfirm}</p>
        ) : null}
      </div>

      {phase === "choose_source" ? (
        <div className="space-y-2">
          <ul className="grid gap-2 sm:grid-cols-2">
            {existingLines.map((ln) => (
              <li key={ln.id}>
                <button
                  type="button"
                  onClick={() => pickExisting(ln)}
                  className="w-full rounded-lg border border-border bg-black/25 px-3 py-3 text-start text-sm font-medium text-ink hover:border-accent/40"
                  data-testid="line-metric-existing"
                >
                  {ln.name}
                </button>
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            className="w-full"
            data-testid="line-metric-draw-new"
            onClick={() => {
              setPoints([]);
              setLineId(null);
              setPhase("drawing");
            }}
          >
            + צייר קו חדש
          </Button>
          <Button variant="ghost" className="w-full" onClick={onCancel}>
            חזרה
          </Button>
        </div>
      ) : null}

      {phase !== "choose_source" ? (
        <>
          <div className="relative overflow-hidden rounded-lg border border-border bg-muted" dir="ltr">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="aspect-video w-full touch-none bg-canvas"
              data-testid="line-metric-canvas"
              onPointerDown={(e) => {
                if (phase !== "drawing" || dragIndex !== null || points.length >= 2) return;
                addPoint(e.clientX, e.clientY);
              }}
            >
              {bg ? (
                <image href={bg} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid slice" />
              ) : (
                <rect width={W} height={H} fill="#0a0c10" />
              )}

              {/* In-progress first point */}
              {a && !b ? (
                <circle cx={a[0] * W} cy={a[1] * H} r={7} fill="var(--color-accent)" stroke="#fff" strokeWidth={2} />
              ) : null}

              {a && b ? (
                <>
                  <line
                    x1={a[0] * W}
                    y1={a[1] * H}
                    x2={b[0] * W}
                    y2={b[1] * H}
                    stroke="var(--color-accent)"
                    strokeWidth={3.5}
                    strokeLinecap="round"
                  />
                  {/* Endpoint handles — no numbers */}
                  {[a, b].map((p, i) => (
                    <circle
                      key={i}
                      cx={p[0] * W}
                      cy={p[1] * H}
                      r={9}
                      fill="#fff"
                      stroke="var(--color-accent)"
                      strokeWidth={2.5}
                      className={phase === "drawing" ? "cursor-grab" : undefined}
                      onPointerDown={(e) => {
                        if (phase !== "drawing") return;
                        e.stopPropagation();
                        setDragIndex(i);
                      }}
                      onPointerMove={(e) => {
                        if (dragIndex !== i || phase !== "drawing") return;
                        const svg = svgRef.current;
                        if (!svg) return;
                        const rect = svg.getBoundingClientRect();
                        const next = [...points];
                        next[i] = pixelToNormalized(
                          e.clientX - rect.left,
                          e.clientY - rect.top,
                          rect.width,
                          rect.height,
                        );
                        setPoints(next);
                      }}
                      onPointerUp={() => setDragIndex(null)}
                      onPointerLeave={() => setDragIndex(null)}
                    />
                  ))}
                </>
              ) : null}

              {showArrows
                ? arrows.map((ar) => {
                    const selected = direction === ar.direction;
                    const stroke = selected ? "var(--color-accent)" : "rgba(245,240,232,0.35)";
                    const fill = selected ? "var(--color-accent)" : "rgba(245,240,232,0.25)";
                    const label =
                      mode === "entry" ? "כניסה" : mode === "exit" ? "יציאה" : selected ? "חצייה" : "";
                    // Arrow shaft + head
                    const dx = ar.tip.x - ar.base.x;
                    const dy = ar.tip.y - ar.base.y;
                    const alen = Math.hypot(dx, dy) || 1;
                    const ux = dx / alen;
                    const uy = dy / alen;
                    const hx = ar.tip.x - ux * 14;
                    const hy = ar.tip.y - uy * 14;
                    const px = -uy;
                    const py = ux;
                    const head = `${ar.tip.x},${ar.tip.y} ${hx + px * 8},${hy + py * 8} ${hx - px * 8},${hy - py * 8}`;
                    return (
                      <g
                        key={ar.side}
                        role="button"
                        tabIndex={0}
                        data-testid={`line-dir-${ar.side}`}
                        data-selected={selected ? "true" : "false"}
                        style={{ cursor: "pointer" }}
                        onClick={() => selectArrow(ar.direction)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") selectArrow(ar.direction);
                        }}
                      >
                        {/* Larger invisible hit target */}
                        <circle cx={ar.tip.x} cy={ar.tip.y} r={28} fill="transparent" />
                        <line
                          x1={ar.base.x}
                          y1={ar.base.y}
                          x2={ar.tip.x}
                          y2={ar.tip.y}
                          stroke={stroke}
                          strokeWidth={selected ? 4 : 3}
                          strokeLinecap="round"
                        />
                        <polygon points={head} fill={fill} stroke={stroke} strokeWidth={1} />
                        {selected && label ? (
                          <text
                            x={ar.label.x}
                            y={ar.label.y}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="var(--color-accent)"
                            fontSize={14}
                            fontWeight={600}
                            style={{ pointerEvents: "none" }}
                          >
                            {label}
                          </text>
                        ) : null}
                      </g>
                    );
                  })
                : null}
            </svg>
          </div>

          {phase === "crossing_mode" ? (
            <div className="flex gap-1 rounded-lg border border-border bg-black/20 p-1" data-testid="crossing-mode-toggle">
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                  !crossingPickOne && direction === "any"
                    ? "bg-accent text-ink-on-accent"
                    : "text-ink-muted hover:text-ink"
                }`}
                onClick={selectCrossingBoth}
              >
                {copy.crossingBoth}
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                  crossingPickOne ? "bg-accent text-ink-on-accent" : "text-ink-muted hover:text-ink"
                }`}
                onClick={selectCrossingOne}
              >
                {copy.crossingOne}
              </button>
            </div>
          ) : null}

          {(phase === "ready" || phase === "direction" || phase === "crossing_mode") && lineComplete ? (
            <p className="text-sm text-ink-muted" data-testid="line-metric-summary">
              {summaryText}
            </p>
          ) : null}

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            {phase === "drawing" && points.length === 1 ? (
              <Button variant="ghost" size="sm" onClick={() => setPoints([])}>
                בטל נקודה
              </Button>
            ) : null}
            {phase === "drawing" && points.length > 0 ? (
              <Button variant="secondary" size="sm" onClick={() => setPoints([])}>
                נקה
              </Button>
            ) : null}
            {lineComplete && phase !== "drawing" ? (
              <Button variant="secondary" size="sm" onClick={redraw} data-testid="line-metric-redraw">
                צייר מחדש
              </Button>
            ) : null}
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" onClick={onCancel}>
              חזרה
            </Button>
            <Button
              className="flex-1"
              disabled={!ready || saving}
              onClick={() => void saveAndContinue()}
              data-testid="line-metric-save"
            >
              {saving ? "שומר…" : "שמור והמשך"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
