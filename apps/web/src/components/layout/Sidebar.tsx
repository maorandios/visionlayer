"use client";

import { Camera, FileText, Home, Layers, MoreHorizontal, Shield } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/i18n/he";

const items = [
  { href: "/", label: t("navHome"), icon: Home },
  { href: "/events", label: t("navEvents"), icon: FileText },
  { href: "/cameras", label: t("navCameras"), icon: Camera },
  { href: "/rules", label: t("navRules"), icon: Shield },
  { href: "/more", label: t("navMore"), icon: MoreHorizontal },
];

export function Sidebar() {
  const pathname = usePathname();
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
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                active ? "bg-muted font-medium text-ink" : "text-ink-muted hover:bg-muted/60"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
