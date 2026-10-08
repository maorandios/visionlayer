"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { legacyCameraToOps } from "@/components/operations/ops-url";
import { LoadingBlock } from "@/components/ui/StateBlock";

/** Legacy camera detail URL → Operations focus mode. */
function RedirectInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(legacyCameraToOps(params.id, search.get("tab")));
  }, [params.id, search, router]);

  return <LoadingBlock />;
}

export default function CameraDetailRedirect() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <RedirectInner />
    </Suspense>
  );
}
