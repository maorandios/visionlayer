import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
const root = join(__dirname, "..", "..", "..");

describe("camera-first operations UX", () => {
  it("home is the Operations workspace (not a KPI dashboard)", () => {
    const src = read("page.tsx");
    expect(src).toContain("OperationsWorkspace");
    expect(src).not.toContain("home-today");
    expect(src).not.toContain("dashboardTitle");
  });

  it("shell uses borderless top bar + left drawer menu (no permanent rail)", () => {
    const shell = read("../../components/layout/AppShell.tsx");
    expect(shell).toContain("TopBar");
    expect(shell).toContain("DrawerMenu");
    expect(shell).not.toContain("SideRail");
    expect(shell).toContain("ops-shell");
    expect(shell).not.toContain("Sidebar");
    expect(shell).toContain("BottomNav");
    expect(shell).toContain("h-dvh");
    expect(shell).toContain("overflow-hidden");
    const top = read("../../components/layout/TopBar.tsx");
    expect(top).toContain("ops-topbar");
    expect(top).toContain("ops-menu-button");
    expect(top).not.toContain("border border-border");
    expect(top).toContain("ml-auto");
    expect(top).toContain('dir="ltr"');
    const drawer = read("../../components/layout/DrawerMenu.tsx");
    expect(drawer).toContain("DRAWER_NAV");
    expect(drawer).toContain("drawer-dev-tools");
    expect(drawer).toContain("left-0");
  });

  it("operations workspace: grid, focus, panel tabs", () => {
    const ops = read("../../components/operations/OperationsWorkspace.tsx");
    expect(ops).toContain("ops-workspace");
    expect(ops).toContain("ops-focus");
    expect(ops).not.toContain("ops-camera-strip");
    expect(ops).not.toContain("ops-back-grid");
    expect(ops).toContain('search.get("camera")');
    expect(ops).toContain("opsHref");
    expect(ops).toContain("CameraOpsPanel");
    expect(ops).toContain("CameraStage");
    expect(ops).toContain('dir="ltr"');
    expect(ops).toContain("lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,1fr)]");
    expect(ops).toContain("overflow-hidden");

    const panel = read("../../components/operations/CameraOpsPanel.tsx");
    for (const id of ["activity", "events", "rules"]) {
      expect(panel).toContain(`"${id}"`);
    }
    expect(panel).not.toContain('"metrics"');
    expect(panel).not.toContain('"zones"');
    expect(panel).not.toContain('tab === "settings"');
    expect(panel).toContain("ActivityPanel");
    expect(panel).toContain("camera-overflow-menu");
    expect(panel).toContain("rule-create");
    expect(panel).toContain("ops-panel-back");
    expect(panel).toContain("EventDetailView");
    expect(panel).toContain("RuleWizard");
    expect(panel).toContain("embedded");
    expect(panel).not.toContain("camera-tab-zones");
    expect(panel).not.toContain("CameraMetricsPanel");
    expect(panel).not.toContain("activityToday");
    expect(panel).toContain("fullWidth");
    expect(panel).not.toContain(`/rules/new?cameraId=`);
    expect(read("../../components/operations/ops-url.ts")).toContain('label: "פעילות"');
    expect(read("../../components/operations/ActivityPanel.tsx")).toContain("camera-tab-activity");
    expect(read("../../components/operations/ActivityPanel.tsx")).toContain("MetricWizard");
    expect(read("../../components/metrics/wizard/MetricWizard.tsx")).toContain("metric-wizard");
    expect(read("../../lib/vision-capabilities.ts")).toContain("VEHICLE_CLASSES");

    const stage = read("../../components/operations/CameraStage.tsx");
    expect(stage).toContain("ops-camera-stage");

    const card = read("../../components/operations/CameraOpsCard.tsx");
    expect(card).toContain("ops-camera-card");
    expect(card).toContain("aspect-video");
  });

  it("legacy camera routes redirect into ops focus", () => {
    const detail = read("cameras/[id]/page.tsx");
    expect(detail).toContain("legacyCameraToOps");
    expect(detail).toContain("router.replace");
    const list = read("cameras/page.tsx");
    expect(list).toContain("OperationsWorkspace");
  });

  it("more page keeps settings + flag-gated dev tools (rules are primary nav)", () => {
    const src = read("more/page.tsx");
    expect(src).toContain("NAV_SETTINGS");
    expect(src).toContain("availableDevTools");
    expect(src).toContain("more-dev-tools");
    expect(src).not.toContain("NAV_RULES");
  });

  it("insights / rules / settings pages remain available", () => {
    expect(read("insights/page.tsx")).toContain("insights-kpis");
    expect(read("rules/page.tsx")).toContain("RuleCard");
    expect(read("settings/page.tsx")).toContain("settingsSystem");
  });

  it("ops-url helpers are pure and cover deep links", () => {
    const src = read("../../components/operations/ops-url.ts");
    expect(src).toContain("opsHref");
    expect(src).toContain("parseOpsTab");
    expect(src).toContain("legacyCameraToOps");
    expect(src).toContain('"activity"');
    expect(src).not.toContain('id: "metrics"');
  });

  it("shared primitives still exist", () => {
    for (const f of ["Button", "Tabs", "Chip", "KpiCard", "ConfirmDialog", "BarChart"]) {
      expect(existsSync(join(root, "src/components/ui", `${f}.tsx`))).toBe(true);
    }
  });
});
