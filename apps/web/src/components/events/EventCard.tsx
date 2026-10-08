"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EventThumbnail } from "@/components/events/EventThumbnail";
import { t } from "@/i18n/he";
import { formatDateTime, objectClassHe, stateHe } from "@/lib/format";
import type { EventItem } from "@/lib/types";

type Props = {
  event: EventItem;
  token: string | null;
  /** Used when `onSelect` is not provided (standalone feeds). */
  href?: string;
  /** Prefer over navigation when set (ops panel stays in-place). */
  onSelect?: () => void;
  cameraName: string;
  ruleName?: string | null;
  /** "compact" (home / camera tab) hides the rule row. */
  variant?: "default" | "compact";
};

/**
 * Media-first event card for dark operational feed.
 */
export function EventCard({
  event: ev,
  token,
  href,
  onSelect,
  cameraName,
  ruleName,
  variant = "default",
}: Props) {
  const isNew = ev.state === "new";
  const body = (
    <Card className="p-2.5 transition hover:border-accent/40">
      <div className="flex gap-3">
        <EventThumbnail
          token={token}
          eventId={ev.id}
          hasSnapshot={Boolean(ev.has_snapshot)}
          className="flex h-18 w-22 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted h-16 w-20"
        />
        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-medium text-ink">
              {ev.message_he ?? objectClassHe(ev.object_class)}
            </p>
            <Chip tone={isNew ? "accent" : "neutral"}>{stateHe(ev.state)}</Chip>
          </div>
          <p className="mt-1 truncate text-xs text-ink-muted">
            {cameraName} · {formatDateTime(ev.started_at)}
          </p>
          {variant === "default" && ruleName && ruleName !== "—" ? (
            <p className="mt-0.5 truncate text-xs text-ink-faint">
              {t("matchedRule")}: {ruleName}
            </p>
          ) : null}
          {ev.source_analysis_run_id ? (
            <Chip tone="dashed" className="mt-1.5">
              {t("devSourceBadge")}
            </Chip>
          ) : null}
        </div>
      </div>
    </Card>
  );

  if (onSelect) {
    return (
      <button type="button" className="block w-full text-start" data-testid="event-card" onClick={onSelect}>
        {body}
      </button>
    );
  }

  return (
    <Link href={href ?? `/events/${ev.id}`} className="block" data-testid="event-card">
      {body}
    </Link>
  );
}
