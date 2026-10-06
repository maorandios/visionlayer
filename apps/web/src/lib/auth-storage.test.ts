import { beforeEach, describe, expect, it } from "vitest";
import { getStoredToken, setStoredToken } from "@/lib/auth-storage";

describe("auth storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores and reads JWT", () => {
    expect(getStoredToken()).toBeNull();
    setStoredToken("abc");
    expect(getStoredToken()).toBe("abc");
    setStoredToken(null);
    expect(getStoredToken()).toBeNull();
  });
});
