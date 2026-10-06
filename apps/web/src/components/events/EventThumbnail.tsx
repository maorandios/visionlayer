"use client";

import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Props = {
  token: string | null;
  eventId: string;
  hasSnapshot: boolean;
  className?: string;
};

export function EventThumbnail({ token, eventId, hasSnapshot, className = "" }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !hasSnapshot) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const blob = await api.events.snapshotBlob(token, eventId);
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setUrl(objectUrl);
      } catch {
        if (!cancelled) setUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, eventId, hasSnapshot]);

  const box =
    className ||
    "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted";

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className={`${box} object-cover`} />
    );
  }

  return (
    <div className={box} aria-hidden>
      <ImageIcon className="h-5 w-5 text-ink-muted" strokeWidth={1.5} />
    </div>
  );
}
