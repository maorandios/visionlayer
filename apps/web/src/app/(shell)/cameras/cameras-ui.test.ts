import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { legacyCameraToOps, opsHref, parseOpsTab, OPS_TABS } from "@/components/operations/ops-url";

describe("cameras / operations UI", () => {
  it("ops URL helpers encode camera focus and primary tabs only", () => {
    expect(opsHref()).toBe("/");
    expect(opsHref("cam_1")).toBe("/?camera=cam_1");
    expect(opsHref("cam_1", "rules")).toBe("/?camera=cam_1&tab=rules");
    expect(opsHref("cam_1", "activity")).toBe("/?camera=cam_1");
    expect(parseOpsTab("zones")).toBe("activity");
    expect(parseOpsTab("overview")).toBe("activity");
    expect(parseOpsTab("metrics")).toBe("activity");
    expect(parseOpsTab("settings")).toBe("activity");
    expect(parseOpsTab("nope")).toBe("activity");
    expect(legacyCameraToOps("cam_1", "events")).toBe("/?camera=cam_1&tab=events");
    expect(legacyCameraToOps("cam_1", "settings")).toBe("/?camera=cam_1");
    expect(OPS_TABS.map((t) => t.id)).toEqual(["activity", "events", "rules"]);
    expect(OPS_TABS.map((t) => t.label)).toEqual(["פעילות", "אירועים", "חוקים"]);
  });

  it("new camera page uses the Add Camera wizard", () => {
    const src = readFileSync(resolve(__dirname, "new/page.tsx"), "utf8");
    expect(src).toContain("AddCameraWizard");
  });

  it("legacy detail route redirects into the operations workspace", () => {
    const src = readFileSync(resolve(__dirname, "[id]/page.tsx"), "utf8");
    expect(src).toContain("legacyCameraToOps");
    expect(src).toContain("router.replace");
  });

  it("zones and lines editors return to the camera rules tab in ops", () => {
    const zone = readFileSync(resolve(__dirname, "[id]/zones/new/page.tsx"), "utf8");
    const line = readFileSync(resolve(__dirname, "[id]/lines/new/page.tsx"), "utf8");
    expect(zone).toContain("/?camera=");
    expect(zone).toContain("tab=rules");
    expect(line).toContain("tab=rules");
  });
});
