import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname);

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("camera Rules list UI", () => {
  it("binds each switch to a single rule id with a framed Switch", () => {
    const panel = read("../operations/CameraOpsPanel.tsx");
    const list = read("RulesList.tsx");
    const row = read("RuleListRow.tsx");
    const sw = read("../ui/Switch.tsx");
    const workspace = read("../operations/OperationsWorkspace.tsx");

    expect(panel).toContain("RulesList");
    expect(panel).toContain("toggleRuleRow");
    expect(list).toContain("enabled={rule.enabled === true}");
    expect(list).toContain("togglingId === rule.id");
    expect(list).toContain("handleToggle");

    expect(row).toContain("enabled: boolean");
    expect(row).toContain("onToggle(ruleId, next)");
    expect(row).toContain("rule-status-dot");
    expect(row).toContain("ruleObjectLabel");
    expect(row).toContain("ruleBehaviorIcon");
    expect(row).toContain("<Switch");
    expect(row).not.toContain("ruleFrequencyLabel");
    expect(row).not.toContain("ruleListSentence");
    expect(row).not.toContain("נוצר אירוע");
    expect(row).not.toContain("●");

    expect(sw).toContain('role="switch"');
    expect(sw).toContain('dir="ltr"');
    expect(sw).toContain("borderColor");
    expect(sw).toContain("translateX");
    expect(sw).not.toContain("62, 207, 142");
    expect(sw).not.toContain("success");
    expect(row).toContain('t("ruleOff")');
    expect(row).toContain("bg-success");
    expect(row).toContain("bg-accent");
    expect(list).toContain("כבוי");

    expect(workspace).toContain("applyRuleEnabled");
    expect(workspace).toContain("if (r.id !== ruleId) return r");
    expect(workspace).toContain("api.rules.update(token, ruleId");
  });

  it("shared helpers power list copy and isolated enabled patches", () => {
    const describeSrc = read("../../lib/rule-describe.ts");
    const stateSrc = read("../../lib/rules-list-state.ts");
    expect(describeSrc).toContain("ruleListSentence");
    expect(describeSrc).toContain("ruleObjectLine");
    expect(describeSrc).toContain("ruleFrequencyLabel");
    expect(stateSrc).toContain("rule.id === ruleId");
  });
});
