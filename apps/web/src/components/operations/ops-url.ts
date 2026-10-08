/**
 * URL helpers for the camera-first Operations workspace.
 *
 *   /                     → camera grid
 *   /?camera=<id>         → focus mode (overview)
 *   /?camera=<id>&tab=…   → focus + panel tab
 */
export type OpsTab = "overview" | "events" | "rules" | "metrics" | "settings";

export const OPS_TABS: { id: OpsTab; label: string }[] = [
  { id: "overview", label: "סקירה" },
  { id: "events", label: "אירועים" },
  { id: "rules", label: "חוקים" },
  { id: "metrics", label: "מדדים" },
  { id: "settings", label: "הגדרות" },
];

export function parseOpsTab(raw: string | null | undefined): OpsTab {
  if (raw && OPS_TABS.some((t) => t.id === raw)) return raw as OpsTab;
  return "overview";
}

export function opsHref(cameraId?: string | null, tab?: OpsTab | null): string {
  if (!cameraId) return "/";
  const params = new URLSearchParams();
  params.set("camera", cameraId);
  if (tab && tab !== "overview") params.set("tab", tab);
  return `/?${params.toString()}`;
}

/** Legacy deep links `/cameras/:id?tab=` → ops URL. */
export function legacyCameraToOps(cameraId: string, tabRaw?: string | null): string {
  return opsHref(cameraId, parseOpsTab(tabRaw));
}
