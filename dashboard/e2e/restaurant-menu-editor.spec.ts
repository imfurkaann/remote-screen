import { expect, test } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

test("restaurant menu blocks can be selected, moved, resized and kept per orientation", async ({ page }) => {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("E-POSTA ADRESİ").fill("operator@remotescreen.dev");
  await page.getByLabel("ŞİFRE").fill("operator123");
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await page.waitForURL(/\/screens/);

  await page.goto(`${baseUrl}/apps/configure?type=restaurant-menu`);
  const heading = page.getByRole("button", { name: "Menü başlığı metin bloğu" });
  await expect(heading).toBeVisible();
  await heading.click();
  await expect(page.getByRole("button", { name: "Yazıyı büyüt" })).toBeVisible();

  const before = await heading.boundingBox();
  if (!before) throw new Error("Menu heading does not have a visible bounding box");
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 32, before.y + before.height / 2 + 18, { steps: 5 });
  await page.mouse.up();
  const moved = await heading.boundingBox();
  expect(moved?.x).toBeGreaterThan(before.x + 20);
  expect(moved?.y).toBeGreaterThan(before.y + 10);

  const resizeHandle = page.getByTestId("resize-heading");
  const handleBox = await resizeHandle.boundingBox();
  if (!handleBox || !moved) throw new Error("Heading resize handle is not visible");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 28, handleBox.y + handleBox.height / 2 + 12, { steps: 4 });
  await page.mouse.up();
  const resized = await heading.boundingBox();
  expect(resized?.width).toBeGreaterThan(moved.width + 18);

  await page.getByRole("button", { name: "9:16" }).click();
  await expect(page.getByRole("button", { name: "Menü başlığı metin bloğu" })).toBeVisible();
  await page.getByRole("button", { name: "16:9" }).click();
  const restored = await heading.boundingBox();
  expect(restored?.x).toBeGreaterThan(before.x + 20);

  await page.getByTestId("restaurant-menu-canvas").screenshot({ path: "test-results/restaurant-menu-editor.png" });
});
