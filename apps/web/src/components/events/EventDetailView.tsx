"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { EventThumbnail } from "@/components/events/EventThumbnail";
import {
  directionLabelHe,
  eventTitle,
  formatDurationHe,
  payloadNumber,
  payloadString,
} from "@/lib/event-timeline";
import { formatDateTime, objectClassHe } from "@/lib/format";
import { api } from "@/lib/api";
import type { EventItem } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";
import { t } from "@/i18n/he";

function labReturnHref(event: EventItem, returnTo: string | null): string | null {
  if (returnTo && returnTo.startsWith("/dev/video-lab")) return returnTo;
  const payload = event.payload ?? {};
  const assetId = typeof payload.video_lab_asset_id === "string" ? payload.video_lab_asset_id : null;
  const runId =
    (typeof payload.video_lab_run_id === "string" ? payload.video_lab_run_id : null) ??
    (typeof payload.video_lab_job_id === "string" ? payload.video_lab_job_id : null);
  if (assetId && runId) {
    return `/dev/video-lab?asset=${encodeURIComponent(assetId)}&run=${encodeURIComponent(runId)}`;
  }
  if (payload.source === "development_video") {
    return "/dev/video-lab";
  }
  return null;
}

type Props = {
  eventId: string;
  /** Full page keeps PageHeader; panel is compact inside ops. */
  variant?: "page" | "panel";
  returnTo?: string | null;
  /** Override back label (camera ops: חזרה לאירועים). */
  backLabel?: string;
};

/**
 * Event Detail — media-first historical record (no ticketing workflow).
 * Opening this view does not re-run AI inference.
 */
