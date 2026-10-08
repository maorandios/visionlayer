/**
 * URL helpers for the camera-first Operations workspace.
 *
 *   /                     → camera grid
 *   /?camera=<id>         → focus mode (activity)
 *   /?camera=<id>&tab=…   → focus + panel tab
 */
export type OpsTab = "activity" | "events" | "rules";

export const OPS_TABS: { id: OpsTab; label: string }[] = [
  { id: "activity", label: "פעילות" },
  { id: "events", label: "אירועים" },
  { id: "rules", label: "חוקים" },
];

/** Legacy tab ids from older deep links. */
const LEGACY_TAB_MAP: Record<string, OpsTab> = {
  overview: "activity",
  metrics: "activity",
  settings: "activity",
  zones: "activity",
  activity: "activity",
  events: "events",
  rules: "rules",
};

export function parseOpsTab(raw: string | null | undefined): OpsTab {
  if (!raw) return "activity";
  if (OPS_TABS.some((t) => t.id === raw)) return raw as OpsTab;
  return LEGACY_TAB_MAP[raw] ?? "activity";
}

export function opsHref(cameraId?: string | null, tab?: OpsTab | null): string {
  if (!cameraId) return "/";
  const params = new URLSearchParams();
  params.set("camera", cameraId);
  if (tab && tab !== "activity") params.set("tab", tab);
  return `/?${params.toString()}`;
}

/** Legacy deep links `/cameras/:id?tab=` → ops URL. */
export function legacyCameraToOps(cameraId: string, tabRaw?: string | null): string {
  return opsHref(cameraId, parseOpsTab(tabRaw));
}
