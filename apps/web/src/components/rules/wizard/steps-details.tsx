"use client";

import { Bell, CalendarClock, ChevronDown, FileVideo } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { ChoiceCard, ChoicePill } from "@/components/rules/wizard/ChoiceCard";
import { StepTitle, useWizard } from "@/components/rules/wizard/wizard-context";
import { durationShort } from "@/lib/rule-wizard/convert";
import { DURATION_CHOICES, THRESHOLD_CHOICES, WEEKDAYS, WINDOW_CHOICES, OBJECT_BY_ID } from "@/lib/rule-wizard/config";
import type { WizardDirection } from "@/lib/rule-wizard/types";

// ---------------------------------------------------------------------------
// Details: duration / direction / count
// ---------------------------------------------------------------------------

export function StepDetails() {
  const { state } = useWizard();
  const blocks: React.ReactNode[] = [];
  if (state.action === "dwell") blocks.push(<DurationBlock key="duration" />);
  if (state.action === "line_cross" || (state.action === "count" && state.countMode === "line")) {
    blocks.push(<DirectionBlock key="direction" />);
  }
  if (state.action === "count") blocks.push(<CountBlock key="count" />);
  if (state.legacy?.presenceDurationSeconds) blocks.push(<LegacyPresenceNote key="legacy" />);

  const title =
    state.action === "dwell"
      ? "כמה זמן צריך להישאר?"
      : state.action === "count"
        ? "ספירה"
        : state.action === "line_cross"
          ? "באיזה כיוון?"
          : "פרטים";

  return (
    <div className="space-y-6">
      <StepTitle title={title} />
      {blocks}
    </div>
  );
}

