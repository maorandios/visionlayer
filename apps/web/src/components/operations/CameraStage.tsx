"use client";

import { Camera as CameraIcon } from "lucide-react";
import { useSnapshotUrl } from "@/components/rules/wizard/CameraSnapshot";
import { t } from "@/i18n/he";
import { pointsToSvgPath, type Point } from "@/lib/polygon";
import type { Camera, Line, Zone } from "@/lib/types";
import { isVirtualCamera } from "@/providers/CatalogProvider";

/** Native camera frame aspect used across VisionLayer (16:9). */
const W = 640;
const H = 360;

type Props = {
  camera: Camera;
  zones?: Zone[];
  lines?: Line[];
  /** When true, draw all zones/lines overlays (zones tab). */
  showOverlays?: boolean;
  selectedZoneId?: string | null;
  selectedLineId?: string | null;
};

/**
 * Camera stage — shows the full broadcast frame (contain / letterbox),
 * never cropped. Frame is centered; side/letterbox margins are empty canvas.
 */
export function CameraStage({
  camera,
  zones = [],
  lines = [],
  showOverlays = false,
  selectedZoneId,
  selectedLineId,
}: Props) {
  const url = useSnapshotUrl(camera.id);
  const virtual = isVirtualCamera(camera);

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-canvas max-lg:aspect-video max-lg:h-auto max-lg:flex-none"
      data-testid="ops-camera-stage"
      dir="ltr"
    >
      {/*
        SVG fills the available box; preserveAspectRatio=meet keeps the full
        16:9 frame visible and centered (letterboxed), matching the camera feed.
      */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-full max-h-full w-full max-w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <rect width={W} height={H} fill="#101722" />
        {url ? (
          /* Image fills the native frame; SVG meet letterboxes the whole frame in the stage. */
          <image href={url} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
        ) : null}
        {showOverlays
          ? zones.map((z) => {
              if (!z.points || z.points.length < 3) return null;
              const selected = z.id === selectedZoneId;
              return (
                <path
                  key={z.id}
                  d={pointsToSvgPath(z.points as Point[], W, H)}
                  fill={selected ? "rgba(255,106,43,0.28)" : "rgba(255,106,43,0.12)"}
                  stroke="var(--color-accent)"
                  strokeWidth={selected ? 3 : 2}
                />
              );
            })
          : null}
        {showOverlays
          ? lines.map((ln) => {
              const a = ln.points?.[0];
              const b = ln.points?.[1];
              if (!a || !b) return null;
              const selected = ln.id === selectedLineId;
              return (
                <g key={ln.id}>
                  <line
                    x1={a[0] * W}
                    y1={a[1] * H}
                    x2={b[0] * W}
                    y2={b[1] * H}
                    stroke="var(--color-accent)"
                    strokeWidth={selected ? 4 : 3}
                    strokeLinecap="round"
                  />
                  <circle
                    cx={a[0] * W}
                    cy={a[1] * H}
                    r={selected ? 6 : 4}
                    fill="var(--color-canvas)"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                  />
                  <circle
                    cx={b[0] * W}
                    cy={b[1] * H}
                    r={selected ? 6 : 4}
                    fill="var(--color-canvas)"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                  />
                </g>
              );
            })
          : null}
      </svg>

      {!url ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-faint">
          <CameraIcon className="h-10 w-10" strokeWidth={1.5} aria-hidden />
          <p className="text-sm">{virtual ? t("previewRecorded") : t("noLiveYet")}</p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-start px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="video-chip rounded-sm px-2 py-0.5 text-[11px] font-medium">{camera.name}</span>
          <span className="video-chip rounded-sm px-2 py-0.5 text-[10px] text-ink-muted">
            {virtual ? t("devSourceBadge") : t("previewRecorded")}
          </span>
        </div>
      </div>
    </div>
  );
}
