import { describe, expect, it } from "vitest";
import { sortRulesOperational } from "@/lib/rule-describe";
import { applyRuleEnabled, ruleEnabledMap } from "@/lib/rules-list-state";
import type { Rule } from "@/lib/types";

function rule(id: string, enabled: boolean): Rule {
  return {
    id,
    name: id,
    enabled,
    conditions: { object_classes: ["person"], camera_id: "cam" },
    actions: [{ type: "create_event" }],
    cooldown_seconds: 0,
    last_triggered_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("applyRuleEnabled — independent Rule toggles", () => {
  it("disabling Rule B leaves A and C enabled", () => {
    const list = [rule("A", true), rule("B", true), rule("C", true)];
    const next = applyRuleEnabled(list, "B", false);
    expect(ruleEnabledMap(next)).toEqual({ A: true, B: false, C: true });
    // originals untouched
    expect(list.map((r) => r.enabled)).toEqual([true, true, true]);
  });

  it("disabling A after B stays isolated", () => {
    let list = [rule("A", true), rule("B", true), rule("C", true)];
    list = applyRuleEnabled(list, "B", false);
    list = applyRuleEnabled(list, "A", false);
    expect(ruleEnabledMap(list)).toEqual({ A: false, B: false, C: true });
  });

  it("re-enabling only restores the targeted Rule", () => {
    let list = [rule("A", false), rule("B", false), rule("C", true)];
    list = applyRuleEnabled(list, "A", true);
    expect(ruleEnabledMap(list)).toEqual({ A: true, B: false, C: true });
  });

  it("unknown id is a no-op for enabled flags", () => {
    const list = [rule("A", true), rule("B", false)];
    const next = applyRuleEnabled(list, "missing", false);
    expect(ruleEnabledMap(next)).toEqual({ A: true, B: false });
  });

  it("never bulk-assigns the same enabled value to every Rule", () => {
    const list = [rule("A", true), rule("B", true), rule("C", true)];
    const next = applyRuleEnabled(list, "B", false);
    const changed = next.filter((r, i) => r.enabled !== list[i]!.enabled);
    expect(changed).toHaveLength(1);
    expect(changed[0]!.id).toBe("B");
  });

  it("disabling the first visible row does not move it (no false sibling toggle UX)", () => {
    const list = [
      { ...rule("first", true), created_at: "2026-03-01T00:00:00Z" },
      { ...rule("second", true), created_at: "2026-02-01T00:00:00Z" },
      { ...rule("third", true), created_at: "2026-01-01T00:00:00Z" },
    ];
    const orderBefore = sortRulesOperational(list).map((r) => r.id);
    expect(orderBefore[0]).toBe("first");
    const next = applyRuleEnabled(list, "first", false);
    const orderAfter = sortRulesOperational(next).map((r) => r.id);
    expect(orderAfter).toEqual(orderBefore);
    expect(ruleEnabledMap(next)).toEqual({ first: false, second: true, third: true });
  });
});
