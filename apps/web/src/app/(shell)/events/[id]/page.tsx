"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {backHref.includes("run=") ? t("backToVideoLabRun") : t("backToVideoLab")}
        </Link>
      ) : (
        <Link href="/events" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
          <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {t("eventsTitle")}
        </Link>
      )}
      <h1 className="text-2xl font-semibold text-ink">{t("eventDetail")}</h1>
      <Card className="space-y-4">
        {snapshotLargeUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={snapshotLargeUrl}
            alt=""
            className="w-full rounded-xl border border-border object-contain"
          />
        ) : event.has_snapshot ? (
          <EventThumbnail
            token={token}
            eventId={event.id}
            hasSnapshot
            className="flex h-48 w-full items-center justify-center rounded-xl border border-border bg-muted"
          />
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-8 text-center text-sm text-ink-muted">
            {t("eventMediaUnavailable")}
          </p>
        )}

        <p className="text-base font-medium text-ink">{event.message_he}</p>
        <Row label="זמן" value={formatDateTime(event.started_at)} />
        <Row label="מצלמה" value={cameraName(event.camera_id)} />
        <Row label="אזור" value={zoneName(event.zone_id)} />
        <Row label={t("matchedRule")} value={ruleLabel} />
        <Row label="אובייקט" value={objectClassHe(event.object_class)} />
        {typeof duration === "number" ? (
          <Row label={t("duration")} value={`${duration} ${t("seconds")}`} />
        ) : null}
        {event.trigger_timestamp_sec != null ? (
          <Row
            label={t("videoTimestamp")}
            value={`${event.trigger_timestamp_sec.toFixed(1)} ${t("secondsUnit")}`}
          />
        ) : null}
        <Row label={t("severity")} value={severityHe(event.severity)} />
        <Row label={t("state")} value={stateHe(event.state)} />
        {event.state === "new" ? (
          <Button className="w-full" onClick={onAck}>
            {t("acknowledge")}
          </Button>
        ) : null}
        {event.has_clip ? (
          <Button variant="secondary" className="w-full" onClick={() => setShowClip((v) => !v)}>
            {showClip ? t("hideEventClip") : t("showEventClip")}
          </Button>
        ) : null}
        {showClip && clipUrl ? (
          <video
            key={clipUrl}
            src={clipUrl}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="w-full rounded-xl border border-border bg-black"
          >
            <source src={clipUrl} type="video/mp4" />
          </video>
        ) : null}
        {showClip && clipError ? (
          <p className="text-sm text-ink-muted">{clipError}</p>
        ) : null}
        {backHref?.includes("run=") ? (
          <Link href={backHref}>
            <Button variant="secondary" className="w-full">
              {t("backToVideoLabRun")}
            </Button>
          </Link>
        ) : null}
        <button
          type="button"
          className="text-xs text-ink-muted underline"
          onClick={() => setShowTech((v) => !v)}
        >
          {t("technicalDetails")}
        </button>
        {showTech ? (
          <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-xs text-ink-muted" dir="ltr">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        ) : null}
      </Card>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="text-end text-ink">{value}</span>
    </div>
  );
}
