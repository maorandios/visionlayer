"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { BottomNav } from "@/components/layout/BottomNav";
import { DrawerMenu } from "@/components/layout/DrawerMenu";
import { TopBar } from "@/components/layout/TopBar";
import { ToastHost } from "@/components/ui/ToastHost";
import { useCatalog } from "@/providers/CatalogProvider";
import { useEvents } from "@/providers/EventsProvider";

/** Routes that take over the screen (no chrome): the Rule Wizard. */
export function isFocusRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/rules\/[^/]+$/.test(pathname);
}

/** Pages that keep a comfortable reading width (forms / settings / lists). */
function isConstrainedRoute(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname === "/" || pathname === "/cameras") return false;
  if (pathname.startsWith("/cameras/")) return false;
  return true;
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const focus = isFocusRoute(pathname);
  const constrained = isConstrainedRoute(pathname);
  const cameraFocus = (pathname === "/" || pathname === "/cameras") && Boolean(search.get("camera"));
  const [menuOpen, setMenuOpen] = useState(false);
  const { cameras } = useCatalog();
  const { events } = useEvents();

  /** True unless at least one camera is explicitly disabled. Empty/loading ≠ "partial". */
  const systemActive = useMemo(() => {
    if (cameras.length === 0) return true;
    return cameras.every((c) => c.enabled);
  }, [cameras]);

  const newEvents = useMemo(
    () => events.filter((e) => e.state === "new" && !e.source_analysis_run_id).length,
    [events],
  );

  if (focus) {
    return (
      <div className="ops-ambient flex h-dvh flex-col overflow-hidden" data-testid="focus-shell">
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        <ToastHost />
      </div>
    );
  }

  return (
    <div className="ops-ambient flex h-dvh flex-col overflow-hidden" data-testid="ops-shell">
      <TopBar systemActive={systemActive} newEvents={newEvents} onOpenMenu={() => setMenuOpen(true)} />
      <DrawerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main
        className={
          constrained
            ? "mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-y-auto px-4 pb-24 pt-2 md:pb-6 md:pt-3"
            : cameraFocus
              ? "flex min-h-0 w-full flex-1 flex-col overflow-hidden px-3 pb-20 pt-0 sm:px-4 md:pb-3 md:pt-0"
              : "min-h-0 w-full flex-1 overflow-y-auto px-3 pb-24 pt-2 sm:px-4 md:pb-6 md:pt-3"
        }
      >
        {children}
      </main>
      <BottomNav />
      <ToastHost />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="ops-ambient flex h-dvh flex-col overflow-hidden" data-testid="ops-shell">
          {children}
        </div>
      }
    >
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}
