"use client";

import { Camera as CameraIcon } from "lucide-react";
import { useSnapshotUrl } from "@/components/rules/wizard/CameraSnapshot";
import { t } from "@/i18n/he";
import {
  cameraUiStatusDotClass,
  cameraUiStatusLabelHe,
  resolveCameraUiStatus,
} from "@/lib/camera-status";
import type { Camera } from "@/lib/types";
import { isVirtualCamera } from "@/providers/CatalogProvider";

type Props = {
  camera: Camera;
  activeRules: number;
  newEvents: number;
  selected?: boolean;
  onSelect: () => void;
  /** When false, AI pipeline is down but camera may still show video. */
  aiAvailable?: boolean;
};

/** Visual-first camera card — dark elevated, media-dominant. */
export function CameraOpsCard({
  camera,
  activeRules,
  newEvents,
  selected,
  onSelect,
  aiAvailable = true,
}: Props) {
  const url = useSnapshotUrl(camera.id);
  const virtual = isVirtualCamera(camera);
  const ui = resolveCameraUiStatus({
    enabled: camera.enabled,
    status: camera.status,
    hasVideo: Boolean(url),
    aiAvailable,
  });
  const showBrokenPlaceholder = !url && (ui === "offline" || ui === "source_error");

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid="ops-camera-card"
      data-camera-id={camera.id}
      data-ui-status={ui}
      className={`glass-panel group w-full overflow-hidden rounded-xl text-start transition ${
        selected
          ? "border-accent ring-accent"
          : virtual
            ? "border-dashed hover:border-accent/40"
            : "hover:border-white/20"
      }`}
    >
      <div className="relative aspect-video bg-muted" dir="ltr">
        {url && !showBrokenPlaceholder ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-ink-faint">
            <CameraIcon className="h-8 w-8" strokeWidth={1.5} aria-hidden />
            <span className="text-xs">
              {showBrokenPlaceholder
                ? t("cameraVideoUnavailable")
                : virtual
                  ? t("previewRecorded")
                  : t("noLiveYet")}
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-2.5 pb-2 pt-8">
          <div className="flex flex-wrap items-center gap-1.5">
            {virtual ? <span className="video-chip rounded-sm px-1.5 py-0.5 text-[10px]">{t("testSourceBadge")}</span> : null}
            {ui === "ai_unavailable" ? (
              <span className="video-chip rounded-sm px-1.5 py-0.5 text-[10px] text-warning">{t("statusAiUnavailable")}</span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-ink">{camera.name}</p>
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${cameraUiStatusDotClass(ui)}`} aria-hidden />
              {cameraUiStatusLabelHe(ui)}
            </span>
          </div>
          {camera.location ? <p className="mt-0.5 truncate text-xs text-ink-faint">{camera.location}</p> : null}
          <p className="mt-1 text-xs text-ink-muted">
            {activeRules} {t("rulesShort")}
            {newEvents > 0 ? (
              <span className="text-accent">
                {" "}
                · {newEvents} {t("newEventsShort")}
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </button>
  );
}
