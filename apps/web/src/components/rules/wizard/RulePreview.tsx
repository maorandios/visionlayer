"use client";

import { ChevronUp, Sparkles } from "lucide-react";
import { useState } from "react";
import { useWizard } from "@/components/rules/wizard/wizard-context";
import { describeRule, ruleSentence } from "@/lib/rule-describe";
import { previewRule } from "@/lib/rule-wizard/convert";

/** Live human-readable summary of the rule, computed with the same utility used across the product. */
export function usePreviewText(): { sentence: string | null; lines: { label: string; value: string }[] } {
  const { state, names } = useWizard();
  const rule = previewRule(state);
  if (!rule) return { sentence: null, lines: [] };
  const d = describeRule(rule, names);
  const lines = [
    { label: "מצלמה", value: d.where },
    { label: "מתי", value: d.schedule ?? "כל הזמן" },
    { label: "פעולה", value: d.action },
  ];
  return { sentence: ruleSentence(rule, names), lines };
}

export function RulePreviewPanel() {
  const { sentence, lines } = usePreviewText();
  return (
    <aside className="hidden lg:block" data-testid="wizard-preview-panel">
      <div className="glass sticky top-6 space-y-4 rounded-lg border border-border p-5 shadow-float">
        <div className="flex items-center gap-2 text-xs font-medium text-accent">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          כך ייראה החוק
        </div>
        {sentence ? (
          <>
            <p className="text-base font-medium leading-relaxed text-ink">{sentence}</p>
            <dl className="space-y-2 border-t border-border pt-3 text-sm">
              {lines.map((l) => (
                <div key={l.label} className="flex justify-between gap-3">
                  <dt className="text-ink-muted">{l.label}</dt>
                  <dd className="truncate text-ink">{l.value}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="text-sm text-ink-muted">הסיכום יתעדכן כאן בזמן שתבחרו.</p>
        )}
      </div>
    </aside>
  );
}

/** Compact bar for small screens; tap to expand. */
export function RulePreviewBar() {
  const { sentence, lines } = usePreviewText();
  const [open, setOpen] = useState(false);
  if (!sentence) return null;
  return (
    <div className="border-b border-border bg-surface lg:hidden" data-testid="wizard-preview-bar">
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-2 px-4 text-start"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} aria-hidden />
        <span className={`flex-1 text-sm text-ink ${open ? "" : "truncate"}`}>{sentence}</span>
        <ChevronUp className={`h-4 w-4 shrink-0 text-ink-muted transition ${open ? "rotate-180" : ""}`} strokeWidth={1.75} aria-hidden />
      </button>
      {open ? (
        <dl className="space-y-1 px-4 pb-3 text-xs">
          {lines.map((l) => (
            <div key={l.label} className="flex justify-between gap-3">
              <dt className="text-ink-muted">{l.label}</dt>
              <dd className="truncate text-ink">{l.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
