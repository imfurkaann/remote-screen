import { expect, test } from "@playwright/test";
import { renderClockHtml } from "../../backend/src/routes/apps.route";

test.use({ channel: "chrome" });
for (const layout of ["digital", "analog", "split"] as const) {
  for (const portrait of [false, true]) {
    test(`published ${layout} clock ${portrait ? "portrait" : "landscape"}`, async ({ page }) => {
      await page.setViewportSize(portrait ? { width:900, height:1600 } : { width:1600, height:900 });
      await page.clock.install({ time:new Date("2026-09-15T15:30:00Z") });
      await page.setContent(renderClockHtml("Office Clock", { layout, heading:"HEAD OFFICE", caption:"Welcome", timezone:"Asia/Tokyo", format:"24h", theme:"warm", primaryColor:"#ff0000" }));
      await expect(page.locator("#hour")).toHaveText("00");
      await expect(page.locator("#minute")).toHaveText("30");
      await expect(page.locator(".clock-heading")).toHaveText("HEAD OFFICE");
      await expect(page.locator("body")).toHaveClass("theme-paper");
      const caption = await page.locator(".clock-caption").boundingBox();
      expect(caption!.y + caption!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
      await page.screenshot({ path:`test-results/clock-output-${layout}-${portrait ? "portrait" : "landscape"}.png` });
    });
  }
}
