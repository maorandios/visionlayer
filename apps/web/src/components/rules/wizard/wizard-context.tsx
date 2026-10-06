"use client";

import { createContext, useContext } from "react";
import type { RuleNames } from "@/lib/rule-describe";
import type { RuleWizardState } from "@/lib/rule-wizard/types";
import type { Camera, Line, Rule, Zone } from "@/lib/types";

export type WizardContextValue = {
  state: RuleWizardState;
  update: (patch: Partial<RuleWizardState>) => void;
  /** Apply a patch and move to the next step when the current one is complete. */
  choose: (patch: Partial<RuleWizardState>) => void;
  cameras: Camera[];
  zones: Zone[];
  lines: Line[];
  rules: Rule[];
  names: RuleNames;
  /** Registers a zone / line created inline so it is selectable immediately. */
  addZone: (zone: Zone) => void;
  addLine: (line: Line) => void;
  /** Whether push notifications are available in this installation. */
  notifyAvailable: boolean;
  isEdit: boolean;
};

export const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard outside RuleWizard");
  return ctx;
}

export function StepTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <header className="space-y-1">
      <h2 className="text-lg font-semibold text-ink md:text-xl">{title}</h2>
      {hint ? <p className="text-sm text-ink-muted">{hint}</p> : null}
    </header>
  );
}
