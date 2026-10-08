"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_NAV, NAV_MORE, isMoreActive, isNavActive } from "@/lib/navigation";

/** Mobile bottom navigation — glass floating strip. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-40 md:hidden"
      aria-label="ניווט תחתון"
      data-testid="bottom-nav"
    >
      <ul className="glass-panel grid grid-cols-5 rounded-xl pb-[env(safe-area-inset-bottom)]">
        {MOBILE_NAV.map((item) => {
          const Icon = item.icon;
          const active = item === NAV_MORE ? isMoreActive(pathname) : isNavActive(item, pathname);
          return (
            <li key={item.href + item.label}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] transition ${
                  active ? "font-medium text-accent" : "text-ink-muted"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                <span className="max-w-[4.5rem] truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
