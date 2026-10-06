"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastContextValue = {
  toast: string | null;
  showToast: (message: string, ms?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string, ms = 3500) => {
    setToast(message);
    window.setTimeout(() => setToast(null), ms);
  }, []);

  const value = useMemo(() => ({ toast, showToast }), [toast, showToast]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside provider");
  return ctx;
}
