"use client";

import { ArrowRight, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorBlock, LoadingBlock } from "@/components/ui/StateBlock";
import { RulePreviewBar, RulePreviewPanel } from "@/components/rules/wizard/RulePreview";
import { StepPlace } from "@/components/rules/wizard/StepPlace";
import { StepReview, SuccessScreen } from "@/components/rules/wizard/StepReview";
import { StepAction, StepCamera, StepCountMode, StepMethod, StepObject, StepTemplate } from "@/components/rules/wizard/steps-choose";
import { StepConditions, StepDetails, StepOutcome } from "@/components/rules/wizard/steps-details";
import { WizardContext, type WizardContextValue } from "@/components/rules/wizard/wizard-context";
import { api } from "@/lib/api";
import { defaultDirectionLabel, describeRule, whenWithCamera, type RuleNames } from "@/lib/rule-describe";
import { objectForClasses } from "@/lib/rule-wizard/config";
import {
  FULL_FRAME_PLACEHOLDER_ID,
  FULL_FRAME_POINTS,
  FULL_FRAME_ZONE_NAME,
  findFullFrameZone,
  isFullFrameZone,
  previewRule,
  ruleToWizard,
  suggestRuleName,
  wizardToRule,
} from "@/lib/rule-wizard/convert";
import { STEP_GROUPS, STEP_GROUP_OF, computeSteps, firstIncompleteStep, stepError } from "@/lib/rule-wizard/steps";
import { DEFAULT_WIZARD_STATE, type RuleWizardState, type StepGroup, type StepId } from "@/lib/rule-wizard/types";
import type { Camera, Line, Rule, Zone } from "@/lib/types";
import { useAuth } from "@/providers/AuthProvider";
import { useCatalog } from "@/providers/CatalogProvider";

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export type RuleWizardProps = {
  mode: "create" | "edit";
  ruleId?: string;
  /** Preselected camera (from a camera page or Video Lab). */
  presetCameraId?: string | null;
  /** Preselected object class (Video Lab "create rule from this track"). */
  presetObjectClass?: string | null;
  /** Where to return when the wizard was opened from Video Lab. */
  labReturnHref?: string | null;
  /** Render inside the ops panel (no full-page nav / compact chrome). */
  embedded?: boolean;
  /** Called instead of router navigation when exiting (embedded or override). */
  onExit?: () => void;
  /** After a successful save in embedded mode (success screen primary CTA). */
  onSaved?: () => void;
};

const STEP_COMPONENT: Record<Exclude<StepId, "review">, () => React.JSX.Element> = {
  camera: StepCamera,
  method: StepMethod,
  template: StepTemplate,
  action: StepAction,
  object: StepObject,
  count_mode: StepCountMode,
  place: StepPlace,
  details: StepDetails,
  conditions: StepConditions,
  outcome: StepOutcome,
};

