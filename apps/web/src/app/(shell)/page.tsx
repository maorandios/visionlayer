"use client";

import { Activity, Camera, FileText, Shield } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { formatDateTime, isToday, stateHe } from "@/lib/format";
import { api } from "@/lib/api";
import type { Camera as CameraType, Rule } from "@/lib/types";
import { EventThumbnail } from "@/components/events/EventThumbnail";
import { useAuth } from "@/providers/AuthProvider";
import { useEvents } from "@/providers/EventsProvider";
import { useCatalog } from "@/providers/CatalogProvider";
import { t } from "@/i18n/he";

export default function DashboardPage() {
  const { token } = useAuth();
  const { cameraName } = useCatalog();
  const { events, loading: eventsLoading, error: eventsError, refresh } = useEvents();
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [c, r] = await Promise.all([api.cameras.list(token), api.rules.list(token)]);
        setCameras(c);
        setRules(r);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("errorLoad"));
      } finally {
        setLoading(false);
      }
    })();
  }, [token, refresh]);

  const stats = useMemo(() => {
    const activeCameras = cameras.filter((c) => c.enabled).length;
    const activeRules = rules.filter((r) => r.enabled).length;
    const eventsToday = events.filter((e) => isToday(e.created_at)).length;
    return { totalCameras: cameras.length, activeCameras, activeRules, eventsToday };
  }, [cameras, rules, events]);

  if (loading || eventsLoading) return <LoadingBlock />;
  if (error || eventsError)
    return <ErrorBlock message={error ?? eventsError ?? t("errorLoad")} onRetry={refresh} />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">{t("dashboardTitle")}</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Activity} label={t("systemStatus")} value={t("systemOk")} />
        <StatCard icon={Camera} label={t("camerasActive")} value={`${stats.activeCameras}/${stats.totalCameras}`} />
        <StatCard icon={Shield} label={t("rulesActive")} value={String(stats.activeRules)} />
        <StatCard icon={FileText} label={t("eventsToday")} value={String(stats.eventsToday)} />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-ink">{t("recentEvents")}</h2>
        {events.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("emptyEvents")}</p>
        ) : (
          <ul className="space-y-2">
            {events.slice(0, 5).map((ev) => (
              <li key={ev.id}>
                <Link href={`/events/${ev.id}`}>
                  <Card className="transition hover:bg-muted/40">
                    <div className="flex gap-3">
                      <EventThumbnail
                        token={token}
                        eventId={ev.id}
                        hasSnapshot={Boolean(ev.has_snapshot)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-2 text-sm font-medium text-ink">{ev.message_he}</p>
                          <span className="shrink-0 rounded-lg bg-muted px-2 py-0.5 text-[11px] text-ink">
                            {stateHe(ev.state)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-ink-muted">
                          {cameraName(ev.camera_id)} · {formatDateTime(ev.started_at)}
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-ink-muted">{label}</p>
          <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-ink-muted" strokeWidth={1.75} aria-hidden />
      </div>
    </Card>
  );
}
