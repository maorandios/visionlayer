/**
 * Source-level guards for the Rule Wizard UX (no JSDOM needed).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const wizardFiles = [
  "components/rules/wizard/RuleWizard.tsx",
  "components/rules/wizard/steps-choose.tsx",
  "components/rules/wizard/steps-details.tsx",
  "components/rules/wizard/StepPlace.tsx",
  "components/rules/wizard/StepReview.tsx",
  "components/rules/wizard/RulePreview.tsx",
];

describe("rule wizard UI", () => {
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
    for (const file of wizardFiles) {
      const src = read(file);
      // every user-visible Hebrew string (string literals and JSX text)
      const literals = src.match(/["'`][^"'`\n]*[א-ת][^"'`\n]*["'`]/g) ?? [];
      const jsxText = src.match(/>[^<>{}\n]*[א-ת][^<>{}\n]*</g) ?? [];
      for (const chunk of [...literals, ...jsxText]) {
        for (const token of ["a_to_b", "b_to_a", "zone_presence", "line_cross", "count_threshold", "threshold", "aggregation", "operator", "track"]) {
          expect(chunk, `${file}: ${chunk}`).not.toContain(token);
        }
      }
    }
  });

  it("direction choices are 'כל כיוון' plus the line's own names", () => {
    const src = read("components/rules/wizard/steps-details.tsx");
    expect(src).toContain('"כל כיוון"');
    expect(src).toContain("names.directionLabel?.(state.lineId, d)");
  });

  it("count flow is phrased as a sentence and notifications are hidden behind capability", () => {
    const src = read("components/rules/wizard/steps-details.tsx");
    expect(src).toContain("האם ליצור אירוע כשמגיעים לכמות מסוימת?");
    expect(src).toContain("לפחות כמה?");
    expect(src).toContain("בתוך כמה זמן?");
    expect(src).toContain("notifyAvailable");
    expect(src).toContain("לא זמין עדיין בהתקנה זו");
  });

  it("the live preview uses the shared rule description utility", () => {
    const src = read("components/rules/wizard/RulePreview.tsx");
    expect(src).toContain('from "@/lib/rule-describe"');
    expect(src).toContain("previewRule(state)");
  });

  it("review and success screens", () => {
    const review = read("components/rules/wizard/StepReview.tsx");
    expect(review).toContain("החוק מוכן");
    expect(review).toContain("החוק פעיל");
    expect(review).toContain("צור חוק נוסף");
    expect(review).toContain("חזור למצלמה");
    const wizard = read("components/rules/wizard/RuleWizard.tsx");
    expect(wizard).toContain("שמור והפעל");
    expect(wizard).toContain("api.rules.validate");
    expect(wizard).toContain("FULL_FRAME_ZONE_NAME");
  });

  it("the app shell switches to focus mode for the wizard routes", () => {
    const src = read("components/layout/AppShell.tsx");
    expect(src).toContain("isFocusRoute");
    expect(src).toContain("focus-shell");
  });

  it("Video Lab 'create rule' enters the wizard with the virtual camera preselected", () => {
    const lab = read("app/(shell)/dev/video-lab/page.tsx");
    expect(lab).toMatch(/\/rules\/new\?cameraId=/);
    expect(read("app/(shell)/rules/new/page.tsx")).toContain("labReturnHref");
  });
});
