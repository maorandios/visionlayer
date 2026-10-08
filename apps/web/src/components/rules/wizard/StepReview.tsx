"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CameraSnapshot } from "@/components/rules/wizard/CameraSnapshot";
import { ChoicePill } from "@/components/rules/wizard/ChoiceCard";
import { usePreviewText } from "@/components/rules/wizard/RulePreview";
import { StepTitle, useWizard } from "@/components/rules/wizard/wizard-context";
import { suggestRuleName } from "@/lib/rule-wizard/convert";

export function StepReview({ errors }: { errors: string[] }) {
  const { state, update, zones, lines, names, isEdit } = useWizard();
  const { sentence, lines: facts } = usePreviewText();
  const suggested = suggestRuleName(state, names);
  const zone = state.zoneId ? zones.find((z) => z.id === state.zoneId) : null;
  const line = state.lineId ? lines.find((l) => l.id === state.lineId) : null;

  return (
    <div className="space-y-5" data-testid="wizard-review">
      <StepTitle title={isEdit ? "בדקו את החוק" : "החוק מוכן"} hint="בדקו שהכול נכון, ואז שמרו." />

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <CameraSnapshot
          cameraId={state.cameraId}
          zone={zone}
          line={line}
          fullFrame={state.action === "detected"}
          rounded="rounded-none"
          className="border-0"
        />
        <div className="space-y-3 p-4">
          <p className="text-base font-medium leading-relaxed text-ink" data-testid="wizard-review-sentence">
            {sentence}
          </p>
          <dl className="grid grid-cols-1 gap-2 border-t border-border pt-3 text-sm sm:grid-cols-3">
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="text-xs text-ink-muted">{f.label}</dt>
                <dd className="text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-ink-muted">שם החוק</label>
        <Input
          value={state.name}
          placeholder={suggested}
          onChange={(e) => update({ name: e.target.value })}
          data-testid="wizard-rule-name"
        />
        <p className="mt-1 text-xs text-ink-muted">אפשר להשאיר את השם המוצע או לשנות אותו.</p>
      </div>

      {isEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-muted">מצב החוק:</span>
          <ChoicePill label="פעיל" selected={state.enabled} onClick={() => update({ enabled: true })} />
          <ChoicePill label="מושהה" selected={!state.enabled} onClick={() => update({ enabled: false })} />
        </div>
      ) : null}

      {state.legacy?.notes.length ? (
        <div className="space-y-1 rounded-xl border border-dashed border-border bg-muted px-3 py-2 text-xs text-ink-muted">
          {state.legacy.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      ) : null}

      {errors.length > 0 ? (
        <ul className="space-y-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink" data-testid="wizard-errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SuccessScreen({
  sentence,
  cameraId,
  onAnother,
  labHref,
  onDone,
}: {
  sentence: string;
  cameraId: string | null;
  onAnother: () => void;
  labHref: string | null;
  /** When set (embedded panel), primary CTA calls this instead of navigating. */
  onDone?: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-5 py-10 text-center" data-testid="wizard-success">
      <span className="flex h-16 w-16 items-center justify-center rounded-md bg-accent text-ink-on-accent">
        <CheckCircle2 className="h-8 w-8" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-ink">החוק פעיל</h2>
        <p className="text-sm leading-relaxed text-ink-muted">
          מעכשיו <span dir="ltr">VisionLayer</span> יזהה {sentence}.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        {onDone ? (
          <Button onClick={onDone}>חזור למצלמה</Button>
        ) : labHref ? (
          <Link href={labHref} className="contents">
            <Button>חזור למעבדת הווידאו</Button>
          </Link>
        ) : (
          <Link href={cameraId ? `/?camera=${cameraId}&tab=rules` : "/rules"} className="contents">
            <Button>חזור למצלמה</Button>
          </Link>
        )}
        <Button variant="secondary" onClick={onAnother}>
          צור חוק נוסף
        </Button>
      </div>
    </div>
  );
}
