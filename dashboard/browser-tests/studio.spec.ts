import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
test.beforeEach(async ({ page }) => {
  await page.goto("/lab");
});
test("studio, slider keyboard, fast scrubbing, and expression preview", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByRole("heading", { name: "Little circles. Big personalities." }),
  ).toBeVisible();
  const slider = page.getByRole("slider", { name: "Squad size" });
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveValue("1");
  await page.keyboard.press("End");
  await expect(slider).toHaveValue("5");
  await page.keyboard.press("PageDown");
  await expect(slider).toHaveValue("4");
  for (const n of [1, 5, 1, 5, 2, 5]) await slider.fill(String(n));
  await expect(page.locator(".seat:not(.seat-empty)")).toHaveCount(5);
  await page.getByRole("button", { name: "Meet Lime" }).click();
  await expect(page.locator(".personality-name h2")).toHaveText("Lime");
  await page.getByRole("button", { name: "Curious", exact: true }).click();
  await expect(page.locator(".personality-preview [role=img]")).toHaveAttribute(
    "aria-label",
    "Lime, curious",
  );
  mkdirSync("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/studio.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("gallery includes all 50 faces and can use a busy background", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Face gallery", exact: true }).click();
  await expect(page.locator(".matrix-face")).toHaveCount(50);
  await page.getByRole("button", { name: "Busy background" }).click();
  await expect(page.locator(".face-matrix")).toHaveClass(/busy-background/);
  await page.screenshot({ path: "artifacts/faces.png", fullPage: true });
});
test("full sample completes with five reports and no browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Squad in action" }).click();
  await page.getByLabel("Speed").selectOption("4");
  await page.getByLabel("8 fps load streams").check();
  await page
    .getByRole("button", { name: "Play sample run", exact: true })
    .click();
  await expect(page.locator("[data-tile]")).toHaveCount(5);
  await page.screenshot({ path: "artifacts/run.png", fullPage: true });
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("5 shared findings")).toBeVisible();
  await page
    .getByRole("button", { name: "Back to the squad", exact: true })
    .click();
  await expect(page.locator(".status-finished")).toHaveCount(5);
  expect(errors).toEqual([]);
});
test("OS reduced motion disables float and particles, and mobile mapping works", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.getByRole("button", { name: "Reduced motion" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Squad in action" }).click();
  await page.getByLabel("Speed").selectOption("4");
  await page.getByLabel("Mobile Tango (next run)").check();
  await page
    .getByRole("button", { name: "Play sample run", exact: true })
    .click();
  await expect(page.locator(".phone-screen")).toHaveCount(1);
  const animation = await page
    .locator('[data-tile="bot1"] .idle-float')
    .count();
  expect(animation).toBe(0);
  await expect(page.locator(".flight")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/mobile-run.png", fullPage: true });
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".performance-meter")).toContainText(
    "0/60 particles",
  );
});
test("mobile studio has no document-level horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("slider")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/mobile-studio.png",
    fullPage: true,
  });
});

test("manual approvals resolve and reset cancels scheduled actions", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Squad in action" }).click();
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".approval-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Approve example", exact: true })
    .click();
  await expect(page.locator(".approval-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Click", exact: true }).click();
  await page.getByRole("button", { name: "Reset playground" }).click();
  await page.waitForTimeout(1000);
  await expect(page.locator("[data-tile]")).toHaveCount(0);
});

test("pointer and ripple land within 2px on desktop and mobile", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Squad in action" }).click();
  for (const id of ["bot1", "bot3"]) {
    if (id === "bot3") await page.getByLabel("Mobile Tango (next run)").check();
    await page.getByLabel("Send an event to").selectOption(id);
    await page.getByRole("button", { name: "Click", exact: true }).click();
    const tile = page.locator(`[data-tile="${id}"]`);
    await expect(tile.locator("[data-ripple]").last()).toBeAttached();
    const error = await tile.evaluate((element) => {
      const viewport = element.querySelector<HTMLElement>(".tile-viewport")!,
        rect = viewport.getBoundingClientRect();
      const actor = element
          .querySelector("[data-actor]")!
          .getBoundingClientRect(),
        ripple = element
          .querySelector("[data-ripple]")!
          .getBoundingClientRect();
      const x = rect.x + viewport.clientLeft + viewport.clientWidth * 0.45,
        y = rect.y + viewport.clientTop + viewport.clientHeight * 0.42;
      return {
        pointer: Math.hypot(actor.x - x, actor.y - y),
        ripple: Math.hypot(
          ripple.x + ripple.width / 2 - x,
          ripple.y + ripple.height / 2 - y,
        ),
      };
    });
    expect(error.pointer).toBeLessThanOrEqual(2);
    expect(error.ripple).toBeLessThanOrEqual(2);
  }
});

test("a smaller plan benches the spare bot and the result dialog traps focus", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Squad in action" }).click();
  await page.getByLabel("Speed").selectOption("4");
  await page.getByLabel("Leave last bot on bench").check();
  await page
    .getByRole("button", { name: "Play sample run", exact: true })
    .click();
  await expect(page.getByText("Not needed for this plan")).toBeVisible();
  await expect(page.locator("[data-tile]")).toHaveCount(4);
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Back to the squad", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("one bot event does not render another bot tile", async ({ page }) => {
  await page.getByRole("button", { name: "Squad in action" }).click();
  for (const id of ["bot1", "bot2"]) {
    await page.getByLabel("Send an event to").selectOption(id);
    await page.getByRole("button", { name: "Read", exact: true }).click();
  }
  await page.waitForTimeout(1100);
  await page.getByLabel("Send an event to").selectOption("bot1");
  const before = {
    bot1: Number(
      await page
        .locator('[data-tile="bot1"]')
        .getAttribute("data-render-count"),
    ),
    bot2: Number(
      await page
        .locator('[data-tile="bot2"]')
        .getAttribute("data-render-count"),
    ),
  };
  await page.getByRole("button", { name: "Found", exact: true }).click();
  await page.waitForTimeout(200);
  const after = {
    bot1: Number(
      await page
        .locator('[data-tile="bot1"]')
        .getAttribute("data-render-count"),
    ),
    bot2: Number(
      await page
        .locator('[data-tile="bot2"]')
        .getAttribute("data-render-count"),
    ),
  };
  expect(after.bot1).toBeGreaterThan(before.bot1);
  expect(after.bot2).toBe(before.bot2);
});
