"use client";

import { ArrowRight, Check, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LineMetricSetup } from "@/components/metrics/LineMetricSetup";
import { ChoiceCard } from "@/components/rules/wizard/ChoiceCard";
import { CameraSnapshot, useSnapshotUrl } from "@/components/rules/wizard/CameraSnapshot";
import { PolygonEditor } from "@/components/zones/PolygonEditor";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorBlock } from "@/components/ui/StateBlock";
import { api } from "@/lib/api";
import { modeFromMetricType } from "@/lib/line-direction";
import { suggestMetricName, summarizeMetric } from "@/lib/metric-wizard/name";
import { applyMetricTypeDefaults, computeMetricSteps } from "@/lib/metric-wizard/steps";
import {
  DEFAULT_METRIC_WIZARD,
  type MetricDefinition,
  type MetricDirection,
  type MetricWizardState,
  type MetricWizardStep,
} from "@/lib/metric-wizard/types";
import { canAdvance, metricWizardErrors } from "@/lib/metric-wizard/validate";
import type { Point } from "@/lib/polygon";
import type { Line, Zone } from "@/lib/types";
import {
  METRIC_TYPES,
  OBJECT_TYPES,
  OBJECT_TYPE_LABELS,
  metricTypeConfig,
  type MetricDefType,
  type VisionObjectType,
} from "@/lib/vision-capabilities";
import { useAuth } from "@/providers/AuthProvider";

type Props = {
  cameraId: string;
  mode?: "create" | "edit";
  initial?: MetricDefinition | null;
  zones: Zone[];
  lines: Line[];
  onExit: () => void;
  onSaved: (def: MetricDefinition) => void;
  onSpatialCreated?: () => void;
};

function directionLabel(metricType: MetricDefType | null, dir: MetricDirection | null): string | null {
  if (!dir) return null;
  if (dir === "any") return "שני הכיוונים";
  if (metricType === "entries") return "כיוון כניסה";
  if (metricType === "exits") return "כיוון יציאה";
  return "כיוון אחד";
}

function contextTitle(metricType: MetricDefType, objectType: VisionObjectType): string {
  return suggestMetricName({ metricType, objectType });
}

