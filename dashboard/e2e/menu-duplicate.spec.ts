import { test, expect } from "@playwright/test";
test.use({ channel: "msedge", viewport: { width: 1440, height: 1200 } });

test("text and line duplicates retain both layouts and survive save", async ({ page }) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(15000);
  await page.goto("http://localhost:3000/login");
  await page.getByLabel("E-POSTA ADRESİ").fill(process.env.E2E_EMAIL ?? "admin@remotescreen.dev");
  await page.getByLabel("ŞİFRE").fill(process.env.E2E_PASSWORD ?? "admin123");
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.waitForURL(/\/screens/);
  await page.goto("http://localhost:3000/apps/configure?type=restaurant-menu&template=snack");
  const canvas = page.getByTestId("restaurant-menu-canvas");
  const line = canvas.locator('[data-canvas-id="image:mini-pizza-line"]');
  await expect(line).toBeVisible();
  await canvas.screenshot({ path: "test-results/menu-before-duplicate.png" });
  const bounds = await line.boundingBox();
  if (!bounds) throw new Error("Line is not visible");
  await line.click({ position: { x: 10, y: bounds.height - 2 } });
  await page.getByRole("button", { name: "Seçili öğeyi kopyala", exact: true }).click();
  await expect(canvas.locator("img")).toHaveCount(15);
  const copiedLineId = await canvas.locator('[data-canvas-id][aria-pressed="true"]').getAttribute("data-canvas-id");
  const title = canvas.locator('[data-canvas-id="text:snack-title"]');
  await title.click();
  await page.keyboard.press("Control+d");
  const copiedText = canvas.locator('[data-canvas-id][aria-pressed="true"]');
  const copiedTextId = await copiedText.getAttribute("data-canvas-id");
  expect(copiedTextId).not.toBe("text:snack-title");
  await copiedText.dblclick();
  await page.getByLabel("Metni düzenle", { exact: true }).fill("Yeni başlık");
  await page.getByPlaceholder("App name...").fill("Menu duplication check");
  await expect(title).toHaveText("Snack Menu");
  const saved = page.waitForResponse(r => r.url().endsWith("/api/apps/create-app") && r.request().method() === "POST");
  await page.getByRole("button", { name: /Kaydet/ }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const { app } = await response.json();
  try {
    const config = app.appConfig;
    for (const orientation of ["portrait", "landscape"]) {
      const layouts = config.editor.layouts[orientation];
      for (const [originalId, copyId] of [["text:snack-title", copiedTextId], ["image:mini-pizza-line", copiedLineId]]) {
        const { x, y, ...style } = layouts[originalId!];
        expect(layouts[copyId!]).toEqual({ ...style, x: Math.min(100-style.width,x+2), y: Math.min(100-style.height,y+2) });
      }
    }
    await page.goto(`http://localhost:3000/apps/configure?id=${app._id}&type=restaurant-menu`);
    await expect(canvas).toContainText("Yeni başlık");
    await expect(canvas.locator("img")).toHaveCount(15);
    await page.getByRole("button", { name: "16:9", exact: true }).click();
    await expect(canvas.locator(`[data-canvas-id="${copiedLineId}"]`)).toBeVisible();
    await expect(canvas.locator(`[data-canvas-id="${copiedTextId}"]`)).toHaveText("Yeni başlık");
  } finally {
    expect((await page.request.delete(`http://localhost:3000/api/content/media/${app._id}`)).status()).toBe(204);
  }
});
