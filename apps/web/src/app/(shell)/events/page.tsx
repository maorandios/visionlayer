"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { EventTimeline } from "@/components/events/EventTimeline";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { t } from "@/i18n/he";
import { scopeEventsToLatestTestRuns } from "@/lib/events-run-scope";
import { useCatalog } from "@/providers/CatalogProvider";
import { useEvents } from "@/providers/EventsProvider";

function EventsInner() {
  const { events, loading, error, refresh } = useEvents();
  const { cameraName, ruleName } = useCatalog();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const labReturn = returnTo && returnTo.startsWith("/dev/video-lab") ? returnTo : null;
  const scoped = useMemo(() => scopeEventsToLatestTestRuns(events), [events]);

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
