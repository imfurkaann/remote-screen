import { expect, test } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
test.use({ channel: "chrome", viewport: { width: 1600, height: 1000 } });

test("restaurant menu templates are previewed and selected from the app modal", async ({ page }) => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg: "none", typ: "JWT" })}.${encode({ role: "operator", exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
  await page.context().addCookies([
    { name: "dashboard_session", value: "e2e", url: baseUrl },
    { name: "dashboard_access_token", value: accessToken, url: baseUrl }
  ]);

  await page.goto(`${baseUrl}/apps`);
  await page.getByRole("button", { name: "Open Restaurant Menu details" }).click();

  const templates = page.getByRole("radiogroup", { name: "Restaurant menu templates" });
  await expect(templates.getByRole("radio")).toHaveCount(5);
  await expect(templates.getByRole("radio", { name: /Pizza Menu/ })).toHaveAttribute("aria-checked", "true");
  await expect(templates.getByTestId("restaurant-menu-canvas")).toHaveCount(5);

  await templates.getByRole("radio", { name: /Café/ }).click();
  await page.getByRole("button", { name: "Start with Selected Template" }).click();
  await expect(page).toHaveURL(/\/apps\/configure\?type=restaurant-menu&template=cafe$/);
  await expect(page.getByTestId("restaurant-menu-canvas")).toBeVisible();

  const sidebarBox = await page.locator(".dashboard-sidebar").boundingBox();
  const toolsBox = await page.locator(".restaurant-editor-rail").boundingBox();
  if (!sidebarBox || !toolsBox) throw new Error("Sidebar or restaurant tools rail is not visible");
  expect(Math.abs(toolsBox.x - (sidebarBox.x + sidebarBox.width))).toBeLessThanOrEqual(2);
});
