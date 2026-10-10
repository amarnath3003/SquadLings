import type { Page } from "@playwright/test";

export async function chooseSquad(page: Page, count: number) {
  const current = Number(await page.locator(".squad-selector").getAttribute("data-count"));
  const button = page.getByRole("button", { name: count > current ? "Add a bot" : "Remove a bot", exact: true });
  for (let n = 0; n < Math.abs(count - current); n++) await button.click();
}
