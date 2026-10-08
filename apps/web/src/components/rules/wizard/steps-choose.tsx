"use client";

import {
  ArrowLeftRight,
  Bike,
  Bus,
  Car,
  Hash,
  LogIn,
  LogOut,
  MapPin,
  ScanEye,
  Timer,
  Truck,
  User,
  type LucideIcon,
} from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { CameraSnapshot } from "@/components/rules/wizard/CameraSnapshot";
import { ChoiceCard } from "@/components/rules/wizard/ChoiceCard";
import { StepTitle, useWizard } from "@/components/rules/wizard/wizard-context";
import {
  COUNT_MODES,
  OBJECT_BY_ID,
  availableActions,
  availableObjects,
  isCombinationSupported,
  isObjectSupported,
  spatialRequirement,
} from "@/lib/rule-wizard/config";
import type { WizardActionId, WizardObjectId } from "@/lib/rule-wizard/types";
import { isVirtualCamera } from "@/providers/CatalogProvider";

export const ICONS: Record<string, LucideIcon> = {
  ScanEye,
  LogIn,
  LogOut,
  MapPin,
  Timer,
  ArrowLeftRight,
  Hash,
  User,
  Car,
  Truck,
  Bike,
  Bus,
};

// ---------------------------------------------------------------------------
// Camera (only when not camera-scoped)
// ---------------------------------------------------------------------------

export function StepCamera() {
  const { state, choose, cameras, rules } = useWizard();
  const ordered = [...cameras.filter((c) => !isVirtualCamera(c)), ...cameras.filter((c) => isVirtualCamera(c))];
  return (
    <div className="space-y-4">
      <StepTitle title="איזו מצלמה?" hint="החוק יפעל על המצלמה שתבחרו." />
      <ul className="grid gap-3 sm:grid-cols-2" data-testid="wizard-camera-list">
        {ordered.map((cam) => {
          const selected = state.cameraId === cam.id;
          const count = rules.filter((r) => r.conditions.camera_id === cam.id).length;
          const virtual = isVirtualCamera(cam);
          return (
            <li key={cam.id}>
              <button
                type="button"
                aria-pressed={selected}
                data-testid="wizard-camera-card"
                onClick={() =>
                  choose({
                    cameraId: cam.id,
                    zoneId: state.cameraId === cam.id ? state.zoneId : null,
                    lineId: state.cameraId === cam.id ? state.lineId : null,
                  })
                }
                className={`w-full overflow-hidden rounded-lg border text-start transition ${
                  selected ? "border-accent ring-accent" : "border-border hover:border-border-strong"
                } ${virtual ? "border-dashed" : ""}`}
              >
                <CameraSnapshot cameraId={cam.id} rounded="rounded-none" className="border-0" />
                <div className="space-y-1 bg-surface p-3">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-ink">{cam.name}</p>
                    <Chip tone={cam.enabled ? "success" : "outline"}>{cam.enabled ? "פעילה" : "כבויה"}</Chip>
                    {virtual ? <Chip tone="dashed">וידאו לבדיקה</Chip> : null}
                  </div>
                  <p className="text-xs text-ink-muted">
                    {cam.location ?? "ללא מיקום"} · {count === 0 ? "אין חוקים" : count === 1 ? "חוק אחד" : `${count} חוקים`}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Object — מה נרצה לזהות?
// ---------------------------------------------------------------------------

export function StepObject() {
  const { state, choose } = useWizard();
  const available = new Set(availableObjects(null).map((o) => o.id));
  const pick = (id: WizardObjectId) =>
    choose({
      object: id,
      // Changing object may invalidate an unsupported action combo.
      action: state.action && isCombinationSupported(state.action, id) ? state.action : null,
      legacy: state.legacy ? { ...state.legacy, objectClasses: null } : null,
    });
  return (
    <div className="space-y-4" data-testid="wizard-step-object">
      <StepTitle title="מה נרצה לזהות?" />
      {state.legacy?.objectClasses?.length ? (
        <p className="rounded-xl border border-dashed border-border bg-muted px-3 py-2 text-xs text-ink-muted">
          לחוק זה הוגדר סוג אובייקט שאינו מופיע כאן; הוא יישמר כפי שהוא אלא אם תבחרו סוג אחר.
        </p>
      ) : null}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="wizard-object-list">
        {availableObjects(null).map((o) => {
          const ok = available.has(o.id);
          return (
            <li key={o.id}>
              <ChoiceCard
                icon={ICONS[o.icon]}
                title={o.label}
                selected={state.object === o.id}
                disabled={!ok}
                unavailableNote={ok ? undefined : "לא נתמך במצלמה זו"}
                onClick={() => pick(o.id)}
                testId={`wizard-object-${o.id}`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Action — מה צריך לקרות?
// ---------------------------------------------------------------------------

export function StepAction() {
  const { state, choose } = useWizard();
  const pick = (id: WizardActionId) => {
    const nextSpatial = spatialRequirement(id, id === "count" ? state.countMode : null);
    const prevSpatial = spatialRequirement(state.action, state.countMode);
    choose({
      action: id,
      zoneId: nextSpatial === "zone" && prevSpatial === "zone" ? state.zoneId : null,
      lineId: nextSpatial === "line" && prevSpatial === "line" ? state.lineId : null,
      countMode: id === "count" ? state.countMode : null,
      object: state.object && isObjectSupported(state.object) ? state.object : state.object,
    });
  };
  const actions = availableActions().filter(
    (a) => !state.object || isCombinationSupported(a.id, state.object),
  );
  return (
    <div className="space-y-4" data-testid="wizard-step-action">
      <StepTitle title="מה צריך לקרות?" />
      <ul className="grid gap-2 sm:grid-cols-2">
        {actions.map((a) => (
          <li key={a.id}>
            <ChoiceCard
              icon={ICONS[a.icon]}
              title={a.label}
              selected={state.action === a.id}
              onClick={() => pick(a.id)}
              testId={`wizard-action-${a.id}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Count mode — איפה לספור?
// ---------------------------------------------------------------------------

export function StepCountMode() {
  const { state, choose } = useWizard();
  return (
    <div className="space-y-4" data-testid="wizard-step-count-mode">
      <StepTitle title={state.object ? `איפה לספור ${OBJECT_BY_ID[state.object].plural}?` : "איפה לספור?"} />
      <ul className="grid gap-2 md:grid-cols-2">
        {COUNT_MODES.map((m) => (
          <li key={m.id}>
            <ChoiceCard
              icon={m.id === "line" ? ArrowLeftRight : m.id === "zone_exit" ? LogOut : LogIn}
              title={m.label}
              description={m.description}
              selected={state.countMode === m.id}
              onClick={() =>
                choose({
                  countMode: m.id,
                  zoneId: m.id === "line" ? null : state.zoneId,
                  lineId: m.id === "line" ? state.lineId : null,
                })
              }
              testId={`wizard-count-mode-${m.id}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
