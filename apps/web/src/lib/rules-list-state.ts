import type { Rule } from "@/lib/types";

/**
 * Apply enabled state to exactly one Rule by id.
 * Never bulk-assign `enabled` across the list.
 */
export function applyRuleEnabled(rules: Rule[], ruleId: string, enabled: boolean): Rule[] {
  // Do not bump updated_at here — list order must stay stable across toggles.
  return rules.map((rule) => (rule.id === ruleId ? { ...rule, enabled } : rule));
}

/** Snapshot of enabled flags — useful in tests / rollback asserts. */
export function ruleEnabledMap(rules: Rule[]): Record<string, boolean> {
  return Object.fromEntries(rules.map((r) => [r.id, r.enabled]));
}
