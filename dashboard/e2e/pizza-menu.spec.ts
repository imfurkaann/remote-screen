import { expect, test } from "@playwright/test";
test.use({ channel: "msedge", viewport: { width: 1440, height: 1200 } });

test("pizza template edits and removals persist through server save and reload", async ({ page }) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  await page.goto("http://localhost:3000/login");
  await page.getByLabel("E-POSTA ADRESİ").fill(process.env.E2E_EMAIL ?? "admin@remotescreen.dev");
  await page.getByLabel("ŞİFRE").fill(process.env.E2E_PASSWORD ?? "admin123");
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.waitForURL(/\/screens/);
  await page.goto("http://localhost:3000/apps/configure?type=restaurant-menu");
  const canvas = page.getByTestId("restaurant-menu-canvas");
  await expect(canvas).toContainText("PIZZA MENU");
  await expect(canvas).toContainText("Vegetariana");
  await expect(canvas.locator("img")).toHaveCount(4);
  await canvas.screenshot({ path: "test-results/pizza-template.png" });
  const title = canvas.locator('[data-canvas-id="text:title"]');
  await title.dblclick();
  await page.getByLabel("Edit text", { exact: true }).fill("HOUSE PIZZA");
  await page.getByPlaceholder("Uygulama adı...").fill("Pizza menüsü — kayıt kontrolü");
  await canvas.locator('[data-canvas-id="image:olives"]').click({ position: { x: 10, y: 10 } });
  await page.getByRole("button", { name: "Seçili öğeyi sil", exact: true }).click();
  await expect(canvas.locator("img")).toHaveCount(3);
  await page.getByRole("button", { name: "T Text", exact: true }).click();
  await page.getByRole("button", { name: "T Add text box", exact: true }).click();
  const extra = canvas.locator('[data-canvas-id^="text:text-"]').last();
  await extra.dblclick();
  await page.getByLabel("Metni düzenle", { exact: true }).fill("Yeni şirket notu");
  await page.getByPlaceholder("Uygulama adı...").click();
  const saved = page.waitForResponse(r => r.url().endsWith("/api/apps/create-app") && r.request().method() === "POST");
  await page.getByRole("button", { name: /Kaydet/ }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const result = await response.json();
  const id = result.app._id;
  expect(result.app.appConfig.editor.textElements.some((e: any) => e.text === "HOUSE PIZZA")).toBe(true);
  // A fresh navigation reads the saved app from the API, with no local draft.
  await page.goto(`http://localhost:3000/apps/configure?id=${id}&type=restaurant-menu`);
  await expect(canvas).toContainText("HOUSE PIZZA");
  await expect(canvas).toContainText("Yeni şirket notu");
  await expect(canvas.locator("img")).toHaveCount(3);
  await canvas.locator('[data-canvas-id="text:margherita-price"]').dblclick();
  await page.getByLabel("Metni düzenle", { exact: true }).fill("475₺");
  await page.getByPlaceholder("Uygulama adı...").click();
  await canvas.locator('[data-canvas-id="text:lemonade-details"]').click();
  await page.getByRole("button", { name: "Seçili öğeyi sil", exact: true }).click();
  await expect(canvas).not.toContainText("90 kcal");
  await page.getByRole("button", { name: "Uploads", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "pizza-logo-test.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGZkAAAAASUVORK5CYII=", "base64")
  });
  await page.getByTitle("pizza-logo-test.png — tasarıma ekle", { exact: true }).first().click();
  await expect(canvas.locator("img")).toHaveCount(4);
  await page.getByRole("button", { name: "Close uploads panel" }).click();
  const update = page.waitForResponse(r => r.url().includes(`/api/apps/update-app/${id}`) && r.request().method() === "PUT");
  await page.getByRole("button", { name: /Kaydet/ }).click();
  expect((await update).status()).toBe(200);
  await page.goto(`http://localhost:3000/apps/configure?id=${id}&type=restaurant-menu`);
  await expect(canvas).toContainText("475₺");
  await expect(canvas).not.toContainText("90 kcal");
  await expect(canvas.locator("img")).toHaveCount(4);
  await page.getByRole("button", { name: "16:9", exact: true }).click();
  await expect(canvas).toContainText("Vegetariana");
  await canvas.screenshot({ path: "test-results/pizza-landscape.png" });
  const render = await page.request.get(`http://localhost:4100/api/v1/apps/render/${id}`);
  expect(render.ok()).toBe(true);
  expect(await render.text()).toContain("HOUSE PIZZA");
  await page.goto(`http://localhost:4100/api/v1/apps/render/${id}`);
  await page.setViewportSize({ width: 740, height: 1046 });
  await page.screenshot({ path: "test-results/pizza-saved-render.png" });
  // Remove only the app created by this test; never touch existing company menus.
  expect((await page.request.delete(`http://localhost:3000/api/content/media/${id}`)).status()).toBe(204);
});
