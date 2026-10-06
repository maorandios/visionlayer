"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { formatDateTime, objectClassHe, severityHe, stateHe } from "@/lib/format";
import { api } from "@/lib/api";
import type { EventItem } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";
import { useEvents } from "@/providers/EventsProvider";
import { t } from "@/i18n/he";
import { EventThumbnail } from "@/components/events/EventThumbnail";

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

function EventDetailInner() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const { token } = useAuth();
  const { patchEvent } = useEvents();
  const { cameraName, zoneName, ruleName } = useCatalog();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTech, setShowTech] = useState(false);
  const [showClip, setShowClip] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);
  const [snapshotLargeUrl, setSnapshotLargeUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setEvent(await api.events.get(token, id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    load();
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
    if (!showClip || !token || !event?.has_clip) return;
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
  }, [showClip, token, event?.id, event?.has_clip]);

  async function onAck() {
    if (!token || !event) return;
    const res = await api.events.acknowledge(token, event.id);
    setEvent({ ...event, state: res.state });
    patchEvent(event.id, { state: res.state });
  }

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

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-20 md:pb-0">
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

      {/* Hero media */}
      {snapshotLargeUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={snapshotLargeUrl}
          alt=""
          className="w-full rounded-2xl border border-border bg-muted object-contain"
        />
      ) : event.has_snapshot ? (
        <EventThumbnail
          token={token}
          eventId={event.id}
          hasSnapshot
          className="flex h-56 w-full items-center justify-center rounded-2xl border border-border bg-muted"
        />
      ) : (
        <p className="rounded-2xl border border-dashed border-border bg-muted/40 px-3 py-10 text-center text-sm text-ink-muted">
          {t("eventMediaUnavailable")}
        </p>
      )}

      {showClip && clipUrl ? (
        <video
          key={clipUrl}
          src={clipUrl}
          controls
          autoPlay
          playsInline
          preload="metadata"
          className="w-full rounded-2xl border border-border bg-black"
        >
          <source src={clipUrl} type="video/mp4" />
        </video>
      ) : null}
      {showClip && clipError ? <p className="text-sm text-ink-muted">{clipError}</p> : null}

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

      {/* Primary actions — sticky on mobile so "אישור אירוע" is always reachable */}
      <div className="fixed inset-x-0 bottom-14 z-30 border-t border-border bg-surface/95 p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-lg gap-2">
          {isNew ? (
            <Button className="flex-1" onClick={onAck}>
              {t("acknowledge")}
            </Button>
          ) : null}
          {event.has_clip ? (
            <Button variant="secondary" className="flex-1" onClick={() => setShowClip((v) => !v)}>
              {showClip ? t("hideEventClip") : t("showEventClip")}
            </Button>
          ) : null}
          {!isNew && !event.has_clip && backHref?.includes("run=") ? (
            <Link href={backHref} className="flex-1">
              <Button variant="secondary" className="w-full">
                {t("backToVideoLabRun")}
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      <details
        className="rounded-2xl border border-border bg-surface px-4 py-3"
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
          {event.source_analysis_run_id ? <Row label="analysis_run_id" value={event.source_analysis_run_id} mono /> : null}
        </dl>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-muted p-3 text-xs text-ink-muted" dir="ltr">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export default function EventDetailPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <EventDetailInner />
    </Suspense>
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
