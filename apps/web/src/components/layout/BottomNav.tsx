"use client";

import { Camera, FileText, Home, MoreHorizontal, Shield } from "lucide-react";
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

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
                  active ? "text-ink" : "text-ink-muted"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
