"use client";

import { Camera as CameraIcon } from "lucide-react";
import Link from "next/link";
import { useSnapshotUrl } from "@/components/rules/wizard/CameraSnapshot";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n/he";
import {
  cameraUiStatusLabelHe,
  resolveCameraUiStatus,
  type CameraUiStatus,
} from "@/lib/camera-status";
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
  aiAvailable?: boolean;
  onRetrySnapshot?: () => void;
};

/**
 * Camera stage — shows the full broadcast frame (contain / letterbox),
 * never cropped. Offline / source-error replace broken media with a clear state.
 */
export function CameraStage({
  camera,
  zones = [],
  lines = [],
  showOverlays = false,
  selectedZoneId,
  selectedLineId,
  aiAvailable = true,
  onRetrySnapshot,
}: Props) {
  const url = useSnapshotUrl(camera.id);
  const virtual = isVirtualCamera(camera);
  const ui = resolveCameraUiStatus({
    enabled: camera.enabled,
    status: camera.status,
    hasVideo: Boolean(url),
    aiAvailable,
  });
  const unavailable = ui === "offline" || ui === "source_error";
  const noVideoYet = !url && !unavailable && ui === "connecting" && !virtual;

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-canvas max-lg:aspect-video max-lg:h-auto max-lg:flex-none"
      data-testid="ops-camera-stage"
      data-ui-status={ui}
      dir="ltr"
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-full max-h-full w-full max-w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <rect width={W} height={H} fill="#101722" />
        {url ? (
          <image href={url} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
        ) : null}
        {showOverlays && url && !unavailable
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
        {showOverlays && url && !unavailable
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

      {unavailable ? (
        <OfflineOverlay camera={camera} ui={ui} onRetry={onRetrySnapshot} />
      ) : noVideoYet || !url ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-faint">
          <CameraIcon className="h-10 w-10" strokeWidth={1.5} aria-hidden />
          <p className="text-sm">{virtual ? t("previewRecorded") : t("noLiveYet")}</p>
        </div>
      ) : ui === "ai_unavailable" ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-3 pt-3">
          <div className="rounded-md border border-warning/30 bg-canvas/80 px-3 py-1.5 text-center text-xs text-ink backdrop-blur-sm">
            <p className="font-medium">{t("cameraAiDownTitle")}</p>
            <p className="text-ink-muted">{t("cameraAiDownHint")}</p>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-start px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="video-chip rounded-sm px-2 py-0.5 text-[11px] font-medium">{camera.name}</span>
          <span className="video-chip rounded-sm px-2 py-0.5 text-[10px] text-ink-muted">
            {virtual ? t("testSourceBadge") : cameraUiStatusLabelHe(ui)}
          </span>
        </div>
      </div>
    </div>
  );
}

function OfflineOverlay({
  camera,
  ui,
  onRetry,
}: {
  camera: Camera;
  ui: CameraUiStatus;
  onRetry?: () => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-canvas/90 px-4 text-center" data-testid="ops-camera-offline">
      <CameraIcon className="h-10 w-10 text-ink-faint" strokeWidth={1.5} aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{t("cameraFocusOffline")}</p>
        <p className="text-xs text-ink-muted">{camera.name}</p>
        <p className="text-xs text-ink-faint">
          {cameraUiStatusLabelHe(ui)}
          {ui === "source_error" ? ` · ${t("cameraSourceErrorHint")}` : ` · ${t("cameraVideoUnavailableHint")}`}
        </p>
      </div>
      <div className="pointer-events-auto flex flex-wrap justify-center gap-2">
        {onRetry ? (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            {t("retry")}
          </Button>
        ) : null}
        <Link href={`/cameras/${camera.id}/edit`}>
          <Button size="sm" variant="secondary">
            {t("checkCameraSettings")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
