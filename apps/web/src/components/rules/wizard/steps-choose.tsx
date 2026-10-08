"use client";

import {
  ArrowLeftRight,
  Bike,
  Bus,
  Car,
  Hash,
  LayoutTemplate,
  LogIn,
  LogOut,
  MapPin,
  Moon,
  PencilRuler,
  ScanEye,
  ShieldAlert,
  Timer,
  Truck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { CameraSnapshot } from "@/components/rules/wizard/CameraSnapshot";
import { ChoiceCard } from "@/components/rules/wizard/ChoiceCard";
import { StepTitle, useWizard } from "@/components/rules/wizard/wizard-context";
import { applyTemplate } from "@/lib/rule-wizard/convert";
import {
  COUNT_MODES,
  OBJECT_BY_ID,
  OBJECTS,
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  availableActions,
  availableObjects,
  isObjectSupported,
  spatialRequirement,
  type TemplateDef,
} from "@/lib/rule-wizard/config";
import { DEFAULT_WIZARD_STATE, type WizardActionId, type WizardObjectId } from "@/lib/rule-wizard/types";
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
  ShieldAlert,
  Moon,
  Users,
};

// ---------------------------------------------------------------------------
// 1. Camera
// ---------------------------------------------------------------------------

export function StepCamera() {
  const { state, choose, cameras, rules } = useWizard();
  // Real cameras first; Video Lab sources after them.
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
// 2. Method
// ---------------------------------------------------------------------------

export function StepMethod() {
  const { state, choose } = useWizard();
  const pick = (method: "template" | "custom") => {
    if (state.method === method) {
      choose({});
      return;
    }
    choose({
      ...DEFAULT_WIZARD_STATE,
      cameraId: state.cameraId,
      method,
      name: "",
    });
  };
  return (
    <div className="space-y-4">
      <StepTitle title="איך תרצו להתחיל?" />
      <div className="grid gap-3 md:grid-cols-2">
        <ChoiceCard
          size="lg"
          icon={LayoutTemplate}
          title="תבנית מוכנה"
          description="בחרו מצב נפוץ ונתאים אותו למצלמה שלכם."
          selected={state.method === "template"}
          onClick={() => pick("template")}
          testId="wizard-method-template"
        />
        <ChoiceCard
          size="lg"
          icon={PencilRuler}
          title="חוק חדש"
          description="נגדיר יחד מה המצלמה צריכה לזהות ומה לעשות."
          selected={state.method === "custom"}
          onClick={() => pick("custom")}
          testId="wizard-method-custom"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2b. Template
// ---------------------------------------------------------------------------

export function StepTemplate() {
  const { state, choose } = useWizard();
  const pick = (tpl: TemplateDef) => {
    const base = { ...DEFAULT_WIZARD_STATE, cameraId: state.cameraId, method: "template" as const };
    choose(applyTemplate(base, tpl.id));
  };
  return (
    <div className="space-y-5">
      <StepTitle title="איזה מצב תרצו לזהות?" hint="התבנית ממלאת את רוב ההגדרות; נשאל רק מה שחסר." />
      {TEMPLATE_CATEGORIES.map((cat) => (
        <section key={cat.id} className="space-y-2">
          <h3 className="text-xs font-medium text-ink-muted">{cat.label}</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.filter((tpl) => tpl.category === cat.id).map((tpl) => (
              <li key={tpl.id}>
                <ChoiceCard
                  icon={ICONS[tpl.icon]}
                  title={tpl.title}
                  description={tpl.description}
                  selected={state.templateId === tpl.id}
                  onClick={() => pick(tpl)}
                  testId={`wizard-template-${tpl.id}`}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Action ("מה צריך לקרות")
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
      object: state.object && isObjectSupported(state.object) ? state.object : null,
    });
  };
  return (
    <div className="space-y-4">
      <StepTitle title="מה תרצו שהמצלמה תזהה?" hint="בחרו מה צריך לקרות כדי שהחוק יפעל." />
      <ul className="grid gap-2 sm:grid-cols-2">
        {availableActions().map((a) => (
          <li key={a.id}>
            <ChoiceCard
              icon={ICONS[a.icon]}
              title={a.label}
              description={a.description}
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
// 4. Object ("על מה")
// ---------------------------------------------------------------------------

export function StepObject() {
  const { state, choose } = useWizard();
  const available = new Set(availableObjects(state.action).map((o) => o.id));
  const pick = (id: WizardObjectId) =>
    choose({ object: id, legacy: state.legacy ? { ...state.legacy, objectClasses: null } : null });
  const question = state.action === "count" ? "מה נרצה לספור?" : "על מה החוק חל?";
  return (
    <div className="space-y-4">
      <StepTitle title={question} hint='"רכב" כולל מכוניות, משאיות, אוטובוסים ואופנועים.' />
      {state.legacy?.objectClasses?.length ? (
        <p className="rounded-xl border border-dashed border-border bg-muted px-3 py-2 text-xs text-ink-muted">
          לחוק זה הוגדר סוג אובייקט שאינו מופיע כאן; הוא יישמר כפי שהוא אלא אם תבחרו סוג אחר.
        </p>
      ) : null}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {OBJECTS.map((o) => {
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
// 4b. Count mode ("מתי נספור")
// ---------------------------------------------------------------------------

export function StepCountMode() {
  const { state, choose } = useWizard();
  return (
    <div className="space-y-4">
      <StepTitle title={state.object ? `מתי נספור ${OBJECT_BY_ID[state.object].plural}?` : "מתי נספור?"} />
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
