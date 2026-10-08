"use client";

import { Layers, Menu } from "lucide-react";
import Link from "next/link";
import { t } from "@/i18n/he";
import type { HealthLevel } from "@/lib/system-health";

type Props = {
  systemLevel: HealthLevel;
  newEvents: number;
  onOpenMenu: () => void;
};

/**
 * Header (physical positions, independent of page RTL):
 *   LEFT  = menu icon (+ optional status)
 *   RIGHT = logo + VisionLayer
 */
export function TopBar({ systemLevel, newEvents, onOpenMenu }: Props) {
  const statusLabel =
    systemLevel === "ok"
      ? t("homeSystemActive")
      : systemLevel === "attention"
        ? t("systemAttention")
        : t("homeSystemPartial");
  const dotClass =
    systemLevel === "ok"
      ? "bg-success shadow-[0_0_6px_var(--color-success)]"
      : systemLevel === "attention"
        ? "bg-warning"
        : "bg-danger/80";

  return (
    <header
      dir="ltr"
      className="relative z-40 flex h-12 w-full shrink-0 items-center px-3 sm:px-4"
      data-testid="ops-topbar"
    >
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label={t("navMenu")}
        data-testid="ops-menu-button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-muted/60 hover:text-ink"
      >
        <Menu className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
      </button>

      <div className="ms-3 flex min-w-0 items-center gap-2.5">
        <Link
          href="/system-status"
          className="hidden items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink sm:flex"
          data-testid="ops-system-status"
          dir="rtl"
        >
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
          <span>{statusLabel}</span>
        </Link>
        {newEvents > 0 ? (
          <Link
            href="/events"
            className="rounded-md bg-accent-soft px-2 py-1 text-[11px] font-medium text-accent"
            data-testid="ops-new-events"
            dir="rtl"
          >
            {newEvents} {t("newEventsCount")}
          </Link>
        ) : null}
      </div>

      <Link
        href="/"
        className="ml-auto flex shrink-0 items-center gap-2"
        aria-label={t("appName")}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent">
          <Layers className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="text-sm font-semibold tracking-tight text-ink">{t("appName")}</span>
      </Link>
    </header>
  );
}
