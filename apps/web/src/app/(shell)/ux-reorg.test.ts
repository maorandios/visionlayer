import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");

describe("UX reorganization", () => {
  it("home: status header, today summary from metrics, attention section, recent events", () => {
    const src = read("page.tsx");
    expect(src).toContain('t("dashboardTitle")');
    expect(src).toContain("home-status");
    expect(src).toContain("homeSystemActive");
    expect(src).toContain("home-today");
    expect(src).toContain("api.metrics.summary");
    expect(src).toContain("vehiclesToday");
    expect(src).toContain("peopleToday");
    expect(src).toContain("home-attention");
    expect(src).toContain("newEventsCount");
    expect(src).toContain("recentEvents");
    // production totals only — Video Lab events are excluded from the home feed
    expect(src).toContain("source_analysis_run_id");
  });

  it("navigation components consume the shared navigation model", () => {
    const sidebar = read("../../components/layout/Sidebar.tsx");
    const bottom = read("../../components/layout/BottomNav.tsx");
    expect(sidebar).toContain("DESKTOP_NAV");
    expect(sidebar).toContain("availableDevTools");
    expect(sidebar).toContain("sidebar-dev-tools");
    expect(bottom).toContain("MOBILE_NAV");
    expect(bottom).toContain("grid-cols-5");
    expect(bottom).toContain("md:hidden");
    expect(bottom).toContain("min-h-14");
  });

  it("more page: product areas first, dev tools clearly separated and flag-gated", () => {
    const src = read("more/page.tsx");
    expect(src).toContain("NAV_RULES");
    expect(src).toContain("NAV_SETTINGS");
    expect(src).toContain("availableDevTools");
    expect(src).toContain("more-dev-tools");
    expect(src).toContain("devToolsSection");
    expect(src.indexOf("productSection")).toBeLessThan(src.indexOf("more-dev-tools"));
  });

  it("settings page is grouped into the five product sections", () => {
    const src = read("settings/page.tsx");
    for (const key of ["settingsSystem", "settingsNotifications", "settingsStorage", "settingsUsers", "settingsAbout"]) {
      expect(src).toContain(key);
    }
    expect(src).toContain("features.push_notifications");
    expect(src).toContain("settingsComingSoon");
  });

  it("rules page: human-readable cards, filters, no window.confirm", () => {
    const src = read("rules/page.tsx");
    expect(src).toContain("RuleCard");
    expect(src).toContain("describeRule");
    expect(src).toContain("rules-filters");
    expect(src).toContain("filterActive");
    expect(src).toContain("filterDisabled");
    expect(src).toContain("TRIGGER_FILTERS");
    expect(src).toContain("ConfirmDialog");
    expect(src).not.toContain("confirm(");
    const card = read("../../components/rules/RuleCard.tsx");
    expect(card).toContain('t("when")');
    expect(card).toContain('t("actionLabel")');
  });

  it("insights page: KPI cards, one trend chart, breakdowns, scope toggle only in dev", () => {
    const src = read("insights/page.tsx");
    expect(src).toContain("insights-kpis");
    expect(src).toContain("KpiCard");
    expect(src).toContain("avgDwell");
    expect(src).toContain("insights-trend");
    expect(src).toContain("BarChart");
    expect(src).toContain("entriesByHour");
    expect(src).toContain("insights-breakdown");
    expect(src).toContain("byCamera");
    expect(src).toContain("byClass");
    expect(src).toContain("byZone");
    expect(src).toContain("isDevEnvironment");
    expect(src).toContain("insights-scope");
    expect(src).toContain("api.metrics.timeseries");
    expect(src).toContain("api.metrics.breakdown");
  });

  it("dev pages are badged as development tools and Video Lab shows per-run metrics", () => {
    const lab = read("dev/video-lab/page.tsx");
    expect(lab).toContain("devToolBadge");
    expect(lab).toContain("RunMetrics");
    const run = read("../../components/video-lab/RunMetrics.tsx");
    expect(run).toContain('scope: "video_lab"');
    expect(run).toContain("analysis_run_id");
  });

  it("shared primitives exist and respect touch targets", () => {
    const button = read("../../components/ui/Button.tsx");
    expect(button).toContain("min-h-11");
    const tabs = read("../../components/ui/Tabs.tsx");
    expect(tabs).toContain("min-h-11");
    expect(tabs).toContain("overflow-x-auto");
    for (const f of ["PageHeader", "Chip", "SectionHeader", "KpiCard", "ConfirmDialog", "BarChart"]) {
      expect(read(`../../components/ui/${f}.tsx`).length).toBeGreaterThan(0);
    }
  });
});
