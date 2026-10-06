import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("cameras UI", () => {
  it("list page shows cards with counts, enable/disable, and create link", () => {
    const src = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
    expect(src).toContain("api.cameras.list");
    expect(src).toContain("api.cameras.enable");
    expect(src).toContain("api.cameras.disable");
    expect(src).toContain("/cameras/new");
    expect(src).toContain("zonesForCamera");
    expect(src).toContain("rulesForCamera");
    expect(src).toContain("isVirtualCamera");
    expect(src).toContain("devSourceBadge");
    // destructive delete moved into the camera workspace settings tab
    expect(src).not.toContain("api.cameras.delete");
    expect(src).not.toContain("confirm(");
  });

  it("new camera page posts create", () => {
    const src = readFileSync(resolve(__dirname, "new/page.tsx"), "utf8");
    expect(src).toContain("api.cameras.create");
  });

  it("camera workspace has the six product tabs and a confirm dialog for delete", () => {
    const src = readFileSync(resolve(__dirname, "[id]/page.tsx"), "utf8");
    for (const key of [
      "cameraOverview",
      "cameraZonesLines",
      "cameraRules",
      "cameraEvents",
      "cameraMetrics",
      "cameraSettings",
    ]) {
      expect(src).toContain(`t("${key}")`);
    }
    expect(src).toContain('search.get("tab")');
    expect(src).toContain("api.cameras.delete");
    expect(src).toContain("ConfirmDialog");
    expect(src).not.toContain("confirm(");
    expect(src).toContain("api.metrics.summary");
    expect(src).toContain("RuleCard");
    expect(src).toContain("EventCard");
  });
});
