"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { formatDateTime, objectClassHe, severityHe, stateHe } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { EventThumbnail } from "@/components/events/EventThumbnail";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";
import { useEvents } from "@/providers/EventsProvider";
import { t } from "@/i18n/he";

function EventsInner() {
  const { token } = useAuth();
  const { events, loading, error, refresh } = useEvents();
  const { cameraName, zoneName, ruleName } = useCatalog();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const labReturn =
    returnTo && returnTo.startsWith("/dev/video-lab") ? returnTo : null;

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  return (
    <div className="space-y-4">
      {labReturn ? (
        <Link
          href={labReturn}
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {labReturn.includes("run=") ? t("backToVideoLabRun") : t("backToVideoLab")}
        </Link>
      ) : null}
      <h1 className="text-2xl font-semibold text-ink">{t("eventsTitle")}</h1>
      {events.length === 0 ? (
        <EmptyBlock message={t("emptyEvents")} />
      ) : (
        <ul className="space-y-3">
          {events.map((ev) => {
            const href = labReturn
              ? `/events/${ev.id}?returnTo=${encodeURIComponent(labReturn)}`
              : `/events/${ev.id}`;
            return (
              <li key={ev.id}>
                <Link href={href}>
                  <Card className="transition hover:bg-muted/40">
                    <div className="flex gap-3">
                      <EventThumbnail
                        token={token}
                        eventId={ev.id}
                        hasSnapshot={Boolean(ev.has_snapshot)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-ink">{ev.message_he}</p>
                          <span className="shrink-0 rounded-lg bg-muted px-2 py-0.5 text-[11px] text-ink">
                            {stateHe(ev.state)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-ink-muted">
                          {cameraName(ev.camera_id)} · {formatDateTime(ev.started_at)}
                        </p>
                        {ev.rule_id ? (
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {t("matchedRule")}: {ruleName(ev.rule_id)}
                          </p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-ink-muted">
                          <span>{zoneName(ev.zone_id)}</span>
                          <span>{objectClassHe(ev.object_class)}</span>
                          <span>{severityHe(ev.severity)}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <EventsInner />
    </Suspense>
  );
}
