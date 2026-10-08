"use client";

import { useToast } from "@/providers/ToastProvider";

export function ToastHost() {
  const { toast } = useToast();
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed bottom-20 start-4 end-4 z-50 md:bottom-6 md:start-auto md:right-24 md:w-80">
      <div className="glass-strong rounded-md border border-border px-4 py-3 text-sm text-ink shadow-float">
        {toast}
      </div>
    </div>
  );
}
