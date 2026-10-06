"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { EventCard } from "@/components/events/EventCard";
import { RuleCard } from "@/components/rules/RuleCard";
import { BarChart } from "@/components/ui/BarChart";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { Tabs } from "@/components/ui/Tabs";
import { t } from "@/i18n/he";
import { api } from "@/lib/api";
import { cameraStatusHe, formatDateTime } from "@/lib/format";
import { DIRECTION_HE, fillBuckets, formatCount, formatSeconds, rangeFor } from "@/lib/metrics";
import { describeRule } from "@/lib/rule-describe";
import type { Camera, Line, MetricsBreakdown, MetricsSummary, MetricsTimeseries, Rule, Zone } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { isVirtualCamera, useCatalog } from "@/providers/CatalogProvider";
import { useEvents } from "@/providers/EventsProvider";

type Tab = "overview" | "zones" | "rules" | "events" | "metrics" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: t("cameraOverview") },
  { id: "zones", label: t("cameraZonesLines") },
  { id: "rules", label: t("cameraRules") },
  { id: "events", label: t("cameraEvents") },
  { id: "metrics", label: t("cameraMetrics") },
  { id: "settings", label: t("cameraSettings") },
];

function CameraWorkspaceInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const { token } = useAuth();
  const { zoneName, lineName, cameraName, ruleName, refresh: refreshCatalog } = useCatalog();
  const { events } = useEvents();

  const requestedTab = search.get("tab") as Tab | null;
  const tab: Tab = requestedTab && TABS.some((x) => x.id === requestedTab) ? requestedTab : "overview";
  const setTab = (next: Tab) => router.replace(`/cameras/${params.id}?tab=${next}`, { scroll: false });

  const [camera, setCamera] = useState<Camera | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const id = params.id;
      const [cam, z, ln, r] = await Promise.all([
        api.cameras.get(token, id),
        api.zones.listForCamera(token, id),
        api.lines.listForCamera(token, id),
        api.rules.list(token),
      ]);
      setCamera(cam);
      setZones(z);
      setLines(ln);
      setRules(r.filter((rule) => rule.conditions.camera_id === id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [token, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const cameraEvents = useMemo(
    () => events.filter((e) => e.camera_id === params.id),
    [events, params.id],
  );

  async function toggleEnabled() {
    if (!token || !camera) return;
    setBusy(true);
    try {
      if (camera.enabled) await api.cameras.disable(token, camera.id);
      else await api.cameras.enable(token, camera.id);
      await Promise.all([load(), refreshCatalog()]);
    } finally {
      setBusy(false);
    }
  }

  async function toggleRule(rule: Rule) {
    if (!token) return;
    await api.rules.update(token, rule.id, { enabled: !rule.enabled });
    await Promise.all([load(), refreshCatalog()]);
  }

  async function removeCamera() {
    if (!token || !camera) return;
    setBusy(true);
    try {
      await api.cameras.delete(token, camera.id);
      await refreshCatalog();
      router.push("/cameras");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  if (loading && !camera) return <LoadingBlock />;
  if (error || !camera) return <ErrorBlock message={error ?? t("errorLoad")} onRetry={load} />;

  const virtualCam = isVirtualCamera(camera);
  const activeRules = rules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title={camera.name}
        backHref="/cameras"
        backLabel={t("camerasTitle")}
        subtitle={`${camera.location ?? "—"} · ${cameraStatusHe(camera.status)}`}
        badge={
          <>
            <Chip tone={camera.enabled ? "solid" : "outline"}>{camera.enabled ? t("enabled") : t("disabled")}</Chip>
            {virtualCam ? <Chip tone="dashed">{t("devSourceBadge")}</Chip> : null}
          </>
        }
      />

      <Tabs items={TABS} value={tab} onChange={setTab} ariaLabel={t("cameraDetail")} />

      {tab === "overview" ? (
        <div className="space-y-4" data-testid="camera-tab-overview">
          <div className="flex aspect-video items-center justify-center rounded-2xl border border-border bg-muted text-sm text-ink-muted">
            {virtualCam ? t("virtualCamera") : t("previewPlaceholder")}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label={t("zonesCount")} value={zones.length} />
            <KpiCard label={t("linesCount")} value={lines.length} />
            <KpiCard label={t("activeRulesCount")} value={activeRules} />
          </div>
          <section>
            <SectionHeader
              title={t("recentEvents")}
              action={
                <button type="button" className="text-xs text-ink-muted hover:text-ink" onClick={() => setTab("events")}>
                  {t("viewAll")} ›
                </button>
              }
            />
            {cameraEvents.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noEventsForCamera")}</p>
            ) : (
              <ul className="space-y-2">
                {cameraEvents.slice(0, 3).map((ev) => (
                  <li key={ev.id}>
                    <EventCard
                      event={ev}
                      token={token}
                      href={`/events/${ev.id}`}
                      cameraName={cameraName(ev.camera_id)}
                      variant="compact"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {tab === "zones" ? (
        <div className="space-y-5" data-testid="camera-tab-zones">
          <section>
            <SectionHeader
              title={t("zonesSection")}
              action={
                <Link href={`/cameras/${camera.id}/zones/new`}>
                  <Button variant="secondary" size="sm">
                    <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                    {t("addZone")}
                  </Button>
                </Link>
              }
            />
            {zones.length === 0 ? (
              <EmptyBlock message={t("emptyZones")} />
            ) : (
              <ul className="space-y-2">
                {zones.map((z) => (
                  <li key={z.id}>
                    <Card className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">{z.name}</p>
                        <p className="text-xs text-ink-muted">{z.points.length} נקודות</p>
                      </div>
                      <Chip tone={z.enabled ? "neutral" : "outline"}>{z.enabled ? t("enabled") : t("disabled")}</Chip>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <SectionHeader
              title={t("linesSection")}
              action={
                <Link href={`/cameras/${camera.id}/lines/new`}>
                  <Button variant="secondary" size="sm">
                    <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                    {t("addLine")}
                  </Button>
                </Link>
              }
            />
            {lines.length === 0 ? (
              <EmptyBlock message={t("emptyLines")} />
            ) : (
              <ul className="space-y-2">
                {lines.map((ln) => (
                  <li key={ln.id}>
                    <Card className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">{ln.name}</p>
                        <p className="text-xs text-ink-muted">
                          {t("directionLabel")} {DIRECTION_HE[ln.direction] ?? ln.direction}
                        </p>
                      </div>
                      <Chip tone={ln.enabled ? "neutral" : "outline"}>{ln.enabled ? t("enabled") : t("disabled")}</Chip>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {tab === "rules" ? (
        <div className="space-y-3" data-testid="camera-tab-rules">
          <SectionHeader
            title={t("activeRulesForCam")}
            action={
              <Link href={`/rules/new?cameraId=${camera.id}`}>
                <Button variant="secondary" size="sm">
                  <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {t("addRule")}
                </Button>
              </Link>
            }
          />
          {rules.length === 0 ? (
            <EmptyBlock
              message={t("emptyRules")}
              hint={zones.length === 0 && lines.length === 0 ? t("noZonesForCam") : undefined}
            />
          ) : (
            <ul className="space-y-3">
              {rules.map((rule) => (
                <li key={rule.id}>
                  <RuleCard
                    rule={rule}
                    description={describeRule(rule, { cameraName, zoneName, lineName })}
                    showCamera={false}
                    actions={
                      <>
                        <Button variant="secondary" size="sm" onClick={() => toggleRule(rule)}>
                          {rule.enabled ? t("disable") : t("enable")}
                        </Button>
                        <Link href={`/rules/${rule.id}`}>
                          <Button variant="ghost" size="sm">
                            {t("edit")}
                          </Button>
                        </Link>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "events" ? (
        <div data-testid="camera-tab-events">
          {cameraEvents.length === 0 ? (
            <EmptyBlock message={t("noEventsForCamera")} />
          ) : (
            <ul className="space-y-2">
              {cameraEvents.map((ev) => (
                <li key={ev.id}>
                  <EventCard
                    event={ev}
                    token={token}
                    href={`/events/${ev.id}`}
                    cameraName={cameraName(ev.camera_id)}
                    ruleName={ruleName(ev.rule_id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "metrics" ? (
        <CameraMetrics cameraId={camera.id} virtualCam={virtualCam} zoneName={zoneName} lineName={lineName} />
      ) : null}

      {tab === "settings" ? (
        <div className="space-y-4" data-testid="camera-tab-settings">
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{t("cameraDetail")}</p>
                <p className="text-xs text-ink-muted">
                  {camera.location ?? "—"} · {formatDateTime(camera.created_at)}
                </p>
              </div>
              <Link href={`/cameras/${camera.id}/edit`}>
                <Button variant="secondary" size="sm">
                  {t("edit")}
                </Button>
              </Link>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <p className="text-sm text-ink">{camera.enabled ? t("enabled") : t("disabled")}</p>
              <Button variant="secondary" size="sm" onClick={toggleEnabled} disabled={busy}>
                {camera.enabled ? t("disable") : t("enable")}
              </Button>
            </div>
          </Card>
          <Card className="space-y-2 border-dashed">
            <p className="text-sm font-medium text-ink">{t("cameraDangerZone")}</p>
            <p className="text-xs text-ink-muted">{t("deleteCameraConfirm")}</p>
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} disabled={busy}>
              {t("deleteCamera")}
            </Button>
          </Card>
          <ConfirmDialog
            open={confirmDelete}
            title={t("deleteCamera")}
            description={t("deleteCameraConfirm")}
            onConfirm={removeCamera}
            onCancel={() => setConfirmDelete(false)}
            busy={busy}
          />
        </div>
      ) : null}
    </div>
  );
}

function CameraMetrics({
  cameraId,
  virtualCam,
  zoneName,
  lineName,
}: {
  cameraId: string;
  virtualCam: boolean;
  zoneName: (id: string | null | undefined) => string;
  lineName: (id: string | null | undefined) => string;
}) {
  const { token } = useAuth();
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [series, setSeries] = useState<MetricsTimeseries | null>(null);
  const [byZone, setByZone] = useState<MetricsBreakdown | null>(null);
  const [byLine, setByLine] = useState<MetricsBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const filters = {
          scope: (virtualCam ? "video_lab" : "production") as "video_lab" | "production",
          camera_id: cameraId,
          ...(virtualCam ? {} : rangeFor("today")),
        };
        const [s, ts, z, l] = await Promise.all([
          api.metrics.summary(token, filters),
          api.metrics.timeseries(token, "zone_entries", "hour", filters),
          api.metrics.breakdown(token, "zone_entries", "zone", filters),
          api.metrics.breakdown(token, "line_crossings", "line", filters),
        ]);
        if (cancelled) return;
        setSummary(s);
        setSeries(ts);
        setByZone(z);
        setByLine(l);
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, cameraId, virtualCam]);

  if (loading) return <LoadingBlock />;
  if (!summary) return <EmptyBlock message={t("noMetricsYet")} />;

  const totals = summary.totals;
  const empty = totals.zone_entries === 0 && totals.line_crossings === 0 && totals.unique_objects === 0;
  if (empty) return <EmptyBlock message={t("noMetricsYet")} />;

  return (
    <div className="space-y-4" data-testid="camera-tab-metrics">
      {virtualCam ? <Chip tone="dashed">{t("scopeVideoLab")}</Chip> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label={t("uniqueObjects")} value={formatCount(totals.unique_objects)} />
        <KpiCard label={t("zoneEntries")} value={formatCount(totals.zone_entries)} />
        <KpiCard label={t("lineCrossings")} value={formatCount(totals.line_crossings)} />
        <KpiCard label={t("avgDwell")} value={formatSeconds(summary.dwell.avg_seconds)} />
      </div>
      {!virtualCam ? (
        <Card>
          <SectionHeader title={t("entriesByHour")} />
          <BarChart points={fillBuckets(series, "today")} />
        </Card>
      ) : null}
      {summary.occupancy.length > 0 ? (
        <Card>
          <SectionHeader title={t("occupancyNow")} />
          <ul className="divide-y divide-border text-sm">
            {summary.occupancy.map((o) => (
              <li key={o.zone_id} className="flex items-center justify-between py-2">
                <span className="text-ink">{zoneName(o.zone_id)}</span>
                <span className="text-ink-muted">
                  {o.current} · {t("occupancyPeak")} {o.peak}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {(byZone?.items.length ?? 0) > 0 ? (
        <Card>
          <SectionHeader title={`${t("zoneEntries")} ${t("byZone")}`} />
          <BreakdownList items={byZone!.items} nameOf={zoneName} />
        </Card>
      ) : null}
      {(byLine?.items.length ?? 0) > 0 ? (
        <Card>
          <SectionHeader title={`${t("lineCrossings")} ${t("byLine")}`} />
          <BreakdownList items={byLine!.items} nameOf={lineName} />
        </Card>
      ) : null}
    </div>
  );
}

function BreakdownList({
  items,
  nameOf,
}: {
  items: { key: string; value: number }[];
  nameOf: (id: string) => string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.key} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink">{nameOf(it.key)}</span>
            <span className="text-ink-muted tabular-nums">{formatCount(it.value)}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-ink" style={{ width: `${(it.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function CameraWorkspacePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <CameraWorkspaceInner />
    </Suspense>
  );
}
