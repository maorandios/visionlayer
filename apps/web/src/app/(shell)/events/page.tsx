"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { EventCard } from "@/components/events/EventCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { Tabs } from "@/components/ui/Tabs";
import { t } from "@/i18n/he";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";
import { useEvents } from "@/providers/EventsProvider";

type StateFilter = "all" | "new" | "acknowledged";

function EventsInner() {
  const { token } = useAuth();
  const router = useRouter();
  const { events, loading, error, refresh } = useEvents();
  const { cameraName, ruleName } = useCatalog();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const labReturn = returnTo && returnTo.startsWith("/dev/video-lab") ? returnTo : null;
  const stateParam = searchParams.get("state");
  const stateFilter: StateFilter = stateParam === "new" || stateParam === "acknowledged" ? stateParam : "all";

  const setStateFilter = (next: StateFilter) => {
    const q = new URLSearchParams(searchParams.toString());
    if (next === "all") q.delete("state");
    else q.set("state", next);
    const s = q.toString();
    router.replace(s ? `/events?${s}` : "/events", { scroll: false });
  };

  const counts = useMemo(
    () => ({
      all: events.length,
      new: events.filter((e) => e.state === "new").length,
      acknowledged: events.filter((e) => e.state !== "new").length,
    }),
    [events],
  );

  const visible = useMemo(
    () =>
      events.filter((e) => {
        if (stateFilter === "new") return e.state === "new";
        if (stateFilter === "acknowledged") return e.state !== "new";
        return true;
      }),
    [events, stateFilter],
  );

  if (loading && events.length === 0) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("eventsTitle")}
        subtitle={t("eventsSubtitle")}
        backHref={labReturn ?? undefined}
        backLabel={labReturn ? (labReturn.includes("run=") ? t("backToVideoLabRun") : t("backToVideoLab")) : undefined}
      />
      {events.length > 0 ? (
        <Tabs
          size="sm"
          ariaLabel={t("state")}
          value={stateFilter}
          onChange={setStateFilter}
          items={[
            { id: "all", label: t("filterAll"), count: counts.all },
            { id: "new", label: t("filterNew"), count: counts.new },
            { id: "acknowledged", label: t("filterAcknowledged"), count: counts.acknowledged },
          ]}
        />
      ) : null}
      {visible.length === 0 ? (
        <EmptyBlock message={t("emptyEvents")} />
      ) : (
        <ul className="space-y-3">
          {visible.map((ev) => {
            const href = labReturn
              ? `/events/${ev.id}?returnTo=${encodeURIComponent(labReturn)}`
              : `/events/${ev.id}`;
            return (
              <li key={ev.id}>
                {/* EventCard renders EventThumbnail from ev.has_snapshot */}
                <EventCard
                  event={ev}
                  token={token}
                  href={href}
                  cameraName={cameraName(ev.camera_id)}
                  ruleName={ruleName(ev.rule_id)}
                />
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
