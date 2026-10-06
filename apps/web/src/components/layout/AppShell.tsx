"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/layout/BottomNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { ToastHost } from "@/components/ui/ToastHost";

/** Routes that take over the screen (no sidebar / bottom nav): the Rule Wizard. */
export function isFocusRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/rules\/[^/]+$/.test(pathname);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const focus = isFocusRoute(pathname);

  if (focus) {
    return (
      <div className="min-h-dvh bg-canvas" data-testid="focus-shell">
        {children}
        <ToastHost />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-canvas">
      <Sidebar />
      <div className="flex min-h-dvh flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-4 md:pb-8 md:pt-6">
          {children}
        </main>
        <BottomNav />
      </div>
      <ToastHost />
    </div>
  );
}
