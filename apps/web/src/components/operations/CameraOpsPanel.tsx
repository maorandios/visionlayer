"use client";

import { ArrowRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EventCard } from "@/components/events/EventCard";
import { EventDetailView } from "@/components/events/EventDetailView";
import { CameraMetricsPanel } from "@/components/cameras/CameraMetricsPanel";
import { RuleCard } from "@/components/rules/RuleCard";
import { RuleWizard } from "@/components/rules/wizard/RuleWizard";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { KpiCard } from "@/components/ui/KpiCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyBlock } from "@/components/ui/StateBlock";
import { Tabs } from "@/components/ui/Tabs";
import { t } from "@/i18n/he";
import { api } from "@/lib/api";
import { cameraStatusHe } from "@/lib/format";
import { describeRule } from "@/lib/rule-describe";
import type { OpsTab } from "@/components/operations/ops-url";
import { OPS_TABS } from "@/components/operations/ops-url";
import type { Camera, Rule } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { isVirtualCamera, useCatalog } from "@/providers/CatalogProvider";
import { useEvents } from "@/providers/EventsProvider";

type PanelView =
  | { kind: "main" }
  | { kind: "event"; eventId: string }
  | { kind: "rule-create" }
  | { kind: "rule-edit"; ruleId: string };

type Props = {
  camera: Camera;
  rules: Rule[];
  tab: OpsTab;
  onTabChange: (tab: OpsTab) => void;
  onToggleRule: (rule: Rule) => Promise<void>;
  onCameraUpdated?: () => void;
  /** Reload rules after in-panel create/edit. */
  onDataChanged?: () => void;
};

function PanelBack({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="shrink-0 space-y-1" data-testid="ops-panel-back">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-8 items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        {t("back")}
      </button>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
    </div>
  );
}

