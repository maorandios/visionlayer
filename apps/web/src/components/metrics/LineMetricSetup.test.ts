import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const setupSrc = readFileSync(resolve(__dirname, "LineMetricSetup.tsx"), "utf8");
const wizardSrc = readFileSync(resolve(__dirname, "wizard/MetricWizard.tsx"), "utf8");
const editorSrc = readFileSync(resolve(__dirname, "../lines/LineEditor.tsx"), "utf8");

describe("LineMetricSetup UX contract", () => {
  it("is the shared component for entry / exit / crossing", () => {
    expect(setupSrc).toContain('mode: LineMetricMode');
    expect(setupSrc).toContain('"entry"');
    expect(setupSrc).toContain('"exit"');
    expect(setupSrc).toContain('"crossing"');
    expect(wizardSrc).toContain("LineMetricSetup");
    expect(wizardSrc).toContain("modeFromMetricType");
  });

  it("does not expose technical / naming fields in the metric line flow", () => {
    expect(setupSrc).not.toContain("צד אחד");
    expect(setupSrc).not.toContain("צד שני");
    expect(setupSrc).not.toContain("label_a_to_b");
    expect(setupSrc).not.toContain("A → B");
    expect(setupSrc).not.toContain(">1<");
    expect(wizardSrc).not.toContain("MetricLineCreator");
    expect(wizardSrc).not.toContain("צד אחד");
  });

  it("auto-names lines and stores direction on the Metric", () => {
    expect(setupSrc).toContain("defaultLineName");
    expect(setupSrc).toContain("direction: \"any\""); // line geometry
    expect(setupSrc).toContain("onComplete({ lineId: line.id, direction, line, created })");
  });

  it("supports both-directions and one-direction for crossing", () => {
    expect(setupSrc).toContain("crossingBoth");
    expect(setupSrc).toContain("crossingOne");
    expect(setupSrc).toContain("selectCrossingBoth");
    expect(setupSrc).toContain("selectCrossingOne");
    expect(setupSrc).toContain("selectArrow");
  });

  it("removes endpoint numbers by default from LineEditor", () => {
    expect(editorSrc).toContain("showPointNumbers = false");
  });

  it("reuses existing lines without forcing their direction", () => {
    expect(setupSrc).toContain("pickExisting");
    expect(setupSrc).toContain("line-metric-existing");
    expect(setupSrc).toContain("צייר קו חדש");
  });
});
