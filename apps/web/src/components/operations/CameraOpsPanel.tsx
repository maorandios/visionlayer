"use client";

import { ArrowRight, MoreVertical } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityPanel } from "@/components/operations/ActivityPanel";
import { CameraAiTestBar } from "@/components/operations/CameraAiTestBar";
import { EventDetailView } from "@/components/events/EventDetailView";
import { EventTimeline } from "@/components/events/EventTimeline";
import { RulesList } from "@/components/rules/RulesList";
import { RuleWizard } from "@/components/rules/wizard/RuleWizard";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { t } from "@/i18n/he";
import { api } from "@/lib/api";
import { cameraCapabilities } from "@/lib/camera-capabilities";
import { scopeEventsToRun } from "@/lib/events-run-scope";
import { cameraStatusHe } from "@/lib/format";
import type { OpsTab } from "@/components/operations/ops-url";
import { OPS_TABS } from "@/components/operations/ops-url";
import type { Camera, CameraAiTestStatus, Line, Rule, Zone } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { isVirtualCamera, useCatalog } from "@/providers/CatalogProvider";
import { useEvents } from "@/providers/EventsProvider";
import { useToast } from "@/providers/ToastProvider";

type PanelView =
  | { kind: "main" }
  | { kind: "event"; eventId: string }
  | { kind: "rule-create" }
  | { kind: "rule-edit"; ruleId: string }
  | { kind: "settings" };

type Props = {
  camera: Camera;
  zones: Zone[];
  lines: Line[];
  rules: Rule[];
  tab: OpsTab;
  onTabChange: (tab: OpsTab) => void;
  /** Patch only the given Rule id — must not flip sibling Rules. */
  onToggleRule: (ruleId: string, enabled: boolean) => Promise<void>;
  onCameraUpdated?: () => void;
  onDataChanged?: () => void;
};

function PanelBack({
  title,
  onBack,
  backLabel,
}: {
  title?: string;
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <div className="shrink-0 space-y-1" data-testid="ops-panel-back">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-8 items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        {backLabel ?? t("back")}
      </button>
      {title ? <h2 className="text-base font-semibold text-ink">{title}</h2> : null}
    </div>
  );
}

