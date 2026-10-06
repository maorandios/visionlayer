"use client";

import { AlertCircle, Camera, CheckCircle2, Shield } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EventCard } from "@/components/events/EventCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { KpiCard } from "@/components/ui/KpiCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { t } from "@/i18n/he";
import { api } from "@/lib/api";
import { isToday } from "@/lib/format";
import { formatCount, rangeFor } from "@/lib/metrics";
import type { MetricsSummary } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";
import { useEvents } from "@/providers/EventsProvider";

export default function HomePage() {
  const { token } = useAuth();
  const { cameras, rules, cameraName, ruleName, loading: catalogLoading } = useCatalog();
  const { events, loading: eventsLoading, error: eventsError, refresh } = useEvents();
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const eventCount = events.length;

  useEffect(() => {
    // Re-fetch today's summary whenever a new event arrives (eventCount changes).
    if (!token || eventCount < 0) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await api.metrics.summary(token, { scope: "production", ...rangeFor("today") });
        if (!cancelled) setSummary(s);
      } catch {
        if (!cancelled) setSummary(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, eventCount]);

  const stats = useMemo(() => {
    const enabledCameras = cameras.filter((c) => c.enabled).length;
    const disabledCameras = cameras.length - enabledCameras;
    const activeRules = rules.filter((r) => r.enabled).length;
    const todayEvents = events.filter((e) => isToday(e.created_at) && !e.source_analysis_run_id);
    const newEvents = events.filter((e) => e.state === "new" && !e.source_analysis_run_id).length;
    return {
      totalCameras: cameras.length,
      enabledCameras,
      disabledCameras,
      activeRules,
      eventsToday: todayEvents.length,
      newEvents,
    };
  }, [cameras, rules, events]);

  if (catalogLoading && cameras.length === 0) return <LoadingBlock />;
  if (eventsLoading && events.length === 0) return <LoadingBlock />;
  if (eventsError) return <ErrorBlock message={eventsError} onRetry={refresh} />;

  const systemHealthy = stats.disabledCameras === 0;
  const vehicles = summary?.vehicles?.unique_objects ?? 0;
  const persons = summary?.persons?.unique_objects ?? 0;
  const attention: { text: string; href: string }[] = [];
  if (stats.newEvents > 0) {
    attention.push({ text: `${stats.newEvents} ${t("newEventsCount")}`, href: "/events?state=new" });
  }
  if (stats.disabledCameras > 0) {
    attention.push({
      text:
        stats.disabledCameras === 1
          ? "מצלמה אחת מושבתת"
          : `${stats.disabledCameras} ${t("disabledCamerasCount")}`,
      href: "/cameras",
    });
  }
  if (rules.length === 0 && cameras.length > 0) {
    attention.push({ text: t("noRulesYetHint"), href: "/rules/new" });
  }

  const recent = events.filter((e) => !e.source_analysis_run_id).slice(0, 5);

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold text-ink">{t("dashboardTitle")}</h1>
        <Card className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="home-status">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
            {systemHealthy ? (
              <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            ) : (
              <AlertCircle className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            )}
            {systemHealthy ? t("homeSystemActive") : t("homeSystemPartial")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
            <Camera className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {stats.enabledCameras}/{stats.totalCameras} {t("camerasTotal")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
            <Shield className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {stats.activeRules} {t("rulesActive")}
          </span>
        </Card>
      </header>

      <section>
        <SectionHeader
          title={t("todaySummary")}
          action={
            <Link href="/insights" className="text-xs text-ink-muted hover:text-ink">
              {t("navInsights")} ›
            </Link>
          }
        />
        <div className="grid grid-cols-3 gap-3" data-testid="home-today">
          <KpiCard label={t("vehiclesToday")} value={formatCount(vehicles)} />
          <KpiCard label={t("peopleToday")} value={formatCount(persons)} />
          <KpiCard label={t("eventsToday")} value={formatCount(stats.eventsToday)} />
        </div>
      </section>

      <section data-testid="home-attention">
        <SectionHeader title={t("needsAttention")} />
        {attention.length === 0 ? (
          <Card className="flex items-center gap-2 text-sm text-ink-muted">
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {t("allGood")}
          </Card>
        ) : (
          <ul className="space-y-2">
            {attention.map((item) => (
              <li key={item.href + item.text}>
                <Link href={item.href} className="block">
                  <Card className="flex min-h-12 items-center justify-between gap-3 py-2.5 transition hover:bg-muted/40">
                    <span className="text-sm text-ink">{item.text}</span>
                    <Chip tone="outline">{t("viewAll")}</Chip>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeader
          title={t("recentEvents")}
          action={
            <Link href="/events" className="text-xs text-ink-muted hover:text-ink">
              {t("viewAll")} ›
            </Link>
          }
        />
        {recent.length === 0 ? (
          <EmptyBlock
            message={t("emptyEvents")}
            action={
              rules.length === 0 ? (
                <Link href="/rules/new">
                  <Button variant="secondary">{t("addRule")}</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-2">
            {recent.map((ev) => (
              <li key={ev.id}>
                <EventCard
                  event={ev}
                  token={token}
                  href={`/events/${ev.id}`}
                  cameraName={cameraName(ev.camera_id)}
                  ruleName={ruleName(ev.rule_id)}
                  variant="compact"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
