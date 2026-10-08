"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { EventThumbnail } from "@/components/events/EventThumbnail";
import { formatDateTime, objectClassHe, severityHe, stateHe } from "@/lib/format";
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
};

export function EventDetailView({ eventId, variant = "page", returnTo = null }: Props) {
  const { token } = useAuth();
  const { cameraName, zoneName, ruleName } = useCatalog();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTech, setShowTech] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!token || !event?.has_clip) {
      setClipUrl(null);
      setClipError(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    setClipError(null);
    (async () => {
      try {
        const blob = await api.events.clipBlob(token, event.id);
        url = URL.createObjectURL(blob);
        if (!cancelled) setClipUrl(url);
      } catch {
        if (!cancelled) {
          setClipUrl(null);
          setClipError(t("eventClipUnavailable"));
        }
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, event?.id, event?.has_clip]);

  if (loading) return <LoadingBlock />;
  if (error || !event) return <ErrorBlock message={error ?? t("errorLoad")} onRetry={load} />;

  const duration = event.payload?.duration_seconds;
  const backHref = labReturnHref(event, returnTo);
  const ruleLabel =
    typeof event.payload?.rule_name === "string"
      ? event.payload.rule_name
      : ruleName(event.rule_id);

  const isDevSource = Boolean(event.source_analysis_run_id);
  const isNew = event.state === "new";
  const when = `${formatDateTime(event.started_at)}${
    event.trigger_timestamp_sec != null
      ? ` · ${t("videoTimestamp")} ${event.trigger_timestamp_sec.toFixed(1)} ${t("secondsUnit")}`
      : ""
  }`;
  const where = [cameraName(event.camera_id), zoneName(event.zone_id)].filter((x) => x && x !== "—").join(" · ");
  const panel = variant === "panel";
  const mediaClass = `w-full rounded-lg border border-border bg-black object-contain ${panel ? "max-h-48" : ""}`;

  return (
    <div className={panel ? "space-y-3 pb-2" : "mx-auto max-w-lg space-y-4 pb-4 md:pb-0"}>
      {panel ? (
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={isNew ? "solid" : "neutral"}>{stateHe(event.state)}</Chip>
          {isDevSource ? <Chip tone="dashed">{t("devSourceBadge")}</Chip> : null}
        </div>
      ) : (
        <PageHeader
          title={t("eventDetail")}
          backHref={backHref ?? "/events"}
          backLabel={
            backHref ? (backHref.includes("run=") ? t("backToVideoLabRun") : t("backToVideoLab")) : t("eventsTitle")
          }
          badge={
            <>
              <Chip tone={isNew ? "solid" : "neutral"}>{stateHe(event.state)}</Chip>
              {isDevSource ? <Chip tone="dashed">{t("devSourceBadge")}</Chip> : null}
            </>
          }
        />
      )}

      {event.has_clip && clipUrl ? (
        <video
          key={clipUrl}
          src={clipUrl}
          poster={snapshotLargeUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          className={mediaClass}
          data-testid="event-clip-player"
        >
          <source src={clipUrl} type="video/mp4" />
        </video>
      ) : event.has_clip && clipError ? (
        <div className="space-y-2">
          {snapshotLargeUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={snapshotLargeUrl} alt="" className={`${mediaClass} bg-muted`} />
          ) : null}
          <p className="text-sm text-ink-muted">{clipError}</p>
        </div>
      ) : event.has_clip ? (
        <div
          className={`flex items-center justify-center rounded-lg border border-border bg-muted ${
            panel ? "h-40" : "h-56"
          }`}
        >
          <p className="text-sm text-ink-muted">{t("loading")}</p>
        </div>
      ) : snapshotLargeUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={snapshotLargeUrl} alt="" className={`${mediaClass} bg-muted`} />
      ) : event.has_snapshot ? (
        <EventThumbnail
          token={token}
          eventId={event.id}
          hasSnapshot
          className={`flex w-full items-center justify-center rounded-lg border border-border bg-muted ${
            panel ? "h-40" : "h-56"
          }`}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-10 text-center text-sm text-ink-muted">
          {t("eventMediaUnavailable")}
        </p>
      )}

      <Card className="space-y-3">
        <p className="text-base font-medium text-ink">{event.message_he ?? objectClassHe(event.object_class)}</p>
        <dl className="space-y-2 text-sm">
          <Row label={t("eventWhere")} value={where || "—"} />
          <Row label={t("eventWhen")} value={when} />
          <Row label={t("eventWhy")} value={ruleLabel} />
          <Row label={t("eventObject")} value={objectClassHe(event.object_class)} />
          {typeof duration === "number" ? <Row label={t("duration")} value={`${duration} ${t("seconds")}`} /> : null}
          <Row label={t("severity")} value={severityHe(event.severity)} />
        </dl>
      </Card>

      {!panel && backHref?.includes("run=") ? (
        <Link href={backHref}>
          <Button variant="secondary" className="w-full">
            {t("backToVideoLabRun")}
          </Button>
        </Link>
      ) : null}

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
          {event.confidence != null ? <Row label={t("confidence")} value={event.confidence.toFixed(2)} mono /> : null}
          {event.source_analysis_run_id ? (
            <Row label="analysis_run_id" value={event.source_analysis_run_id} mono />
          ) : null}
        </dl>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-muted p-3 text-xs text-ink-muted" dir="ltr">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className={`min-w-0 break-all text-end text-ink ${mono ? "font-mono" : ""}`} dir={mono ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}
