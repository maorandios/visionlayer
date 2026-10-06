"use client";

import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { CatalogProvider } from "@/providers/CatalogProvider";
import { EventsProvider } from "@/providers/EventsProvider";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <CatalogProvider>
        <EventsProvider>
          <AppShell>{children}</AppShell>
        </EventsProvider>
      </CatalogProvider>
    </RequireAuth>
  );
}
