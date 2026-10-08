"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { EventTimeline } from "@/components/events/EventTimeline";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { t } from "@/i18n/he";
import { api } from "@/lib/api";
import { scopeEventsToLatestTestRuns } from "@/lib/events-run-scope";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";
import { useEvents } from "@/providers/EventsProvider";

function EventsInner() {
  const { events, loading, error, refresh } = useEvents();
  const { cameraName, ruleName } = useCatalog();
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const labReturn = returnTo && returnTo.startsWith("/dev/video-lab") ? returnTo : null;
  const [latestByCamera, setLatestByCamera] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.videoLab.latestSuccessfulRuns(token);
        if (!cancelled) setLatestByCamera(res.by_camera ?? {});
      } catch {
        // Fall back to feed-inferred scoping inside the helper.
        if (!cancelled) setLatestByCamera(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, events.length]);

  const scoped = useMemo(
    () => scopeEventsToLatestTestRuns(events, latestByCamera ?? undefined),
    [events, latestByCamera],
  );

  if (error) return <ErrorBlock message={t("eventsLoadError")} onRetry={refresh} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("eventsTitle")}
        subtitle={t("eventsSubtitle")}
        backHref={labReturn ?? undefined}
        backLabel={
          labReturn ? (labReturn.includes("run=") ? t("backToVideoLabRun") : t("backToVideoLab")) : undefined
        }
      />
      <EventTimeline
        events={scoped}
        loading={loading}
        emptyMessage={t("emptyEvents")}
        emptyHint={t("eventsEmptyHintCamera")}
        showCamera
        cameraName={cameraName}
        ruleName={ruleName}
        hrefFor={(ev) =>
          labReturn
            ? `/events/${ev.id}?returnTo=${encodeURIComponent(labReturn)}`
            : `/events/${ev.id}`
        }
      />
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
