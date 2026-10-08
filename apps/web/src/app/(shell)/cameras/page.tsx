"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { OperationsWorkspace, legacyCameraToOps } from "@/components/operations/OperationsWorkspace";
import { LoadingBlock } from "@/components/ui/StateBlock";

/**
 * Legacy `/cameras` list — same operations workspace.
 * Supports `?camera=` deep links by normalizing onto `/`.
 */
function CamerasAliasInner() {
  const router = useRouter();
  const search = useSearchParams();
  const camera = search.get("camera");
  const tab = search.get("tab");

  useEffect(() => {
    if (camera) {
      router.replace(legacyCameraToOps(camera, tab));
    }
  }, [camera, tab, router]);

  if (camera) return <LoadingBlock />;
  return <OperationsWorkspace />;
}

export default function CamerasPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <CamerasAliasInner />
    </Suspense>
  );
}
