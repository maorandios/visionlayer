import { describe, expect, it } from "vitest";
import {
  DESKTOP_NAV,
  MOBILE_NAV,
  NAV_MORE,
  availableDevTools,
  isMoreActive,
  isNavActive,
} from "@/lib/navigation";
import type { HubInfo } from "@/lib/types";

const devHub: HubInfo = {
  name: "VisionLayer",
  version: "0.1.0",
  environment: "development",
  features: { simulate_detections: true, video_lab: true },
};

describe("navigation model", () => {
  it("mobile bottom nav has exactly 5 items in the product order", () => {
    expect(MOBILE_NAV.map((i) => i.label)).toEqual(["בית", "אירועים", "מצלמות", "תובנות", "עוד"]);
  });

  it("desktop sidebar lists product areas, with no dev tools mixed in", () => {
    expect(DESKTOP_NAV.map((i) => i.label)).toEqual([
      "בית",
      "אירועים",
      "מצלמות",
      "חוקים ואוטומציות",
      "תובנות",
      "הגדרות",
    ]);
    expect(DESKTOP_NAV.some((i) => i.href.startsWith("/dev/"))).toBe(false);
  });

  it("dev tools are hidden outside development or when feature flags are off", () => {
    expect(availableDevTools({ ...devHub, environment: "production" })).toEqual([]);
    expect(availableDevTools(null)).toEqual([]);
    expect(availableDevTools({ ...devHub, features: {} })).toEqual([]);
    expect(availableDevTools({ ...devHub, features: { video_lab: true } }).map((d) => d.key)).toEqual([
      "video_lab",
      "benchmarks",
    ]);
    expect(availableDevTools(devHub).map((d) => d.key)).toEqual(["video_lab", "simulate", "benchmarks"]);
  });

  it("active state: home is exact, sections match sub-routes, 'more' covers secondary areas", () => {
    const home = MOBILE_NAV[0];
    expect(isNavActive(home, "/")).toBe(true);
    expect(isNavActive(home, "/events")).toBe(false);
    expect(isNavActive(MOBILE_NAV[2], "/cameras/cam_1")).toBe(true);
    expect(isNavActive(MOBILE_NAV[2], "/camerasx")).toBe(false);
    expect(isMoreActive("/rules/new")).toBe(true);
    expect(isMoreActive("/settings")).toBe(true);
    expect(isMoreActive("/dev/video-lab")).toBe(true);
    expect(isMoreActive("/insights")).toBe(false);
    expect(isNavActive(NAV_MORE, "/more")).toBe(true);
  });
});