function DurationBlock() {
  const { state, update } = useWizard();
  const isPreset = DURATION_CHOICES.some((d) => d.seconds === state.durationSeconds);
  const [custom, setCustom] = useState(!isPreset);
  return (
    <section className="space-y-3" data-testid="wizard-duration">
      <div className="flex flex-wrap gap-2">
        {DURATION_CHOICES.map((d) => (
          <ChoicePill
            key={d.seconds}
            label={d.label}
            selected={!custom && state.durationSeconds === d.seconds}
            onClick={() => {
              setCustom(false);
              update({ durationSeconds: d.seconds });
            }}
          />
        ))}
        <ChoicePill label="מותאם אישית" selected={custom} onClick={() => setCustom(true)} />
      </div>
      {custom ? (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            className="w-28"
            value={state.durationSeconds || ""}
            onChange={(e) => update({ durationSeconds: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="text-sm text-ink-muted">שניות</span>
        </div>
      ) : null}
      <p className="text-sm text-ink-muted">
        {`החוק יפעל כש${state.object ? OBJECT_BY_ID[state.object].label : "האובייקט"} נשאר באזור יותר מ־${durationShort(state.durationSeconds || 0)}.`}
      </p>
    </section>
  );
}

function DirectionBlock() {
  const { state, update, names } = useWizard();
  const labelFor = (d: WizardDirection) => (d === "any" ? "כל כיוון" : names.directionLabel?.(state.lineId, d) ?? "");
  const options: { id: WizardDirection; title: string; description: string }[] = [
    { id: "any", title: "כל כיוון", description: "כל חצייה של הקו נחשבת." },
    { id: "a_to_b", title: labelFor("a_to_b"), description: "רק מעבר בכיוון הזה." },
    { id: "b_to_a", title: labelFor("b_to_a"), description: "רק מעבר בכיוון הזה." },
  ];
  return (
    <section className="space-y-3" data-testid="wizard-direction">
      {state.action === "count" ? <h3 className="text-sm font-medium text-ink">באיזה כיוון?</h3> : null}
      <ul className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <li key={o.id}>
            <ChoiceCard
              title={o.title}
              description={o.description}
              selected={state.direction === o.id}
              onClick={() => update({ direction: o.id })}
              testId={`wizard-direction-${o.id}`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CountBlock() {
  const { state, update } = useWizard();
  const plural = state.object ? OBJECT_BY_ID[state.object].plural : "אובייקטים";
  const thresholdPreset = THRESHOLD_CHOICES.includes(state.countThreshold);
  const [customThreshold, setCustomThreshold] = useState(!thresholdPreset);
  const windowPreset = WINDOW_CHOICES.some((w) => w.seconds === state.countWindowSeconds);
  const [customWindow, setCustomWindow] = useState(!windowPreset);

  return (
    <section className="space-y-4" data-testid="wizard-count">
      <h3 className="text-sm font-medium text-ink">האם ליצור אירוע כשמגיעים לכמות מסוימת?</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <ChoiceCard
          title="כן, כשמגיעים לכמות"
          description="נוסיף תנאי: לפחות X בתוך פרק זמן."
          selected={state.countThresholdEnabled}
          onClick={() => update({ countThresholdEnabled: true })}
          testId="wizard-count-threshold-yes"
        />
        <ChoiceCard
          title="לא, רק לספור"
          description="כל מקרה נספר ונרשם, בלי תנאי כמות."
          selected={!state.countThresholdEnabled}
          onClick={() => update({ countThresholdEnabled: false })}
          testId="wizard-count-threshold-no"
        />
      </div>

      {state.countThresholdEnabled ? (
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm text-ink">
            צור אירוע כשיש <span className="font-semibold">לפחות {state.countThreshold || "—"} {plural}</span> בתוך{" "}
            <span className="font-semibold">{durationShort(state.countWindowSeconds || 0)}</span>.
          </p>
          <div className="space-y-2">
            <p className="text-xs text-ink-muted">לפחות כמה?</p>
            <div className="flex flex-wrap gap-2">
              {THRESHOLD_CHOICES.map((n) => (
                <ChoicePill
                  key={n}
                  label={String(n)}
                  selected={!customThreshold && state.countThreshold === n}
                  onClick={() => {
                    setCustomThreshold(false);
                    update({ countThreshold: n });
                  }}
                />
              ))}
              <ChoicePill label="אחר" selected={customThreshold} onClick={() => setCustomThreshold(true)} />
              {customThreshold ? (
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  className="w-24"
                  value={state.countThreshold || ""}
                  onChange={(e) => update({ countThreshold: Math.max(0, Number(e.target.value) || 0) })}
                />
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-ink-muted">בתוך כמה זמן?</p>
            <div className="flex flex-wrap gap-2">
              {WINDOW_CHOICES.map((w) => (
                <ChoicePill
                  key={w.seconds}
                  label={w.label}
                  selected={!customWindow && state.countWindowSeconds === w.seconds}
                  onClick={() => {
                    setCustomWindow(false);
                    update({ countWindowSeconds: w.seconds });
                  }}
                />
              ))}
              <ChoicePill label="אחר" selected={customWindow} onClick={() => setCustomWindow(true)} />
              {customWindow ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    className="w-24"
                    value={state.countWindowSeconds ? Math.round(state.countWindowSeconds / 60) : ""}
                    onChange={(e) => update({ countWindowSeconds: Math.max(0, Number(e.target.value) || 0) * 60 })}
                  />
                  <span className="text-sm text-ink-muted">דקות</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LegacyPresenceNote() {
  const { state } = useWizard();
  return (
    <p className="rounded-xl border border-dashed border-border bg-muted px-3 py-2 text-xs text-ink-muted">
      החוק דורש נוכחות של לפחות {durationShort(state.legacy?.presenceDurationSeconds ?? 0)} — ההגדרה נשמרת כפי שהיא.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Conditions: schedule (optional, collapsed)
// ---------------------------------------------------------------------------

export function StepConditions() {
  const { state, update } = useWizard();
  const custom = state.schedule.mode === "custom";
  const [open, setOpen] = useState(custom);
  const sched = state.schedule;

  const setCustom = (patch: Partial<{ from: string; to: string; days: number[] | null }>) => {
    const base = sched.mode === "custom" ? sched : { mode: "custom" as const, from: "08:00", to: "18:00", days: null };
    update({ schedule: { ...base, ...patch, mode: "custom" } });
  };

  const allDays = sched.mode !== "custom" || sched.days === null;

  return (
    <div className="space-y-4">
      <StepTitle title="תנאים נוספים" hint="לא חובה. כברירת מחדל החוק פעיל כל הזמן." />
      <div className="grid gap-2 sm:grid-cols-2">
        <ChoiceCard
          icon={CalendarClock}
          title="כל הזמן"
          description="החוק פעיל 24/7."
          selected={!custom}
          onClick={() => {
            update({ schedule: { mode: "always" } });
            setOpen(false);
          }}
          testId="wizard-schedule-always"
        />
        <ChoiceCard
          icon={CalendarClock}
          title="רק בשעות מסוימות"
          description="למשל בלילה או מחוץ לשעות הפעילות."
          selected={custom}
          onClick={() => {
            if (!custom) setCustom({});
            setOpen(true);
          }}
          testId="wizard-schedule-custom"
        />
      </div>

      {custom ? (
        <div className="rounded-2xl border border-border bg-surface">
          <button
            type="button"
            className="flex min-h-11 w-full items-center justify-between px-4 text-sm font-medium text-ink"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <span>
              {sched.mode === "custom" ? `${sched.from}–${sched.to}` : ""}
              {allDays ? " · כל יום" : ""}
            </span>
            <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} strokeWidth={1.75} aria-hidden />
          </button>
          {open && sched.mode === "custom" ? (
            <div className="space-y-4 border-t border-border p-4" data-testid="wizard-schedule-editor">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-ink-muted">משעה</label>
                  <Input type="time" value={sched.from} onChange={(e) => setCustom({ from: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink-muted">עד שעה</label>
                  <Input type="time" value={sched.to} onChange={(e) => setCustom({ to: e.target.value })} />
                </div>
              </div>
              {sched.from > sched.to ? (
                <p className="text-xs text-ink-muted">הטווח חוצה חצות — החוק יפעל מהערב ועד הבוקר שאחריו.</p>
              ) : null}
              <div className="space-y-2">
                <p className="text-xs text-ink-muted">באילו ימים?</p>
                <div className="flex flex-wrap gap-2">
                  <ChoicePill label="כל יום" selected={allDays} onClick={() => setCustom({ days: null })} />
                  {WEEKDAYS.map((d) => {
                    const selected = !allDays && (sched.days ?? []).includes(d.value);
                    return (
                      <ChoicePill
                        key={d.value}
                        label={d.short}
                        selected={selected}
                        onClick={() => {
                          const current = allDays ? [] : [...(sched.days ?? [])];
                          const next = selected ? current.filter((v) => v !== d.value) : [...current, d.value];
                          setCustom({ days: next });
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

export function StepOutcome() {
  const { state, update, notifyAvailable } = useWizard();
  return (
    <div className="space-y-4">
      <StepTitle title="מה לעשות כשזה קורה?" />
      <div className="grid gap-2 sm:grid-cols-2">
        <ChoiceCard
          icon={FileVideo}
          title="צור אירוע"
          description="האירוע יישמר עם תמונה וקטע וידאו, ויופיע ברשימת האירועים ובתובנות."
          selected
          testId="wizard-outcome-event"
        >
          <span className="mt-1 block text-[11px] text-surface/70">תמיד פעיל</span>
        </ChoiceCard>
        <ChoiceCard
          icon={Bell}
          title="שלח התראה"
          description="התראה למכשיר שלכם ברגע שהחוק מופעל."
          selected={state.outcome.notify}
          disabled={!notifyAvailable}
          unavailableNote={notifyAvailable ? undefined : "לא זמין עדיין בהתקנה זו"}
          onClick={() => update({ outcome: { createEvent: true, notify: !state.outcome.notify } })}
          testId="wizard-outcome-notify"
        />
      </div>
    </div>
  );
}
