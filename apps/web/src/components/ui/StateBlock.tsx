"use client";

import { Button } from "@/components/ui/Button";
import { t } from "@/i18n/he";

export function LoadingBlock() {
  return (
    <div className="flex min-h-32 items-center justify-center text-sm text-ink-muted">
      {t("loading")}
    </div>
  );
}

export function EmptyBlock({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-ink-muted">
      {message}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 text-center">
      <p className="text-sm text-ink">{message}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          {t("retry")}
        </Button>
      ) : null}
    </div>
  );
}
