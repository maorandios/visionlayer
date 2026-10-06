import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("RTL shell", () => {
  it("root layout sets Hebrew RTL on html", () => {
    const layout = readFileSync(resolve(__dirname, "../app/layout.tsx"), "utf8");
    expect(layout).toContain('lang="he"');
    expect(layout).toContain('dir="rtl"');
  });
});