export function RuleWizard({
  mode,
  ruleId,
  presetCameraId,
  presetObjectClass,
  labReturnHref,
  embedded = false,
  onExit,
  onSaved,
}: RuleWizardProps) {
  const { token, hub } = useAuth();
  const router = useRouter();
  const { refresh: refreshCatalog } = useCatalog();

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [state, setState] = useState<RuleWizardState>(DEFAULT_WIZARD_STATE);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ sentence: string; cameraId: string | null } | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);

  // ---- load
  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      try {
        const [cams, ruleList, rule] = await Promise.all([
          api.cameras.list(token),
          api.rules.list(token),
          mode === "edit" && ruleId ? api.rules.get(token, ruleId) : Promise.resolve(null),
        ]);
        const [zoneLists, lineLists] = await Promise.all([
          Promise.all(cams.map((c) => api.zones.listForCamera(token, c.id).catch(() => [] as Zone[]))),
          Promise.all(cams.map((c) => api.lines.listForCamera(token, c.id).catch(() => [] as Line[]))),
        ]);
        if (!active) return;
        const allZones = dedupeById(zoneLists.flat());
        setCameras(cams);
        setZones(allZones);
        setLines(dedupeById(lineLists.flat()));
        setRules(ruleList);
        if (rule) {
          const w = ruleToWizard(rule, { zones: allZones });
          setState(w);
          // Editing opens on the summary; every earlier step is one tap away in the progress bar.
          setStepIndex(Math.max(0, computeSteps(w).filter((s) => s !== "method").length - 1));
        } else {
          const presetObject = presetObjectClass ? objectForClasses([presetObjectClass]) : null;
          const cameraId = presetCameraId && cams.some((c) => c.id === presetCameraId) ? presetCameraId : null;
          setState({ ...DEFAULT_WIZARD_STATE, cameraId, object: presetObject });
          setStepIndex(cameraId ? 1 : 0);
        }
        setLoading(false);
      } catch (e) {
        if (!active) return;
        setLoadError(e instanceof Error ? e.message : "הטעינה נכשלה.");
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, mode, ruleId, presetCameraId, presetObjectClass]);

  // ---- names (same shape the rest of the app uses)
  const names = useMemo<RuleNames>(() => {
    const camMap = new Map(cameras.map((c) => [c.id, c.name]));
    const zoneMap = new Map(zones.map((z) => [z.id, z]));
    const lineMap = new Map(lines.map((l) => [l.id, l]));
    return {
      cameraName: (id) => (id ? camMap.get(id) ?? "—" : "—"),
      zoneName: (id) => (id ? zoneMap.get(id)?.name ?? "—" : "—"),
      lineName: (id) => (id ? lineMap.get(id)?.name ?? "—" : "—"),
      isFullFrameZone: (id) => id === FULL_FRAME_PLACEHOLDER_ID || (id ? isFullFrameZone(zoneMap.get(id)) : false),
      directionLabel: (lineId, dir) => {
        const ln = lineId ? lineMap.get(lineId) : undefined;
        if (dir === "a_to_b") return ln?.label_a_to_b || defaultDirectionLabel(dir);
        if (dir === "b_to_a") return ln?.label_b_to_a || defaultDirectionLabel(dir);
        return null;
      },
    };
  }, [cameras, zones, lines]);

  const update = useCallback((patch: Partial<RuleWizardState>) => {
    setError(null);
    setSaveErrors([]);
    setState((s) => ({ ...s, ...patch }));
  }, []);

  // Editing never asks "how to start" again — the rule already exists.
  const steps = useMemo(
    () => computeSteps(state).filter((s) => !(mode === "edit" && s === "method")),
    [state, mode],
  );
  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[safeIndex];
  const group: StepGroup = STEP_GROUP_OF[step];
  // All groups are shown up front so the user sees the whole journey; "הגדרה" disappears only once
  // it is known that the chosen rule needs no spatial / detail questions.
  const visibleGroups = STEP_GROUPS.filter(
    (g) => g.id !== "setup" || !state.action || steps.some((s) => STEP_GROUP_OF[s] === "setup"),
  );
  const groupIndex = visibleGroups.findIndex((g) => g.id === group);

  const choose = useCallback(
    (patch: Partial<RuleWizardState>) => {
      setError(null);
      setSaveErrors([]);
      const next = { ...state, ...patch };
      setState(next);
      const nextSteps = computeSteps(next).filter((st) => !(mode === "edit" && st === "method"));
      if (step && !stepError(next, step)) {
        const idx = nextSteps.indexOf(step);
        setStepIndex(Math.min((idx >= 0 ? idx : safeIndex) + 1, nextSteps.length - 1));
      }
    },
    [mode, state, step, safeIndex],
  );

  const notifyAvailable = hub?.features?.web_push === true || hub?.features?.push_notifications === true;

  const ctx: WizardContextValue = {
    state,
    update,
    choose,
    cameras,
    zones,
    lines,
    rules,
    names,
    addZone: (z) => setZones((prev) => (prev.some((x) => x.id === z.id) ? prev : [...prev, z])),
    addLine: (l) => setLines((prev) => (prev.some((x) => x.id === l.id) ? prev : [...prev, l])),
    notifyAvailable,
    isEdit: mode === "edit",
  };

  // ---- navigation
  function goNext() {
    const err = stepError(state, step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStepIndex(Math.min(safeIndex + 1, steps.length - 1));
  }

  function goBack() {
    setError(null);
    setSaveErrors([]);
    if (safeIndex === 0) {
      exit();
      return;
    }
    setStepIndex(safeIndex - 1);
  }

  function jumpToGroup(target: StepGroup) {
    const idx = steps.findIndex((s) => STEP_GROUP_OF[s] === target);
    if (idx >= 0 && idx <= safeIndex) setStepIndex(idx);
  }

  const exitHref = labReturnHref ?? (state.cameraId && mode === "create" ? `/?camera=${state.cameraId}&tab=rules` : "/rules");
  function exit() {
    if (onExit) {
      onExit();
      return;
    }
    router.push(exitHref);
  }
  function requestExit() {
    if (state.action && !saved) setConfirmExit(true);
    else exit();
  }

  // ---- save
  async function save() {
    if (!token) return;
    const incomplete = firstIncompleteStep(state);
    if (incomplete) {
      const idx = steps.indexOf(incomplete);
      setStepIndex(idx >= 0 ? idx : 0);
      setError(stepError(state, incomplete));
      return;
    }
    setSaving(true);
    setSaveErrors([]);
    try {
      let working = state;
      let effectiveNames = names;
      if (state.action === "detected" && state.cameraId) {
        let ff = findFullFrameZone(zones, state.cameraId);
        if (!ff) {
          ff = await api.zones.create(token, state.cameraId, {
            name: FULL_FRAME_ZONE_NAME,
            kind: "polygon",
            points: FULL_FRAME_POINTS,
            enabled: true,
          });
          setZones((prev) => (prev.some((x) => x.id === ff!.id) ? prev : [...prev, ff as Zone]));
        }
        const ffId = ff.id;
        working = { ...state, zoneId: ffId };
        // `names` is memoised from the previous render; make sure the fresh zone reads as full-frame.
        effectiveNames = { ...names, isFullFrameZone: (id) => id === ffId || Boolean(names.isFullFrameZone?.(id)) };
      }
      const name = working.name.trim() || suggestRuleName(working, effectiveNames) || "חוק חדש";
      const payload = wizardToRule(working, { name });
      const body = payload as unknown as Record<string, unknown>;
      const remote = await api.rules.validate(token, body);
      if (!remote.valid) {
        setSaveErrors(remote.errors);
        return;
      }
      const rule = mode === "edit" && ruleId ? await api.rules.update(token, ruleId, body) : await api.rules.create(token, body);
      await refreshCatalog();
      setState({ ...working, name });
      const d = describeRule(rule, effectiveNames);
      setSaved({
        sentence: `${whenWithCamera(d)}${d.schedule ? ` (${d.schedule})` : ""}`,
        cameraId: rule.conditions.camera_id ?? null,
      });
    } catch (e) {
      setSaveErrors([e instanceof Error ? e.message : "השמירה נכשלה."]);
    } finally {
      setSaving(false);
    }
  }

  function startAnother() {
    setSaved(null);
    setSaveErrors([]);
    setError(null);
    setState({ ...DEFAULT_WIZARD_STATE, cameraId: state.cameraId });
    setStepIndex(state.cameraId ? 1 : 0);
  }

  // ---- render
  if (loading) return <LoadingBlock />;
  if (loadError) return <ErrorBlock message={loadError} />;
  if (cameras.length === 0) {
    return (
      <ErrorBlock message="כדי ליצור חוק צריך קודם להוסיף מצלמה." onRetry={() => router.push("/cameras/new")} />
    );
  }

  const title = mode === "edit" ? "עריכת חוק" : "חוק חדש";
  const isReview = step === "review";
  const StepBody = isReview ? null : STEP_COMPONENT[step as Exclude<StepId, "review">];
  const previewAvailable = previewRule(state) != null;

  return (
    <WizardContext.Provider value={ctx}>
      <div
        className={embedded ? "flex h-full min-h-0 flex-col" : "flex min-h-dvh flex-col"}
        data-testid="rule-wizard"
        data-step={step}
        data-embedded={embedded ? "true" : undefined}
      >
        {/* top bar */}
        <header className={`z-20 shrink-0 border-b border-border glass ${embedded ? "" : "sticky top-0"}`}>
          <div className={`flex h-12 w-full items-center gap-2 ${embedded ? "px-1" : "mx-auto max-w-6xl px-4"}`}>
            <button
              type="button"
              onClick={requestExit}
              aria-label="יציאה"
              className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-muted hover:text-ink"
            >
              <X className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </button>
            <h1 className="text-base font-semibold text-ink">{title}</h1>
            {!saved && !embedded ? (
              <ol className="ms-auto hidden items-center gap-1 md:flex" aria-label="התקדמות">
                {visibleGroups.map((g, i) => {
                  const done = i < groupIndex;
                  const current = i === groupIndex;
                  return (
                    <li key={g.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => jumpToGroup(g.id)}
                        disabled={!done}
                        aria-current={current ? "step" : undefined}
                        className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs ${
                          current
                            ? "bg-accent-soft text-accent"
                            : done
                              ? "text-ink hover:bg-muted"
                              : "text-ink-faint"
                        } disabled:cursor-default`}
                      >
                        {done ? <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : null}
                        {g.label}
                      </button>
                      {i < visibleGroups.length - 1 ? <span className="text-ink-faint">›</span> : null}
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </div>
          {!saved ? (
            <div className={embedded ? "" : "md:hidden"}>
              <div className={`flex items-center justify-between pb-2 text-xs text-ink-muted ${embedded ? "px-1" : "px-4"}`}>
                <span>
                  שלב {groupIndex + 1} מתוך {visibleGroups.length} ·{" "}
                  <span className="text-ink">{visibleGroups[groupIndex]?.label}</span>
                </span>
                {groupIndex + 1 < visibleGroups.length ? <span>הבא: {visibleGroups[groupIndex + 1].label}</span> : null}
              </div>
              <div className="h-0.5 w-full bg-muted">
                <div
                  className="h-0.5 bg-accent transition-all"
                  style={{ width: `${((groupIndex + 1) / visibleGroups.length) * 100}%` }}
                />
              </div>
            </div>
          ) : null}
          {!saved && previewAvailable && !isReview ? <RulePreviewBar /> : null}
        </header>

        {/* body */}
        <div
          className={`min-h-0 flex-1 overflow-y-auto ${
            embedded ? "px-1 pb-4 pt-3" : "mx-auto w-full max-w-6xl px-4 pb-8 pt-5"
          }`}
        >
          {saved ? (
            <SuccessScreen
              sentence={saved.sentence}
              cameraId={saved.cameraId}
              onAnother={startAnother}
              labHref={labReturnHref ?? null}
              onDone={onSaved ?? onExit}
            />
          ) : (
            <div className={embedded ? "space-y-5" : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"}>
              <div className="min-w-0 space-y-5">
                {isReview ? <StepReview errors={saveErrors} /> : StepBody ? <StepBody /> : null}
                {error ? (
                  <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink" role="alert" data-testid="wizard-step-error">
                    {error}
                  </p>
                ) : null}
              </div>
              {!embedded && !isReview ? <RulePreviewPanel /> : null}
            </div>
          )}
        </div>

        {/* bottom actions */}
        {!saved ? (
          <footer className={`z-20 shrink-0 border-t border-border glass ${embedded ? "" : "sticky bottom-0"}`}>
            <div
              className={`flex w-full items-center justify-between gap-3 py-3 ${
                embedded ? "px-1" : "mx-auto max-w-6xl px-4"
              }`}
            >
              <Button variant="ghost" onClick={goBack}>
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                {safeIndex === 0 ? "ביטול" : isReview ? "חזור לעריכה" : "חזרה"}
              </Button>
              {isReview ? (
                <Button onClick={() => void save()} disabled={saving} data-testid="wizard-save">
                  {saving ? "שומר…" : mode === "edit" ? "שמור שינויים" : "שמור והפעל"}
                </Button>
              ) : (
                <Button onClick={goNext} data-testid="wizard-next">
                  המשך
                </Button>
              )}
            </div>
          </footer>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmExit}
        title="לצאת בלי לשמור?"
        description="ההגדרות שבחרתם עד עכשיו לא יישמרו."
        confirmLabel="צא"
        onConfirm={() => {
          setConfirmExit(false);
          exit();
        }}
        onCancel={() => setConfirmExit(false)}
      />
    </WizardContext.Provider>
  );
}
