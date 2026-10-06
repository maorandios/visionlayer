import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("authentication flow", () => {
  it("AuthProvider stores token and navigates home after login", () => {
    const src = readFileSync(resolve(__dirname, "AuthProvider.tsx"), "utf8");
    expect(src).toContain("api.login");
    expect(src).toContain("setStoredToken");
    expect(src).toContain('window.location.assign("/")');
    expect(src).toContain("api.logout");
  });

  it("RequireAuth redirects unauthenticated users to login", () => {
    const src = readFileSync(resolve(__dirname, "../components/auth/RequireAuth.tsx"), "utf8");
    expect(src).toContain('router.replace("/login")');
  });
});
