import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { opsHref } from "@/components/operations/ops-url";

const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("rule wizard UI (ops shell)", () => {
  it("create and edit pages both render the same RuleWizard", () => {
    expect(read("app/(shell)/rules/new/page.tsx")).toContain('mode="create"');
    expect(read("app/(shell)/rules/[id]/page.tsx")).toContain('mode="edit"');
  });

  it("the old technical rule form is gone", () => {
    expect(existsSync(join(root, "components/rules/RuleBuilderForm.tsx"))).toBe(false);
    expect(existsSync(join(root, "lib/rule-builder.ts"))).toBe(false);
  });

  it("zones and lines can be created inline without leaving the wizard", () => {
    const src = read("components/rules/wizard/StepPlace.tsx");
    expect(src).toContain("InlineZoneCreator");
    expect(src).toContain("InlineLineCreator");
    expect(src).toContain("PolygonEditor");
    expect(src).toContain("LineEditor");
    expect(src).toContain("api.zones.create");
    expect(src).toContain("api.lines.create");
    expect(src).not.toContain("router.push");
    expect(src).not.toContain("href=");
  });

  it("never shows raw trigger / direction / schema terms to the user", () => {
    const wizardFiles = [
      "components/rules/wizard/RuleWizard.tsx",
      "components/rules/wizard/steps-choose.tsx",
      "components/rules/wizard/steps-details.tsx",
      "components/rules/wizard/StepPlace.tsx",
      "components/rules/wizard/StepReview.tsx",
      "components/rules/wizard/RulePreview.tsx",
    ];
    for (const file of wizardFiles) {
      const src = read(file);
      const literals = src.match(/["'`][^"'`\n]*[א-ת][^"'`\n]*["'`]/g) ?? [];
      const jsxText = src.match(/>[^<>{}\n]*[א-ת][^<>{}\n]*</g) ?? [];
      for (const chunk of [...literals, ...jsxText]) {
        for (const token of [
          "a_to_b",
          "b_to_a",
          "zone_presence",
          "line_cross",
          "count_threshold",
          "threshold",
          "aggregation",
          "operator",
          "track",
        ]) {
          expect(chunk, `${file}: ${chunk}`).not.toContain(token);
        }
      }
    }
  });

  it("direction choices are human-readable", () => {
    const src = read("components/rules/wizard/steps-details.tsx");
    expect(src).toContain('"כל כיוון"');
    expect(src).toContain("names.directionLabel?.(state.lineId, d)");
  });

  it("count flow and notifications stay capability-gated", () => {
    const src = read("components/rules/wizard/steps-details.tsx");
    expect(src).toContain("האם ליצור אירוע כשמגיעים לכמות מסוימת?");
    expect(src).toContain("notifyAvailable");
    expect(src).toContain("לא זמין עדיין בהתקנה זו");
  });

  it("live preview uses the shared rule description utility", () => {
    const src = read("components/rules/wizard/RulePreview.tsx");
    expect(src).toContain('from "@/lib/rule-describe"');
    expect(src).toContain("previewRule(state)");
  });

  it("review and success screens exist; exit returns to camera ops focus", () => {
    const review = read("components/rules/wizard/StepReview.tsx");
    expect(review).toContain("החוק מוכן");
    expect(review).toContain("החוק פעיל");
    expect(review).toContain("/?camera=");
    const wizard = read("components/rules/wizard/RuleWizard.tsx");
    expect(wizard).toContain("שמור והפעל");
    expect(wizard).toContain("/?camera=");
    expect(wizard).toContain("tab=rules");
  });

  it("app shell focus mode still covers wizard routes", () => {
    const src = read("components/layout/AppShell.tsx");
    expect(src).toContain("isFocusRoute");
    expect(src).toContain("focus-shell");
  });

  it("Video Lab create-rule deep-links into the wizard with camera preselected", () => {
    const lab = read("app/(shell)/dev/video-lab/page.tsx");
    expect(lab).toMatch(/\/rules\/new\?cameraId=/);
    expect(read("app/(shell)/rules/new/page.tsx")).toContain("labReturnHref");
  });

  it("opsHref helper builds camera-preselected rule entry points", () => {
    expect(opsHref("cam_x", "rules")).toBe("/?camera=cam_x&tab=rules");
  });
});
