"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  badge?: ReactNode;
};

/** Standard page header: back link → title (+badge) → subtitle, actions aligned to the end. */
export function PageHeader({ title, subtitle, actions, backHref, backLabel, badge }: Props) {
  return (
    <header className="space-y-2">
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex min-h-8 items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {backLabel ?? "חזרה"}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-ink md:text-2xl">{title}</h1>
            {badge}
          </div>
          {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
