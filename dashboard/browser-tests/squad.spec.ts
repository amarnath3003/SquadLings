import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { chooseSquad } from "./squad-helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/lab");
  await page.locator(".squad-selector").scrollIntoViewIfNeeded();
  mkdirSync("artifacts", { recursive: true });
});

test("only side buttons control a growing and shrinking character stack", async ({ page }) => {
  const panel = page.locator(".squad-selector");
  const add = page.getByRole("button", { name: "Add a bot", exact: true });
  const remove = page.getByRole("button", { name: "Remove a bot", exact: true });
  await expect(panel.getByRole("slider")).toHaveCount(0);
  await expect(panel.getByRole("button")).toHaveCount(2);
  await expect(remove).toBeDisabled();
  await expect(panel.locator(".squad-empty")).toBeVisible();
  await expect(page.getByRole("button", { name: "Play a sample run" })).toBeDisabled();
  await panel.screenshot({ path: "artifacts/squad-stack-empty.png" });
  let previousWidth = 0;
  for (let n = 1; n <= 5; n++) {
    await add.click();
    await expect(panel).toHaveAttribute("data-count", String(n));
    await expect(panel.locator("[data-agent]")).toHaveCount(n);
    await expect(panel.locator(".squad-count")).toContainText(String(n));
    await page.waitForTimeout(280);
    const stack = (await panel.locator(".squad-stack").boundingBox())!;
    expect(stack.width).toBeGreaterThan(previousWidth);
    previousWidth = stack.width;
    const left = (await remove.boundingBox())!;
    const right = (await add.boundingBox())!;
    expect(left.x + left.width).toBeLessThan(stack.x);
    expect(stack.x + stack.width).toBeLessThan(right.x);
    if (n === 3) await panel.screenshot({ path: "artifacts/squad-stack-three.png" });
  }
  await expect(add).toBeDisabled();
  await expect(panel).toHaveClass(/squad-powered/);
  await expect(panel.locator("canvas[data-fire=flowing]")).toHaveCount(1);
  for (const name of ["Plum", "Lime", "Tango", "Blu", "Sky"]) {
    await expect(panel.getByRole("img", { name: `${name}, focused`, exact: true })).toBeVisible();
  }
  await panel.screenshot({ path: "artifacts/squad-stack-full.png" });
  for (let n = 4; n >= 0; n--) {
    await remove.click();
    await expect(panel).toHaveAttribute("data-count", String(n));
    await expect(panel.locator("[data-agent]")).toHaveCount(n);
  }
  await expect(remove).toBeDisabled();
  await expect(panel.locator(".squad-energy")).toHaveCount(0);
});

test("keyboard activation, greetings, rapid changes and reduced motion", async ({ page }) => {
  const panel = page.locator(".squad-selector");
  const add = page.getByRole("button", { name: "Add a bot", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toHaveAttribute("data-count", "1");
  await page.keyboard.press("Space");
  await expect(panel).toHaveAttribute("data-count", "2");
  await expect(panel.locator(".assembly-message")).toContainText("Hey, Plum!");
  for (const n of [5, 0, 3, 1, 5, 0]) await chooseSquad(page, n);
  await page.waitForTimeout(800);
  await expect(panel.locator("[data-agent]")).toHaveCount(0);
  await expect(panel).toHaveAttribute("data-awake", "0");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await chooseSquad(page, 5);
  await expect(panel.locator(".squad-energy")).toHaveAttribute("data-fire", "still");
  await expect(panel.locator(".squad-stack")).toHaveCSS("transition-duration", "0s");
  // Resizing must redraw the static reduced-motion flame after its canvas resets.
  await page.setViewportSize({ width: 1440, height: 950 });
  await expect.poll(() => panel.locator(".squad-energy").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels.some((value, index) => index % 4 === 3 && value > 0);
  })).toBe(true);
  await chooseSquad(page, 0);
  await expect(panel.locator("[data-agent]")).toHaveCount(0);
});

for (const width of [390, 320]) {
  test(`mobile stack fits at ${width}px with large touch controls`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 844 });
    await chooseSquad(page, 0);
    for (let n = 0; n <= 5; n++) {
      await chooseSquad(page, n);
      const panel = page.locator(".squad-selector");
      await panel.scrollIntoViewIfNeeded();
      const stack = (await panel.locator(".squad-stack").boundingBox())!;
      const left = (await panel.locator(".squad-remove").boundingBox())!;
      const right = (await panel.locator(".squad-add").boundingBox())!;
      expect(left.width).toBeGreaterThanOrEqual(44);
      expect(right.height).toBeGreaterThanOrEqual(44);
      expect(left.x + left.width).toBeLessThanOrEqual(stack.x);
      expect(stack.x + stack.width).toBeLessThanOrEqual(right.x);
      const bounds = (await panel.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      if (width === 390)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.locator(".squad-selector").screenshot({ path: `artifacts/squad-stack-${width}.png` });
  });
}

test("empty run focuses add and launch uses exactly the selected crew", async ({ page }) => {
  await page.getByRole("button", { name: "Squad in action", exact: true }).click();
  await page.getByRole("button", { name: "Build your squad", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add a bot", exact: true })).toBeFocused();
  await chooseSquad(page, 3);
  await page.getByRole("button", { name: "Play a sample run", exact: true }).click();
  await expect(page.locator("[data-tile]")).toHaveCount(3);
  await page.getByRole("button", { name: "Character studio", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add a bot", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Remove a bot", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Squad in action", exact: true }).click();
  await page.getByRole("button", { name: "Stop sample", exact: true }).click();
});

test("leaving the selector cancels its audio and returning does not replay greetings", async ({ page }) => {
  await page.getByRole("button", { name: "Turn sound on", exact: true }).click();
  await chooseSquad(page, 4);
  await page.getByRole("button", { name: "Face gallery", exact: true }).click();
  const diagnostics = () => page.evaluate(async () =>
    (await import("/src/effects/sound.ts")).getAudioDiagnostics());
  expect((await diagnostics()).scheduled).toBe(0);
  const departed = (await diagnostics()).voices;
  await page.waitForTimeout(800);
  expect((await diagnostics()).voices).toBe(departed);
  await page.getByRole("button", { name: "Character studio", exact: true }).click();
  await page.waitForTimeout(800);
  expect((await diagnostics()).voices).toBe(departed);
});
