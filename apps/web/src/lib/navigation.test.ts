import { describe, expect, it } from "vitest";
import {
  DRAWER_NAV,
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
  it("mobile bottom nav has exactly 5 items in camera-first order", () => {
    expect(MOBILE_NAV.map((i) => i.label)).toEqual(["מצלמות", "אירועים", "חוקים ואוטומציות", "תובנות", "עוד"]);
  });

  it("drawer lists product areas including system status, with no dev tools mixed in", () => {
    expect(DRAWER_NAV.map((i) => i.label)).toEqual([
      "מצלמות",
      "אירועים",
      "חוקים ואוטומציות",
      "תובנות",
      "מצב המערכת",
      "הגדרות",
    ]);
    expect(DRAWER_NAV.some((i) => i.href.startsWith("/dev/"))).toBe(false);
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

  it("active state: cameras home covers / and /cameras, more covers settings + dev", () => {
    const cameras = MOBILE_NAV[0];
    expect(isNavActive(cameras, "/")).toBe(true);
    expect(isNavActive(cameras, "/cameras")).toBe(true);
    expect(isNavActive(cameras, "/cameras/cam_1")).toBe(true);
    expect(isNavActive(cameras, "/events")).toBe(false);
    expect(isNavActive(MOBILE_NAV[2], "/rules/new")).toBe(true);
    expect(isMoreActive("/settings")).toBe(true);
    expect(isMoreActive("/dev/video-lab")).toBe(true);
    expect(isMoreActive("/rules")).toBe(false);
    expect(isNavActive(NAV_MORE, "/more")).toBe(true);
  });
});
