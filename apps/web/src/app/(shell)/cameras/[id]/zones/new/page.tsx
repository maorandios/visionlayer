"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ZoneCreateForm } from "@/components/zones/ZoneCreateForm";
import { LoadingBlock } from "@/components/ui/StateBlock";

function NewZoneInner() {
  const { id: cameraId } = useParams<{ id: string }>();
  const search = useSearchParams();
  const fromLab = search.get("lab") === "1";
  const labAssetId = search.get("assetId") ?? "";
  const labRunId = search.get("runId") ?? "";
  const router = useRouter();

  function onDone() {
    if (fromLab) {
      const params = new URLSearchParams();
      if (labAssetId) params.set("asset", labAssetId);
      if (labRunId) params.set("run", labRunId);
      const q = params.toString();
      router.push(q ? `/dev/video-lab?${q}` : "/dev/video-lab");
    } else {
      router.push(`/?camera=${cameraId}&tab=rules`);
    }
  }

  return <ZoneCreateForm cameraId={cameraId} onDone={onDone} />;
}

export default function NewZonePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <NewZoneInner />
    </Suspense>
  );
}
