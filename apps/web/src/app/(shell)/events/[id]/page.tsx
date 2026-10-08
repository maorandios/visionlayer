"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { EventDetailView } from "@/components/events/EventDetailView";
import { LoadingBlock } from "@/components/ui/StateBlock";

function EventDetailInner() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  return <EventDetailView eventId={id} variant="page" returnTo={returnTo} />;
}

export default function EventDetailPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <EventDetailInner />
    </Suspense>
  );
}
