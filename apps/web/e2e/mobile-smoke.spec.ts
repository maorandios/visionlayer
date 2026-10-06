import { test, expect } from "@playwright/test";

const API = "http://127.0.0.1:8000";

async function mockApi(page: import("@playwright/test").Page) {
  const hub = {
    name: "VisionLayer",
    version: "0.1.0",
    environment: "development",
    features: { simulate_detections: true, video_lab: true },
    phase: "video-lab",
  };

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };

  const handler = async (route: import("@playwright/test").Route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: cors,
        body: JSON.stringify(body),
      });

    if (url.includes("/api/v1/auth/login") && method === "POST") {
      await json({ access_token: "test-token", token_type: "bearer" });
      return;
    }
    if (url.includes("/api/v1/auth/me")) {
      await json({ id: "u1", username: "admin", role: "admin" });
      return;
    }
    if (url.match(/\/api\/v1\/events(\?|$)/)) {
      await json([]);
      return;
    }
    if (url.endsWith("/api/v1/cameras")) {
      await json([]);
      return;
    }
    if (url.endsWith("/api/v1/rules")) {
      await json([]);
      return;
    }
    if (url === `${API}/` || url === `${API}`) {
      await json(hub);
      return;
    }
    if (url.includes("/ws/events")) {
      await route.abort();
      return;
    }
    await json({});
  };

  await page.context().route(`${API}/**`, handler);
  await page.context().route("http://localhost:8000/**", handler);
}

test.describe("mobile smoke", () => {
  test("login page is Hebrew RTL", async ({ page }) => {
    await page.goto("/login");
    const dir = await page.locator("html").getAttribute("dir");
    const lang = await page.locator("html").getAttribute("lang");
    expect(dir).toBe("rtl");
    expect(lang).toBe("he");
    await expect(page.getByRole("heading", { name: "התחברות" })).toBeVisible();
  });

  test("mocked login reaches dashboard", async ({ page }) => {
    await mockApi(page);
    await page.goto("/login");
    await page.getByLabel("שם משתמש").fill("admin");
    await page.getByLabel("סיסמה").fill("admin123");
    await page.getByRole("button", { name: "התחבר" }).click();
    await page.waitForURL("/", { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "בית" })).toBeVisible();
  });
});
