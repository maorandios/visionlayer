"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LineCreateForm } from "@/components/lines/LineCreateForm";
import { LoadingBlock } from "@/components/ui/StateBlock";

function NewLineInner() {
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

  return <LineCreateForm cameraId={cameraId} onDone={onDone} />;
}

export default function NewLinePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <NewLineInner />
    </Suspense>
  );
}