export function EventDetailView({
  eventId,
  variant = "page",
  returnTo = null,
  backLabel,
}: Props) {
  const { token, hub } = useAuth();
  const { cameraName, zoneName, lineName, ruleName } = useCatalog();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTech, setShowTech] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);
  const [clipLoading, setClipLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [snapshotLargeUrl, setSnapshotLargeUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setEvent(await api.events.get(token, eventId));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [token, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPlaying(false);
    setClipUrl(null);
    setClipError(null);
  }, [eventId]);

  useEffect(() => {
    if (!token || !event?.has_snapshot) {
      setSnapshotLargeUrl(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const blob = await api.events.snapshotBlob(token, event.id);
        url = URL.createObjectURL(blob);
        if (!cancelled) setSnapshotLargeUrl(url);
      } catch {
        if (!cancelled) setSnapshotLargeUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, event?.id, event?.has_snapshot]);

  async function loadClip() {
    if (!token || !event?.has_clip || clipUrl) {
      setPlaying(true);
      return;
    }
    setClipLoading(true);
    setClipError(null);
    try {
      const blob = await api.events.clipBlob(token, event.id);
      const url = URL.createObjectURL(blob);
      setClipUrl(url);
      setPlaying(true);
    } catch {
      setClipError(t("eventClipUnavailable"));
    } finally {
      setClipLoading(false);
    }
  }

  useEffect(() => {
    return () => {
      if (clipUrl) URL.revokeObjectURL(clipUrl);
    };
  }, [clipUrl]);

  if (loading) return <LoadingBlock />;
  if (error || !event) return <ErrorBlock message={error ?? t("errorLoad")} onRetry={load} />;

  const payload = event.payload ?? {};
  const durationSec = payloadNumber(payload, "duration_seconds");
  const lineId = payloadString(payload, "line_id");
  const direction = payloadString(payload, "direction");
  const labBack = labReturnHref(event, returnTo);
  const ruleLabel =
    typeof payload.rule_name === "string" ? payload.rule_name : ruleName(event.rule_id);
  const isDevSource = Boolean(event.source_analysis_run_id);
  const title = eventTitle(event, objectClassHe(event.object_class));
  const when = formatDateTime(event.started_at);
  const zoneLabel = event.zone_id ? zoneName(event.zone_id) : null;
  const lineLabel = lineId ? lineName(lineId) : null;
  const dirLabel = directionLabelHe(direction);
  const panel = variant === "panel";
  const mediaClass = `w-full rounded-lg border border-border bg-black object-contain ${panel ? "max-h-56" : "max-h-[28rem]"}`;
  const resolvedBackLabel =
    backLabel ??
    (labBack
      ? labBack.includes("run=")
        ? t("backToVideoLabRun")
        : t("backToVideoLab")
      : t("backToEvents"));
  const backHref = labBack ?? "/events";
  const showDev = hub?.features?.video_lab === true || isDevSource;

  return (
    <div
      className={panel ? "space-y-3 pb-2" : "mx-auto max-w-lg space-y-4 pb-4 md:pb-0"}
      data-testid="event-detail"
    >
      {panel ? null : (
        <PageHeader title={t("eventDetail")} backHref={backHref} backLabel={resolvedBackLabel} />
      )}

      <div className="space-y-1">
        <h2 className={`font-semibold text-ink ${panel ? "text-base" : "text-lg"}`}>{title}</h2>
        <p className="text-sm text-ink-muted">{when}</p>
        {isDevSource ? <Chip tone="dashed">{t("devSourceBadge")}</Chip> : null}
      </div>

      {/* Media — snapshot first; play loads existing clip (no AI re-run) */}
      <div data-testid="event-media">
        {playing && clipUrl ? (
          <video
            key={clipUrl}
            src={clipUrl}
            poster={snapshotLargeUrl ?? undefined}
            controls
            playsInline
            autoPlay
            muted={false}
            preload="metadata"
            className={mediaClass}
            data-testid="event-clip-player"
          >
            <source src={clipUrl} type="video/mp4" />
          </video>
        ) : snapshotLargeUrl || event.has_snapshot ? (
          <div className="relative">
            {snapshotLargeUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={snapshotLargeUrl} alt="" className={`${mediaClass} bg-muted`} />
            ) : (
              <EventThumbnail
                token={token}
                eventId={event.id}
                hasSnapshot
                className={`flex w-full items-center justify-center rounded-lg border border-border bg-muted ${
                  panel ? "h-40" : "h-56"
                }`}
              />
            )}
            {event.has_clip ? (
              <button
                type="button"
                onClick={() => void loadClip()}
                disabled={clipLoading}
                className="absolute inset-0 flex items-center justify-center bg-black/25 transition hover:bg-black/35"
                data-testid="event-play-clip"
                aria-label={t("playClip")}
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-ink-on-accent shadow-float">
                  <Play className="ms-0.5 h-6 w-6" fill="currentColor" strokeWidth={0} />
                </span>
              </button>
            ) : null}
          </div>
        ) : event.has_clip ? (
          <Button variant="secondary" className="w-full" onClick={() => void loadClip()} disabled={clipLoading}>
            {clipLoading ? t("loading") : t("playClip")}
          </Button>
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-10 text-center text-sm text-ink-muted">
            {t("eventMediaUnavailable")}
          </p>
        )}
        {clipError ? <p className="mt-2 text-sm text-ink-muted">{clipError}</p> : null}
      </div>

      <div className="glass space-y-3 rounded-lg p-4">
        <p className="text-xs font-medium text-ink-muted">{t("eventDetailsSection")}</p>
        <dl className="space-y-2.5 text-sm">
          {ruleLabel && ruleLabel !== "—" ? (
            <Row
              label={t("matchedRule")}
              value={
                event.rule_id ? (
                  <Link
                    href={`/rules/${event.rule_id}`}
                    className="text-ink underline-offset-2 hover:underline"
                  >
                    {ruleLabel}
                  </Link>
                ) : (
                  ruleLabel
                )
              }
            />
          ) : null}
          {event.object_class ? <Row label={t("eventObject")} value={objectClassHe(event.object_class)} /> : null}
          {zoneLabel && zoneLabel !== "—" ? <Row label={t("eventZone")} value={zoneLabel} /> : null}
          {lineLabel && lineLabel !== "—" ? <Row label={t("eventLine")} value={lineLabel} /> : null}
          {dirLabel ? <Row label={t("eventDirection")} value={dirLabel} /> : null}
          {durationSec != null ? <Row label={t("duration")} value={formatDurationHe(durationSec)} /> : null}
          {!panel ? <Row label={t("eventCamera")} value={cameraName(event.camera_id)} /> : null}
          <Row label={t("eventWhen")} value={when} />
        </dl>
      </div>

      {!panel && labBack?.includes("run=") ? (
        <Link href={labBack}>
          <Button variant="secondary" className="w-full">
            {t("backToVideoLabRun")}
          </Button>
        </Link>
      ) : null}

      {showDev ? (
        <details
          className="glass rounded-lg px-4 py-3"
          open={showTech}
          onToggle={(e) => setShowTech((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-xs text-ink-muted">{t("technicalDetails")}</summary>
          <dl className="mt-3 space-y-2 text-xs">
            <Row label="event_id" value={event.id} mono />
            <Row label="camera_id" value={event.camera_id} mono />
            {event.rule_id ? <Row label="rule_id" value={event.rule_id} mono /> : null}
            {event.track_id != null ? <Row label="track_id" value={String(event.track_id)} mono /> : null}
            {event.confidence != null ? (
              <Row label={t("confidence")} value={event.confidence.toFixed(2)} mono />
            ) : null}
            {event.source_analysis_run_id ? (
              <Row label="analysis_run_id" value={event.source_analysis_run_id} mono />
            ) : null}
          </dl>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-muted p-3 text-xs text-ink-muted" dir="ltr">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd
        className={`min-w-0 break-words text-end text-ink ${mono ? "font-mono text-xs" : ""}`}
        dir={mono ? "ltr" : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
