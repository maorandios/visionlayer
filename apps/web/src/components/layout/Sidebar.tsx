"use client";

import { Layers } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/i18n/he";
import { DESKTOP_NAV, availableDevTools, isNavActive } from "@/lib/navigation";
import { useAuth } from "@/providers/AuthProvider";

export function Sidebar() {
  const pathname = usePathname();
  const { hub } = useAuth();
  const devTools = availableDevTools(hub);

  return (
    <aside className="hidden w-64 shrink-0 border-e border-border bg-surface md:flex md:flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-surface">
          <Layers className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">{t("appName")}</p>
          <p className="text-xs text-ink-muted">{t("tagline")}</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="ניווט ראשי">
        {DESKTOP_NAV.map((item) => {
          const Icon = item.icon;
          const active = isNavActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm ${
                active ? "bg-muted font-medium text-ink" : "text-ink-muted hover:bg-muted/60"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {item.label}
            </Link>
          );
        })}

        {devTools.length > 0 ? (
          <div className="mt-6 border-t border-dashed border-border pt-4" data-testid="sidebar-dev-tools">
            <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              {t("devToolsSection")}
            </p>
            {devTools.map((tool) => {
              const Icon = tool.icon;
              const active = isNavActive(tool, pathname) && tool.key !== "benchmarks";
              return (
                <Link
                  key={tool.key}
                  href={tool.href}
                  className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm ${
                    active ? "bg-muted font-medium text-ink" : "text-ink-muted hover:bg-muted/60"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {tool.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </nav>
    </aside>
  );
}
