import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("cameras CRUD UI", () => {
  it("list page wires list, enable/disable, delete, and create link", () => {
    const src = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
    expect(src).toContain("api.cameras.list");
    expect(src).toContain("api.cameras.enable");
    expect(src).toContain("api.cameras.disable");
    expect(src).toContain("api.cameras.delete");
    expect(src).toContain("/cameras/new");
  });

  it("new camera page posts create", () => {
    const src = readFileSync(resolve(__dirname, "new/page.tsx"), "utf8");
    expect(src).toContain("api.cameras.create");
  });
});