export function MetricWizard({
  cameraId,
  mode = "create",
  initial = null,
  zones,
  lines,
  onExit,
  onSaved,
  onSpatialCreated,
}: Props) {
  const { token } = useAuth();
  const [state, setState] = useState<MetricWizardState>(() => {
    if (initial) {
      return {
        metricType: initial.metric_type,
        objectType: initial.object_type,
        scopeType: initial.scope_type,
        zoneId: initial.zone_id,
        lineId: initial.line_id,
        direction: initial.direction,
        name: initial.name,
      };
    }
    return { ...DEFAULT_METRIC_WIZARD };
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [drawMode, setDrawMode] = useState<"zone" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localZones, setLocalZones] = useState(zones);
  const [localLines, setLocalLines] = useState(lines);

  useEffect(() => {
    setLocalZones(zones);
  }, [zones]);
  useEffect(() => {
    setLocalLines(lines);
  }, [lines]);

  const steps = useMemo(() => computeMetricSteps(state), [state]);
  const step: MetricWizardStep = drawMode === "zone" ? "draw-zone" : steps[stepIndex] ?? "type";

  const camZones = useMemo(
    () => localZones.filter((z) => z.camera_id === cameraId && z.enabled),
    [localZones, cameraId],
  );
  const camLines = useMemo(
    () => localLines.filter((l) => l.camera_id === cameraId && l.enabled),
    [localLines, cameraId],
  );

  const selectedLine = camLines.find((l) => l.id === state.lineId);
  const selectedZone = camZones.find((z) => z.id === state.zoneId);
  const placeName = selectedZone?.name ?? selectedLine?.name ?? null;
  const dirLabel = directionLabel(state.metricType, state.direction);
  const isLineMetric =
    state.metricType === "entries" ||
    state.metricType === "exits" ||
    state.metricType === "line_crossings";

  // Refresh auto-name when entering summary (create) or when place/direction changes before user edits.
  useEffect(() => {
    if (step !== "summary" || !state.metricType || !state.objectType) return;
    if (mode === "edit" && initial?.name) return;
    const auto = suggestMetricName({
      metricType: state.metricType,
      objectType: state.objectType,
      placeName: state.scopeType === "camera" ? null : placeName,
      directionLabel: dirLabel,
    });
    setState((s) => ({ ...s, name: auto }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when arriving at summary
  }, [step, placeName, dirLabel, state.metricType, state.objectType, state.scopeType]);

  function patch(p: Partial<MetricWizardState>) {
    setState((s) => ({ ...s, ...p }));
    setError(null);
  }

  function goNext() {
    if (!canAdvance(step, state)) return;
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function goBack() {
    if (drawMode) {
      setDrawMode(null);
      return;
    }
    if (stepIndex === 0) onExit();
    else setStepIndex((i) => Math.max(0, i - 1));
  }

  async function save() {
    if (!token || !state.metricType || !state.objectType) return;
    const errs = metricWizardErrors(state);
    if (errs.length) {
      setError(errs[0] ?? null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: state.name.trim(),
        metric_type: state.metricType,
        object_type: state.objectType,
        scope_type: state.scopeType,
        zone_id: state.zoneId,
        line_id: state.lineId,
        direction: state.direction,
        enabled: true,
      };
      const def =
        mode === "edit" && initial
          ? await api.metricDefinitions.update(token, initial.id, payload)
          : await api.metricDefinitions.create(token, cameraId, payload);
      onSaved(def);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שמירת המדד נכשלה");
    } finally {
      setSaving(false);
    }
  }

  const progress = drawMode ? 0.85 : (stepIndex + 1) / steps.length;

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-3"
      data-testid="metric-wizard"
      data-mode={mode}
      data-step={step}
    >
      <header className="glass shrink-0 space-y-2 rounded-lg p-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex min-h-8 items-center gap-1 text-sm text-ink-muted hover:text-ink"
          >
            <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {stepIndex === 0 && !drawMode ? "ביטול" : "חזרה"}
          </button>
          <button type="button" aria-label="סגור" onClick={onExit} className="text-ink-muted hover:text-ink">
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
        {step === "type" ? (
          <StepType
            selected={state.metricType}
            onPick={(id) => {
              patch(applyMetricTypeDefaults(id, state));
              setStepIndex(1);
            }}
          />
        ) : null}

        {step === "object" ? (
          <StepObject
            selected={state.objectType}
            onPick={(id) => {
              patch({ objectType: id });
              setTimeout(() => setStepIndex((i) => i + 1), 0);
            }}
          />
        ) : null}

        {step === "place" && state.metricType && isLineMetric && state.objectType ? (
          <LineMetricSetup
            mode={modeFromMetricType(state.metricType as "entries" | "exits" | "line_crossings")}
            cameraId={cameraId}
            objectType={state.objectType}
            contextTitle={contextTitle(state.metricType, state.objectType)}
            existingLines={camLines}
            initialLineId={state.lineId}
            initialDirection={state.direction}
            onCancel={() => setStepIndex((i) => Math.max(0, i - 1))}
            onComplete={(result) => {
              setLocalLines((prev) =>
                prev.some((l) => l.id === result.line.id) ? prev : [...prev, result.line],
              );
              patch({
                lineId: result.lineId,
                direction: result.direction,
                scopeType: "line",
              });
              if (result.created) onSpatialCreated?.();
              setStepIndex((i) => Math.min(i + 1, steps.length - 1));
            }}
          />
        ) : null}

        {step === "place" && state.metricType && !isLineMetric ? (
          <StepPlace
            metricType={state.metricType}
            scopeType={state.scopeType}
            zoneId={state.zoneId}
            zones={camZones}
            onScope={(scopeType) => patch({ scopeType, zoneId: scopeType === "camera" ? null : state.zoneId })}
            onPickZone={(id) => patch({ zoneId: id, scopeType: "zone" })}
            onCreateZone={() => setDrawMode("zone")}
          />
        ) : null}

        {step === "summary" && state.metricType && state.objectType ? (
          <StepSummary
            state={state}
            placeName={state.scopeType === "camera" ? null : placeName}
            directionLabel={dirLabel}
            onName={(name) => patch({ name })}
          />
        ) : null}

        {step === "draw-zone" ? (
          <MetricZoneCreator
            cameraId={cameraId}
            onCancel={() => setDrawMode(null)}
            onCreated={(zone) => {
              setLocalZones((z) => [...z, zone]);
              patch({ zoneId: zone.id, scopeType: "zone" });
              setDrawMode(null);
              onSpatialCreated?.();
            }}
          />
        ) : null}

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </div>

      {!drawMode &&
      step !== "type" &&
      step !== "object" &&
      !(step === "place" && isLineMetric) ? (
        <footer className="glass sticky bottom-0 shrink-0 flex gap-2 rounded-lg p-3">
          {step === "summary" ? (
            <>
              <Button variant="ghost" className="flex-1" onClick={() => setStepIndex(0)}>
                חזרה לעריכה
              </Button>
              <Button className="flex-1" onClick={() => void save()} disabled={saving}>
                <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
                {saving ? "שומר…" : mode === "edit" ? "שמור מדד" : "צור מדד"}
              </Button>
            </>
          ) : (
            <Button className="w-full" onClick={goNext} disabled={!canAdvance(step, state)}>
              המשך
            </Button>
          )}
        </footer>
      ) : null}
    </div>
  );
}

function StepTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 space-y-1">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {hint ? <p className="text-sm text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function StepType({
  selected,
  onPick,
}: {
  selected: MetricDefType | null;
  onPick: (id: MetricDefType) => void;
}) {
  return (
    <div data-testid="metric-wizard-type">
      <StepTitle title="מה תרצה למדוד?" hint="בחרו סוג מדידה נתמך — לא תיאור חופשי." />
      <ul className="grid gap-2 sm:grid-cols-2">
        {METRIC_TYPES.map((m) => (
          <li key={m.id}>
            <ChoiceCard
              title={m.label}
              description={m.description}
              selected={selected === m.id}
              onClick={() => onPick(m.id)}
              testId={`metric-type-${m.id}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepObject({
  selected,
  onPick,
}: {
  selected: VisionObjectType | null;
  onPick: (id: VisionObjectType) => void;
}) {
  return (
    <div data-testid="metric-wizard-object">
      <StepTitle title="איזה סוג אובייקט?" hint="רק סוגי אובייקט שהמערכת יודעת לזהות." />
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {OBJECT_TYPES.map((id) => (
          <li key={id}>
            <ChoiceCard
              title={OBJECT_TYPE_LABELS[id]}
              selected={selected === id}
              onClick={() => onPick(id)}
              testId={`metric-object-${id}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepPlace({
  metricType,
  scopeType,
  zoneId,
  zones,
  onScope,
  onPickZone,
  onCreateZone,
}: {
  metricType: MetricDefType;
  scopeType: string;
  zoneId: string | null;
  zones: Zone[];
  onScope: (s: "camera" | "zone") => void;
  onPickZone: (id: string) => void;
  onCreateZone: () => void;
}) {
  const cfg = metricTypeConfig(metricType);

  if (cfg.spatial === "optional_zone") {
    return (
      <div data-testid="metric-wizard-place">
        <StepTitle title="איפה למדוד?" />
        <ul className="space-y-2">
          <li>
            <ChoiceCard
              title="כל שדה הראייה"
              description="כל המצלמה"
              selected={scopeType === "camera"}
              onClick={() => onScope("camera")}
            />
          </li>
          <li>
            <ChoiceCard
              title="אזור מסוים"
              selected={scopeType === "zone"}
              onClick={() => onScope("zone")}
            />
          </li>
        </ul>
        {scopeType === "zone" ? (
          <div className="mt-4 space-y-2">
            <ZoneList zones={zones} selected={zoneId} onPick={onPickZone} onCreate={onCreateZone} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid="metric-wizard-place">
      <StepTitle title="איזה אזור נרצה למדוד?" hint="בחרו אזור קיים או סמנו אזור חדש." />
      <ZoneList zones={zones} selected={zoneId} onPick={onPickZone} onCreate={onCreateZone} />
    </div>
  );
}

function ZoneList({
  zones,
  selected,
  onPick,
  onCreate,
}: {
  zones: Zone[];
  selected: string | null;
  onPick: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {zones.map((z) => (
        <li key={z.id}>
          <button
            type="button"
            onClick={() => onPick(z.id)}
            className={`w-full overflow-hidden rounded-lg border text-start ${
              selected === z.id ? "border-accent" : "border-border"
            }`}
          >
            <CameraSnapshot cameraId={z.camera_id} zone={z} rounded="rounded-none" className="border-0" />
            <div className="bg-black/30 px-3 py-2 text-sm font-medium text-ink">{z.name}</div>
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={onCreate}
          data-testid="metric-create-zone"
          className="flex min-h-[6.5rem] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-ink-muted hover:border-accent/50"
        >
          <Plus className="h-5 w-5" />
          צור אזור חדש
        </button>
      </li>
    </ul>
  );
}

function StepSummary({
  state,
  placeName,
  directionLabel,
  onName,
}: {
  state: MetricWizardState;
  placeName: string | null;
  directionLabel: string | null;
  onName: (n: string) => void;
}) {
  if (!state.metricType || !state.objectType) return null;
  const summary = summarizeMetric({
    metricType: state.metricType,
    objectType: state.objectType,
    placeName,
    directionLabel,
    name: state.name,
  });

  return (
    <div className="space-y-4" data-testid="metric-wizard-summary">
      <StepTitle title="סיכום" hint="בדקו שהמדד מתאר בדיוק מה תרצו למדוד." />
      <div className="glass space-y-2 rounded-lg p-4">
        <p className="text-lg font-semibold text-ink">{summary.title}</p>
        <p className="text-sm text-ink-muted">{summary.body}</p>
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">שם המדד</label>
        <Input value={state.name} onChange={(e) => onName(e.target.value)} />
      </div>
    </div>
  );
}

function MetricZoneCreator({
  cameraId,
  onCreated,
  onCancel,
}: {
  cameraId: string;
  onCreated: (z: Zone) => void;
  onCancel: () => void;
}) {
  const { token } = useAuth();
  const bg = useSnapshotUrl(cameraId);
  const [name, setName] = useState("");
  const [points, setPoints] = useState<Point[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token) return;
    if (points.length < 3) {
      setError("סמנו לפחות 3 נקודות");
      return;
    }
    if (!name.trim()) {
      setError("תנו לאזור שם");
      return;
    }
    setSaving(true);
    try {
      const zone = await api.zones.create(token, cameraId, {
        name: name.trim(),
        kind: "polygon",
        points,
        enabled: true,
      });
      onCreated(zone);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="metric-wizard-draw-zone">
      <StepTitle title="סמנו את האזור על התמונה" />
      <PolygonEditor points={points} onChange={setPoints} backgroundImageUrl={bg ?? null} />
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='למשל "לובי"' />
      {error ? <ErrorBlock message={error} /> : null}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>
          ביטול
        </Button>
        <Button className="flex-1" onClick={() => void save()} disabled={saving}>
          שמור אזור והמשך
        </Button>
      </div>
    </div>
  );
}

