/**
 * Single source of truth for product navigation.
 *
 * Camera-first mental model:
 *   מצלמות (operations home) · אירועים · חוקים ואוטומציות · תובנות · הגדרות
 *   + separated "כלי פיתוח" (Video Lab, Simulation, Benchmark history)
 *
 * Mobile bottom nav is limited to 5 items; Settings + Dev live under "עוד".
 */
import {
  Activity,
  BarChart3,
  Camera,
  FlaskConical,
  Bell,
  History,
  type LucideIcon,
  MoreHorizontal,
  Settings,
  Workflow,
} from "lucide-react";
import type { HubInfo } from "@/lib/types";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** When true the item is "active" only on an exact match (used for "/"). */
  exact?: boolean;
};

/** Primary operations home — camera grid / focus workspace. */
export const NAV_CAMERAS: NavItem = { href: "/", label: "מצלמות", icon: Camera, exact: true };
export const NAV_EVENTS: NavItem = { href: "/events", label: "אירועים", icon: Bell };
export const NAV_RULES: NavItem = { href: "/rules", label: "חוקים ואוטומציות", icon: Workflow };
export const NAV_INSIGHTS: NavItem = { href: "/insights", label: "תובנות", icon: BarChart3 };
export const NAV_SETTINGS: NavItem = { href: "/settings", label: "הגדרות", icon: Settings };
export const NAV_SYSTEM_STATUS: NavItem = {
  href: "/system-status",
  label: "מצב המערכת",
  icon: Activity,
};
export const NAV_MORE: NavItem = { href: "/more", label: "עוד", icon: MoreHorizontal };

/** Mobile bottom navigation — max 5 items. */
export const MOBILE_NAV: NavItem[] = [NAV_CAMERAS, NAV_EVENTS, NAV_RULES, NAV_INSIGHTS, NAV_MORE];

/** Global drawer / desktop menu — product areas (no permanent sidebar). */
export const DRAWER_NAV: NavItem[] = [
  NAV_CAMERAS,
  NAV_EVENTS,
  NAV_RULES,
  NAV_INSIGHTS,
  NAV_SYSTEM_STATUS,
  NAV_SETTINGS,
];

/** @deprecated use DRAWER_NAV — kept as alias for transitional imports. */
export const DESKTOP_NAV = DRAWER_NAV;

export type DevTool = NavItem & { hint: string; key: "video_lab" | "simulate" | "benchmarks" };

export const DEV_TOOLS: DevTool[] = [
  {
    key: "video_lab",
    href: "/dev/video-lab",
    label: "מעבדת וידאו",
    hint: "העלאת MP4 → זיהוי אמיתי → אזורים → חוקים → אירועים ומדדים",
    icon: FlaskConical,
  },
  {
    key: "simulate",
    href: "/dev/simulate",
    label: "סימולציה",
    hint: "הזרקת זיהויים מדומים לבדיקת חוקים ואירועים",
    icon: FlaskConical,
  },
  {
    key: "benchmarks",
    href: "/dev/video-lab?view=history",
    label: "היסטוריית benchmark",
    hint: "הרצות ניתוח שמורות, בדיקת דיוק ו-False Positives",
    icon: History,
  },
];

/** Dev tools are visible only in a development environment and only when the matching feature flag is on. */
export function isDevEnvironment(hub: HubInfo | null | undefined): boolean {
  const env = hub?.environment;
  return env === "development" || env === "dev" || env === "local";
}

export function availableDevTools(hub: HubInfo | null | undefined): DevTool[] {
  if (!isDevEnvironment(hub)) return [];
  const features = hub?.features ?? {};
  return DEV_TOOLS.filter((tool) => {
    if (tool.key === "simulate") return features.simulate_detections === true;
    return features.video_lab === true;
  });
}

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.exact) {
    // Cameras home also treats legacy /cameras paths as active.
    if (item.href === "/") return pathname === "/" || pathname === "/cameras" || pathname.startsWith("/cameras/");
    return pathname === item.href;
  }
  const base = item.href.split("?")[0];
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** The "more" tab on mobile is active for Settings + Dev (Rules is now a primary tab). */
export function isMoreActive(pathname: string): boolean {
  return (
    isNavActive(NAV_MORE, pathname) ||
    isNavActive(NAV_SETTINGS, pathname) ||
    isNavActive(NAV_SYSTEM_STATUS, pathname) ||
    pathname.startsWith("/dev/")
  );
}
