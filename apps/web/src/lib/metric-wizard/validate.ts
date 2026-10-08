import { metricTypeConfig } from "@/lib/vision-capabilities";
import type { MetricWizardState } from "@/lib/metric-wizard/types";

export function metricWizardErrors(state: MetricWizardState): string[] {
  const errors: string[] = [];
  if (!state.metricType) {
    errors.push("בחרו מה למדוד");
    return errors;
  }
  if (!state.objectType) {
    errors.push("בחרו סוג אובייקט");
    return errors;
  }

  const cfg = metricTypeConfig(state.metricType);
  if (cfg.spatial === "line") {
    if (!state.lineId) errors.push("בחרו או צרו קו");
    if (cfg.direction === true && state.direction !== "a_to_b" && state.direction !== "b_to_a") {
      errors.push("בחרו כיוון");
    }
    if (
      cfg.direction === "optional" &&
      state.direction != null &&
      state.direction !== "any" &&
      state.direction !== "a_to_b" &&
      state.direction !== "b_to_a"
    ) {
      errors.push("בחרו כיוון");
    }
  } else if (cfg.spatial === "zone") {
    if (!state.zoneId) errors.push("בחרו או צרו אזור");
  } else if (cfg.spatial === "optional_zone") {
    if (state.scopeType === "zone" && !state.zoneId) errors.push("בחרו או צרו אזור");
  }

  if (!state.name.trim()) errors.push("תנו למדד שם");
  return errors;
}

export function canAdvance(step: string, state: MetricWizardState): boolean {
  if (step === "type") return !!state.metricType;
  if (step === "object") return !!state.objectType;
  if (step === "place") {
    const cfg = state.metricType ? metricTypeConfig(state.metricType) : null;
    if (!cfg) return false;
    if (cfg.spatial === "line") {
      if (!state.lineId) return false;
      if (cfg.direction === true) return state.direction === "a_to_b" || state.direction === "b_to_a";
      return state.direction === "any" || state.direction === "a_to_b" || state.direction === "b_to_a";
    }
    if (cfg.spatial === "zone") return !!state.zoneId;
    if (cfg.spatial === "optional_zone") {
      return state.scopeType === "camera" || !!state.zoneId;
    }
  }
  if (step === "settings") return true;
  return true;
}
