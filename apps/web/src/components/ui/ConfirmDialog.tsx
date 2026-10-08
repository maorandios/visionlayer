"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n/he";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
};

/** Modal confirm — glass surface, restrained radius. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-canvas/70 p-3 backdrop-blur-sm md:items-center"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="glass-strong w-full max-w-sm rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-base font-semibold text-ink">
          {title}
        </h2>
        {description ? <p className="mt-2 text-sm text-ink-muted">{description}</p> : null}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel ?? t("delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}
