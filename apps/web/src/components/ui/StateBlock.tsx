"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n/he";

export function LoadingBlock() {
  return (
    <div className="flex min-h-32 items-center justify-center text-sm text-ink-muted" aria-busy>
      {t("loading")}
    </div>
  );
}

/** Subtle skeleton placeholders — prefer over full-screen spinners. */
export function SkeletonBlock({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`} aria-busy data-testid="skeleton-block">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/80" />
      ))}
    </div>
  );
}

export function EmptyBlock({
  message,
  hint,
  action,
}: {
  message: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface/50 p-8 text-center">
      <p className="text-sm font-medium text-ink">{message}</p>
      {hint ? <p className="mt-1.5 text-xs text-ink-muted">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-danger/25 bg-danger-soft p-6 text-center">
      <p className="text-sm text-ink">{message}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          {t("retry")}
        </Button>
      ) : null}
    </div>
  );
}
