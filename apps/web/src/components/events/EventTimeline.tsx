"use client";

import Link from "next/link";
import { ChevronLeft, UserRound } from "lucide-react";
import { useMemo } from "react";
import { EmptyBlock } from "@/components/ui/StateBlock";
import {
  eventTitle,
  eventTypeIcon,
  formatEventTime,
  groupEventsByDate,
} from "@/lib/event-timeline";
import { objectClassHe } from "@/lib/format";
import type { EventItem } from "@/lib/types";

type Props = {
  events: EventItem[];
  emptyMessage: string;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
  /** Global feed shows muted camera name under the title. */
  showCamera?: boolean;
  cameraName?: (id: string) => string;
  ruleName?: (id: string | null | undefined) => string;
  /** Prefer for ops panel (in-place detail). */
  onSelect?: (eventId: string) => void;
  /** Prefer for standalone feeds. */
  hrefFor?: (event: EventItem) => string;
  /** Compact skeleton when loading with no data yet. */
  loading?: boolean;
};

/**
 * Chronological Events timeline — continuous spine, node icons, scan-friendly rows.
 * Inspired by operational feed patterns: axis · content · chevron (RTL).
 */
export function EventTimeline({
  events,
  emptyMessage,
  emptyHint,
  emptyAction,
  showCamera = false,
  cameraName,
  ruleName,
  onSelect,
  hrefFor,
  loading = false,
}: Props) {
  const groups = useMemo(() => groupEventsByDate(events), [events]);

  if (loading && events.length === 0) {
    return <TimelineSkeleton />;
  }

  if (events.length === 0) {
    return <EmptyBlock message={emptyMessage} hint={emptyHint} action={emptyAction} />;
  }

  return (
    <div className="space-y-6" data-testid="event-timeline">
      {groups.map((g) => (
        <section key={g.key}>
          <h3 className="mb-3 pe-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {g.label}
          </h3>

          {/* Continuous spine column — feels like a real timeline */}
          <ul className="relative ms-3 border-s border-white/12 ps-0">
            {g.events.map((ev) => {
              const Icon = eventTypeIcon(ev.type);
              const title = eventTitle(ev, objectClassHe(ev.object_class));
              const time = formatEventTime(ev.started_at);
              const cam = showCamera && cameraName ? cameraName(ev.camera_id) : null;
              const rule =
                ruleName && ev.rule_id
                  ? (() => {
                      const n = ruleName(ev.rule_id);
                      return n && n !== "—" ? n : null;
                    })()
                  : null;
              const secondary = cam ?? (rule ? rule : null);

              const row = (
                <>
                  {/* Node on the spine */}
                  <span
                    className="absolute -start-[0.8125rem] top-4 z-[1] flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-full border border-accent/35 bg-[var(--color-surface-raised,#12151c)] text-accent shadow-[0_0_0_3px_rgba(5,6,8,0.92)]"
                    aria-hidden
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>

                  <span className="flex min-w-0 flex-1 items-start gap-3 ps-5 pe-1">
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[11px] tabular-nums text-ink-muted">{time}</span>
                        <span className="h-1 w-1 rounded-full bg-accent/70" aria-hidden />
                        <span className="text-[11px] text-ink-faint">{typeLabelHe(ev.type)}</span>
                      </span>
                      <span className="block text-[15px] font-semibold leading-snug text-ink">{title}</span>
                      {secondary ? (
                        <span className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
                          <UserRound className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={1.75} aria-hidden />
                          <span className="truncate">{secondary}</span>
                        </span>
                      ) : null}
                    </span>
                    <ChevronLeft
                      className="mt-5 h-4 w-4 shrink-0 text-ink-faint opacity-70"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  </span>
                </>
              );

              const className =
                "relative block w-full py-4 text-start transition hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 rounded-e-md";

              return (
                <li key={ev.id} className="relative">
                  {onSelect ? (
                    <button
                      type="button"
                      className={className}
                      data-testid="event-timeline-row"
                      onClick={() => onSelect(ev.id)}
                    >
                      {row}
                    </button>
                  ) : (
                    <Link
                      href={hrefFor?.(ev) ?? `/events/${ev.id}`}
                      className={className}
                      data-testid="event-timeline-row"
                    >
                      {row}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function typeLabelHe(type: string): string {
  switch (type) {
    case "zone_enter":
      return "כניסה";
    case "zone_exit":
      return "יציאה";
    case "line_cross":
      return "חציית קו";
    case "dwell":
      return "שהייה";
    case "count_threshold":
      return "ספירה";
    case "zone_presence":
    case "presence":
      return "נוכחות";
    default:
      return "אירוע";
  }
}

function TimelineSkeleton() {
  return (
    <div className="ms-3 space-y-0 border-s border-white/10" data-testid="event-timeline-skeleton" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="relative py-4 ps-5">
          <div className="absolute -start-[0.7rem] top-5 h-5 w-5 animate-pulse rounded-full bg-white/8" />
          <div className="mb-2 h-2.5 w-16 animate-pulse rounded bg-white/5" />
          <div className="h-3.5 w-3/4 max-w-[14rem] animate-pulse rounded bg-white/8" />
          <div className="mt-2 h-2.5 w-28 animate-pulse rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}
