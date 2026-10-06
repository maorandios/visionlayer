"use client";

import { useToast } from "@/providers/ToastProvider";

export function ToastHost() {
  const { toast } = useToast();
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed bottom-20 start-4 end-4 z-50 md:bottom-6 md:start-auto md:end-6 md:w-80">
      <div className="rounded-xl border border-border bg-ink px-4 py-3 text-sm text-surface shadow-lg">
        {toast}
      </div>
    </div>
  );
}
