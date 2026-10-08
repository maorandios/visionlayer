import { metricTypeConfig, type MetricDefType } from "@/lib/vision-capabilities";
import type { MetricWizardState, MetricWizardStep } from "@/lib/metric-wizard/types";

export function computeMetricSteps(state: MetricWizardState): MetricWizardStep[] {
  if (!state.metricType) return ["type"];
  const cfg = metricTypeConfig(state.metricType);
  const steps: MetricWizardStep[] = ["type", "object"];

  if (cfg.spatial === "line" || cfg.spatial === "zone" || cfg.spatial === "optional_zone") {
    steps.push("place");
  }

  // Line metrics handle direction inside LineMetricSetup (no separate settings step).
  // Zone metrics have no settings step.

  steps.push("summary");
  return steps;
}

export function applyMetricTypeDefaults(
  metricType: MetricDefType,
  prev: MetricWizardState,
): MetricWizardState {
  const cfg = metricTypeConfig(metricType);
  let scopeType = prev.scopeType;
  let direction = prev.direction;
  let zoneId = prev.zoneId;
  let lineId = prev.lineId;

  if (cfg.spatial === "line") {
    scopeType = "line";
    zoneId = null;
    // Direction chosen visually in LineMetricSetup — start unset for entry/exit.
    direction = cfg.direction === "optional" ? "any" : null;
  } else if (cfg.spatial === "zone") {
    scopeType = "zone";
    lineId = null;
    direction = null;
  } else {
    // optional_zone — default full FOV
    scopeType = "camera";
    zoneId = null;
    lineId = null;
    direction = null;
  }

  return {
    ...prev,
    metricType,
    scopeType,
    zoneId,
    lineId,
    direction,
    name: "",
  };
}