export function CameraOpsPanel({
  camera,
  zones,
  lines,
  rules,
  tab,
  onTabChange,
  onToggleRule,
  onCameraUpdated,
  onDataChanged,
}: Props) {
  const router = useRouter();
  const { token } = useAuth();
  const { ruleName, ruleNames, zoneName, refresh: refreshCatalog } = useCatalog();
  const { events, refresh: refreshEvents } = useEvents();
  const { showToast } = useToast();
  const virtualCam = isVirtualCamera(camera);
  const caps = cameraCapabilities(camera);
  const [aiStatus, setAiStatus] = useState<CameraAiTestStatus | null>(null);
  const [aiRefreshKey, setAiRefreshKey] = useState(0);
  const latestRunId = aiStatus?.latest_successful_run?.id ?? null;

  const cameraEvents = useMemo(() => {
    const forCam = events.filter((e) => e.camera_id === camera.id);
    if (!caps.supportsManualAnalysis) return forCam;
    // Same authoritative latest_successful_run concept as global Events.
    return scopeEventsToRun(forCam, camera.id, latestRunId);
  }, [events, camera.id, caps.supportsManualAnalysis, latestRunId]);

  const [view, setView] = useState<PanelView>({ kind: "main" });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [editName, setEditName] = useState(camera.name);
  const [editLocation, setEditLocation] = useState(camera.location ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingDeleteRule, setPendingDeleteRule] = useState<Rule | null>(null);
  const [busy, setBusy] = useState(false);
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);

  useEffect(() => {
    setEditName(camera.name);
    setEditLocation(camera.location ?? "");
    setSaveError(null);
  }, [camera.id, camera.name, camera.location]);

  useEffect(() => {
    setView({ kind: "main" });
    setMenuOpen(false);
  }, [camera.id, tab]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

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
      goMain();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("errorSave"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled() {
    if (!token) return;
    setBusy(true);
    try {
      if (camera.enabled) await api.cameras.disable(token, camera.id);
      else await api.cameras.enable(token, camera.id);
      onCameraUpdated?.();
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  async function deleteCamera() {
    if (!token) return;
    setBusy(true);
    try {
      await api.cameras.delete(token, camera.id);
      router.replace("/");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  async function toggleRuleRow(ruleId: string, enabled: boolean) {
    if (!token) return;
    setTogglingRuleId(ruleId);
    try {
      await onToggleRule(ruleId, enabled);
      showToast(enabled ? t("ruleEnabledToast") : t("ruleDisabledToast"), 2200);
    } catch {
      showToast(t("ruleToggleErrorToast"), 2800);
    } finally {
      setTogglingRuleId(null);
    }
  }

  async function deleteRuleConfirm() {
    if (!token || !pendingDeleteRule) return;
    setBusy(true);
    try {
      await api.rules.delete(token, pendingDeleteRule.id);
      showToast(t("ruleDeletedToast"), 2200);
      setPendingDeleteRule(null);
      await afterDataChange("rules");
    } finally {
      setBusy(false);
    }
  }

  const online = camera.enabled && camera.status === "online";

  if (view.kind === "event") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3" data-testid="ops-camera-panel" data-panel-view="event">
        <PanelBack backLabel={t("backToEvents")} onBack={goMain} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
          <EventDetailView eventId={view.eventId} variant="panel" />
        </div>
      </div>
    );
  }

  if (view.kind === "rule-create" || view.kind === "rule-edit") {
    return (
      <div className="flex h-full min-h-0 flex-col" data-testid="ops-camera-panel" data-panel-view={view.kind}>
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

  if (view.kind === "settings") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3" data-testid="ops-camera-panel" data-panel-view="settings">
        <PanelBack title={t("cameraSettings")} onBack={goMain} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
          <div className="glass space-y-3 rounded-lg p-4" data-testid="camera-tab-settings">
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
          {caps.isTestSource ? <Chip tone="dashed">{t("testSourceBadge")}</Chip> : null}
          <div className="relative ms-auto" ref={menuRef}>
            <button
              type="button"
              aria-label={t("cameraMenu")}
              aria-expanded={menuOpen}
              data-testid="camera-overflow-menu"
              className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-white/5 hover:text-ink"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MoreVertical className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </button>
            {menuOpen ? (
              <div className="glass-strong absolute end-0 top-9 z-20 min-w-[11rem] rounded-lg py-1 shadow-float">
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-start text-sm text-ink hover:bg-white/5"
                  onClick={() => {
                    setMenuOpen(false);
                    setView({ kind: "settings" });
                  }}
                >
                  {t("editCameraName")}
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-start text-sm text-ink hover:bg-white/5"
                  disabled={busy}
                  onClick={() => void toggleEnabled()}
                >
                  {camera.enabled ? t("disableCamera") : t("enableCamera")}
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-start text-sm text-danger hover:bg-white/5"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                >
                  {t("deleteCamera")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {camera.location ? <p className="text-sm text-ink-muted">{camera.location}</p> : null}
      </div>

      {caps.supportsManualAnalysis ? (
        <div className="shrink-0">
          <CameraAiTestBar
            cameraId={camera.id}
            onNeedMetric={() => onTabChange("activity")}
            onNeedRule={() => setView({ kind: "rule-create" })}
            onStatus={setAiStatus}
            onRunComplete={() => {
              setAiRefreshKey((k) => k + 1);
              void refreshEvents();
              void onDataChanged?.();
            }}
          />
        </div>
      ) : null}

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
        {tab === "activity" ? (
          <ActivityPanel
            key={`activity-${latestRunId ?? "none"}-${aiRefreshKey}`}
            cameraId={camera.id}
            virtualCam={virtualCam}
            zones={zones}
            lines={lines}
            zoneName={zoneName}
            onCatalogRefresh={() => void refreshCatalog()}
            analysisRunId={caps.supportsManualAnalysis ? latestRunId : null}
            awaitingAiTest={caps.supportsManualAnalysis && !latestRunId}
          />
        ) : null}

        {tab === "events" ? (
          <div className="space-y-3" data-testid="camera-tab-events">
            <EventTimeline
              key={`events-${latestRunId ?? "none"}-${aiRefreshKey}`}
              events={cameraEvents}
              emptyMessage={
                caps.supportsManualAnalysis && !latestRunId
                  ? t("aiTestEventsEmpty")
                  : caps.supportsManualAnalysis && latestRunId
                    ? t("aiTestEventsNoneThisRun")
                    : t("noEventsForCamera")
              }
              emptyHint={
                caps.supportsManualAnalysis && !latestRunId
                  ? t("aiTestActivityEmptyHint")
                  : t("eventsEmptyHintCamera")
              }
              emptyAction={
                <Button variant="secondary" size="sm" onClick={() => onTabChange("rules")}>
                  {t("goToRules")}
                </Button>
              }
              ruleName={ruleName}
              onSelect={(eventId) => setView({ kind: "event", eventId })}
            />
          </div>
        ) : null}

        {tab === "rules" ? (
          <RulesList
            rules={rules}
            names={ruleNames}
            onCreate={() => setView({ kind: "rule-create" })}
            onOpen={(ruleId) => setView({ kind: "rule-edit", ruleId })}
            onEdit={(ruleId) => setView({ kind: "rule-edit", ruleId })}
            onToggle={(ruleId, enabled) => void toggleRuleRow(ruleId, enabled)}
            onDelete={(ruleId) => {
              const found = rules.find((r) => r.id === ruleId) ?? null;
              setPendingDeleteRule(found);
            }}
            togglingId={togglingRuleId}
          />
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t("deleteCamera")}
        description={t("deleteCameraConfirm")}
        confirmLabel={t("delete")}
        onConfirm={() => void deleteCamera()}
        onCancel={() => setConfirmDelete(false)}
        busy={busy}
      />
      <ConfirmDialog
        open={pendingDeleteRule !== null}
        title={t("deleteRule")}
        description={
          pendingDeleteRule ? `${pendingDeleteRule.name} — ${t("ruleDeleteConfirm")}` : undefined
        }
        confirmLabel={t("delete")}
        onConfirm={() => void deleteRuleConfirm()}
        onCancel={() => setPendingDeleteRule(null)}
        busy={busy}
      />
    </div>
  );
}
