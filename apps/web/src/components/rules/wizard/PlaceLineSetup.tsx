"use client";

import { LineMetricSetup } from "@/components/metrics/LineMetricSetup";
import { useWizard } from "@/components/rules/wizard/wizard-context";
import { OBJECT_BY_ID } from "@/lib/rule-wizard/config";
import type { VisionObjectType } from "@/lib/vision-capabilities";

/** Rule wizard: draw line + pick crossing direction (same UX as line metrics). */
export function PlaceLineSetup() {
  const { state, choose, lines, addLine } = useWizard();
  const cameraId = state.cameraId;
  const object = state.object;

  if (!cameraId || !object) {
    return <p className="text-sm text-ink-muted">בחרו מצלמה ואובייקט לפני הגדרת הקו.</p>;
  }

  const objectType = object as VisionObjectType;
  const objLabel = OBJECT_BY_ID[object].label;
  const contextTitle =
    state.action === "count" && state.countMode === "line"
      ? `ספירה בחציית קו — ${objLabel}`
      : `חציית קו — ${objLabel}`;

  const existingLines = lines
    .filter((l) => l.camera_id === cameraId && l.enabled)
    .filter((l, i, arr) => arr.findIndex((x) => x.id === l.id) === i);

  return (
    <LineMetricSetup
      embedded
      variant="rule"
      mode="crossing"
      cameraId={cameraId}
      objectType={objectType}
      contextTitle={contextTitle}
      existingLines={existingLines}
      initialLineId={state.lineId}
      initialDirection={state.direction}
      onComplete={({ lineId, direction, line, created }) => {
        if (created) addLine(line);
        choose({ lineId, direction });
      }}
    />
  );
}
