"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_NAV, NAV_MORE, isMoreActive, isNavActive } from "@/lib/navigation";

/** Mobile bottom navigation — exactly 5 items: בית · אירועים · מצלמות · תובנות · עוד */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="ניווט תחתון"
    >
      <ul className="grid grid-cols-5">
        {MOBILE_NAV.map((item) => {
          const Icon = item.icon;
          const active = item === NAV_MORE ? isMoreActive(pathname) : isNavActive(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
                  active ? "font-medium text-ink" : "text-ink-muted"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
