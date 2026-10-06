"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RuleWizard } from "@/components/rules/wizard/RuleWizard";
import { LoadingBlock } from "@/components/ui/StateBlock";

function NewRuleInner() {
  const search = useSearchParams();
  const cameraId = search.get("cameraId");
  const objectClass = search.get("objectClass");
  const fromLab = search.get("lab") === "1";
  let labReturnHref: string | null = null;
  if (fromLab) {
    const params = new URLSearchParams();
    const asset = search.get("assetId");
    const run = search.get("runId");
    if (asset) params.set("asset", asset);
    if (run) params.set("run", run);
    const q = params.toString();
    labReturnHref = q ? `/dev/video-lab?${q}` : "/dev/video-lab";
  }
  return (
    <RuleWizard mode="create" presetCameraId={cameraId} presetObjectClass={objectClass} labReturnHref={labReturnHref} />
  );
}

export default function NewRulePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <NewRuleInner />
    </Suspense>
  );
}
