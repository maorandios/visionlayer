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
  href: string;
  cameraName: string;
  ruleName?: string | null;
  /** "compact" (home / camera tab) hides the rule row. */
  variant?: "default" | "compact";
};

/**
 * Media-first event card: image → title → camera · time → matched rule → state chip.
 * Technical metadata (ids, track, confidence) is intentionally NOT shown here.
 */
export function EventCard({ event: ev, token, href, cameraName, ruleName, variant = "default" }: Props) {
  const isNew = ev.state === "new";
  return (
    <Link href={href} className="block" data-testid="event-card">
      <Card className="p-3 transition hover:bg-muted/40">
        <div className="flex gap-3">
          <EventThumbnail
            token={token}
            eventId={ev.id}
            hasSnapshot={Boolean(ev.has_snapshot)}
            className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted"
          />
          <div className="min-w-0 flex-1 py-0.5">
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 text-sm font-medium text-ink">
                {ev.message_he ?? objectClassHe(ev.object_class)}
              </p>
              <Chip tone={isNew ? "solid" : "neutral"}>{stateHe(ev.state)}</Chip>
            </div>
            <p className="mt-1 truncate text-xs text-ink-muted">
              {cameraName} · {formatDateTime(ev.started_at)}
            </p>
            {variant === "default" && ruleName && ruleName !== "—" ? (
              <p className="mt-0.5 truncate text-xs text-ink-muted">
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
    </Link>
  );
}
