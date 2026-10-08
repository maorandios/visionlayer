"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { t } from "@/i18n/he";
import { DRAWER_NAV, availableDevTools, isNavActive } from "@/lib/navigation";
import { useAuth } from "@/providers/AuthProvider";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Main menu drawer — opens from the physical LEFT when the top-left menu button is pressed.
 * Not a permanent vertical rail.
 */
export function DrawerMenu({ open, onClose }: Props) {
  const pathname = usePathname();
  const { hub, user, logout } = useAuth();
  const devTools = availableDevTools(hub);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="ops-drawer">
      <button
        type="button"
        className="absolute inset-0 bg-canvas/60 backdrop-blur-[2px]"
        aria-label={t("close")}
        onClick={onClose}
      />
      <aside
        className="glass-strong absolute inset-y-0 left-0 flex w-[min(18.5rem,88vw)] flex-col rounded-e-xl"
        role="dialog"
        aria-modal="true"
        aria-label={t("navMenu")}
      >
        <div className="flex h-12 items-center justify-between px-3">
          <p className="text-sm font-semibold text-ink">{t("navMenu")}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-muted hover:text-ink"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="ניווט ראשי">
          {DRAWER_NAV.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item, pathname);
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-md px-3 text-sm transition ${
                  active
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-ink-muted hover:bg-muted hover:text-ink"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                {item.label}
              </Link>
            );
          })}

          {devTools.length > 0 ? (
            <div className="mt-4 border-t border-dashed border-border pt-3" data-testid="drawer-dev-tools">
              <p className="mb-1 px-3 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
                {t("devToolsSection")}
              </p>
              {devTools.map((tool) => {
                const Icon = tool.icon;
                const active = isNavActive(tool, pathname) && tool.key !== "benchmarks";
                return (
                  <Link
                    key={tool.key}
                    href={tool.href}
                    onClick={onClose}
                    className={`flex min-h-9 items-center gap-3 rounded-md px-3 text-sm transition ${
                      active
                        ? "bg-accent-soft font-medium text-accent"
                        : "text-ink-muted hover:bg-muted hover:text-ink"
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

        <div className="border-t border-border p-3">
          <p className="truncate text-sm text-ink">{user?.username ?? "—"}</p>
          <button
            type="button"
            onClick={() => {
              onClose();
              void logout();
            }}
            className="mt-1.5 text-sm text-ink-muted hover:text-accent"
          >
            {t("logout")}
          </button>
        </div>
      </aside>
    </div>
  );
}