export function CameraOpsPanel({
  camera,
  rules,
  tab,
  onTabChange,
  onToggleRule,
  onCameraUpdated,
  onDataChanged,
}: Props) {
  const { token } = useAuth();
  const { cameraName, ruleName, ruleNames, zoneName, lineName, refresh: refreshCatalog } = useCatalog();
  const { events } = useEvents();
  const virtualCam = isVirtualCamera(camera);
  const cameraEvents = useMemo(() => events.filter((e) => e.camera_id === camera.id), [events, camera.id]);
  const newEvents = cameraEvents.filter((e) => e.state === "new");
  const activeRules = rules.filter((r) => r.enabled);

  const [view, setView] = useState<PanelView>({ kind: "main" });
  const [editName, setEditName] = useState(camera.name);
  const [editLocation, setEditLocation] = useState(camera.location ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setEditName(camera.name);
    setEditLocation(camera.location ?? "");
    setSaveError(null);
  }, [camera.id, camera.name, camera.location]);

  useEffect(() => {
    setView({ kind: "main" });
  }, [camera.id, tab]);

  function goMain() {
    setView({ kind: "main" });
  }

  async function afterDataChange(nextTab?: OpsTab) {
    await Promise.all([onDataChanged?.(), refreshCatalog()]);
    if (nextTab) onTabChange(nextTab);
    goMain();
  }

  async function saveSettings() {
    if (!token) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.cameras.update(token, camera.id, {
        name: editName,
        location: editLocation || null,
      });
      onCameraUpdated?.();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("errorSave"));
    } finally {
      setSaving(false);
    }
  }

  const online = camera.enabled && camera.status === "online";

  if (view.kind === "event") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3" data-testid="ops-camera-panel" data-panel-view="event">
        <PanelBack title={t("eventDetail")} onBack={goMain} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
          <EventDetailView eventId={view.eventId} variant="panel" />
        </div>
      </div>
    );
  }

  if (view.kind === "rule-create" || view.kind === "rule-edit") {
    return (
      <div
        className="flex h-full min-h-0 flex-col"
        data-testid="ops-camera-panel"
        data-panel-view={view.kind}
      >
        <RuleWizard
          embedded
          mode={view.kind === "rule-edit" ? "edit" : "create"}
          ruleId={view.kind === "rule-edit" ? view.ruleId : undefined}
          presetCameraId={camera.id}
          onExit={goMain}
          onSaved={() => {
            void afterDataChange("rules");
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="ops-camera-panel" data-panel-view="main">
      <div className="shrink-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">{camera.name}</h2>
          <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                online ? "bg-success shadow-[0_0_6px_var(--color-success)]" : "bg-ink-faint"
              }`}
              aria-hidden
            />
            {camera.enabled ? cameraStatusHe(camera.status) : t("disabled")}
          </span>
          {virtualCam ? <Chip tone="dashed">{t("devSourceBadge")}</Chip> : null}
        </div>
        {camera.location ? <p className="text-sm text-ink-muted">{camera.location}</p> : null}
      </div>

      <div className="shrink-0">
        <Tabs
          items={OPS_TABS}
          value={tab}
          onChange={onTabChange}
          ariaLabel={t("cameraDetail")}
          size="sm"
          fullWidth
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
        {tab === "overview" ? (
          <div className="space-y-4" data-testid="camera-tab-overview">
            <div className="grid grid-cols-3 gap-2.5">
              <KpiCard size="lg" label={t("activeRulesCount")} value={activeRules.length} />
              <KpiCard size="lg" label={t("newEventsCount")} value={newEvents.length} />
              <KpiCard size="lg" label={t("eventsShort")} value={cameraEvents.length} />
            </div>
            <section>
              <SectionHeader
                title={t("recentEvents")}
                action={
                  <button
                    type="button"
                    className="text-xs text-ink-muted hover:text-ink"
                    onClick={() => onTabChange("events")}
                  >
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
                        onSelect={() => setView({ kind: "event", eventId: ev.id })}
                        cameraName={cameraName(ev.camera_id)}
                        variant="compact"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <Button className="w-full" onClick={() => setView({ kind: "rule-create" })}>
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("createRuleCta")}
            </Button>
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
                      onSelect={() => setView({ kind: "event", eventId: ev.id })}
                      cameraName={cameraName(ev.camera_id)}
                      ruleName={ruleName(ev.rule_id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "rules" ? (
          <div className="space-y-3" data-testid="camera-tab-rules">
            <Button variant="secondary" size="sm" onClick={() => setView({ kind: "rule-create" })}>
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("createRuleCta")}
            </Button>
            {rules.length === 0 ? (
              <EmptyBlock message={t("emptyRules")} />
            ) : (
              <ul className="space-y-3">
                {rules.map((rule) => (
                  <li key={rule.id}>
                    <RuleCard
                      rule={rule}
                      description={describeRule(rule, ruleNames)}
                      showCamera={false}
                      actions={
                        <>
                          <Button variant="secondary" size="sm" onClick={() => void onToggleRule(rule)}>
                            {rule.enabled ? t("disable") : t("enable")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setView({ kind: "rule-edit", ruleId: rule.id })}
                          >
                            {t("edit")}
                          </Button>
                        </>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "metrics" ? (
          <CameraMetricsPanel
            cameraId={camera.id}
            virtualCam={virtualCam}
            zoneName={zoneName}
            lineName={lineName}
          />
        ) : null}

        {tab === "settings" ? (
          <div className="space-y-4" data-testid="camera-tab-settings">
            <div className="glass space-y-3 rounded-lg p-4">
              <div>
                <label className="mb-1 block text-xs text-ink-muted">{t("cameraName")}</label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-muted">{t("cameraLocation")}</label>
                <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} />
              </div>
              {saveError ? <p className="text-sm text-danger">{saveError}</p> : null}
              <Button onClick={() => void saveSettings()} disabled={saving} className="w-full">
                {saving ? t("loading") : t("save")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
