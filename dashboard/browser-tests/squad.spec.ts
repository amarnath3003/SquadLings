import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

test.beforeEach(async ({ page }) => {
  await page.goto("/lab");
  await page.locator(".squad-selector").scrollIntoViewIfNeeded();
});

test("empty squad wakes in place and new neighbors look at each other", async ({
  page,
}) => {
  const panel = page.locator(".squad-selector");
  const slider = page.getByRole("slider", { name: "Squad size" });
  await expect(slider).toHaveValue("0");
  await expect(slider).toHaveAttribute("min", "0");
  await expect(panel.locator('[data-state="asleep"]')).toHaveCount(5);
  await expect(panel.getByRole("button", { name: /Boop/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Play a sample run" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Remove a bot" }),
  ).toBeDisabled();
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  const plum = panel.locator('[data-agent="bot1"]');
  await expect(plum).toHaveAttribute("data-state", "awake");
  await expect(panel.locator('[data-state="asleep"]')).toHaveCount(4);
  await expect(plum.locator(".agent-body")).toHaveCSS(
    "animation-name",
    "agent-awaken",
  );
  await expect(
    page.getByRole("button", { name: "Play a sample run" }),
  ).toBeEnabled();
  await page.keyboard.press("ArrowRight");
  const lime = panel.locator('[data-agent="bot2"]');
  await expect(panel.locator(".assembly-message")).toContainText("Hey, Plum!");
  await expect(plum.locator(".neighbor-reply")).toHaveText("You found us.");
  const gaze = async (selector: string) =>
    panel
      .locator(selector)
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
  await expect
    .poll(() => gaze('[data-agent="bot1"] [data-gaze]'))
    .toBeGreaterThan(2.5);
  await expect
    .poll(() => gaze('[data-agent="bot2"] [data-gaze]'))
    .toBeLessThan(-2.5);
  // Pointer tracking must not steal the brief greeting's attention.
  const range = (await slider.boundingBox())!;
  await page.mouse.move(range.x + range.width, range.y);
  await expect
    .poll(() => gaze('[data-agent="bot2"] [data-gaze]'))
    .toBeLessThan(-2.5);
  await expect(lime.getByRole("img")).toHaveAttribute(
    "aria-label",
    "Lime, happy",
  );
  mkdirSync("artifacts", { recursive: true });
  await panel.screenshot({ path: "artifacts/squad-neighbors.png" });
});

test("jumping to five wakes sequentially, powers the bar, and Home clears it", async ({
  page,
}) => {
  const panel = page.locator(".squad-selector");
  const slider = page.getByRole("slider", { name: "Squad size" });
  await slider.focus();
  await page.keyboard.press("End");
  await expect(slider).toHaveValue("5");
  await expect(panel.locator('[data-state="awake"]')).toHaveCount(1);
  await expect(panel.locator('[data-state="queued"]')).toHaveCount(4);
  await expect(panel.locator('[data-state="awake"]')).toHaveCount(5);
  await expect(panel).toHaveClass(/squad-powered/);
  await expect(panel.locator("canvas[data-fire=flowing]")).toHaveCount(1);
  await expect(panel.locator(".assembly-message")).toContainText("Full squad.");
  await expect(panel.locator("[data-powered=true]")).toHaveCount(5);
  for (const name of ["Plum", "Lime", "Tango", "Blu", "Sky"]) {
    await expect(
      panel.getByRole("img", { name: `${name}, focused`, exact: true }),
    ).toBeVisible();
  }
  expect(
    (await panel.locator(".squad-circle-slider").boundingBox())!.width,
  ).toBeLessThanOrEqual(360);
  const pixels = () =>
    panel.locator(".squad-energy").evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const data = c
        .getContext("2d")!
        .getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 17) sum += data[i];
      return sum;
    });
  const first = await pixels();
  expect(first).toBeGreaterThan(0);
  await page.waitForTimeout(180);
  expect(await pixels()).not.toBe(first);
  await page.keyboard.press("PageDown");
  await expect(slider).toHaveValue("4");
  await expect(panel.locator(".squad-energy")).toHaveCount(0);
  await page.keyboard.press("Home");
  await expect(slider).toHaveValue("0");
  await expect(panel).toHaveAttribute("data-awake", "0");
  await page.keyboard.press("PageDown");
  await expect(slider).toHaveValue("0");
  await panel.screenshot({ path: "artifacts/squad-empty.png" });
});

test("rapid scrubbing, mute, hiding and unmount cancel pending greetings", async ({
  page,
}) => {
  const panel = page.locator(".squad-selector");
  const slider = page.getByRole("slider", { name: "Squad size" });
  const diagnostics = () =>
    page.evaluate(async () =>
      (await import("/src/effects/sound.ts")).getAudioDiagnostics(),
    );
  await page
    .getByRole("button", { name: "Turn sound on", exact: true })
    .click();
  await slider.fill("5");
  await expect(panel).toHaveAttribute("data-awake", "1");
  await page
    .getByRole("button", { name: "Turn sound off", exact: true })
    .click();
  expect((await diagnostics()).scheduled).toBe(0);
  await page
    .getByRole("button", { name: "Turn sound on", exact: true })
    .click();
  const before = (await diagnostics()).voices;
  await expect(panel).toHaveAttribute("data-awake", "5");
  expect((await diagnostics()).voices).toBe(before);
  for (const n of [0, 5, 1, 4, 2, 5, 0]) await slider.fill(String(n));
  await page.waitForTimeout(3100);
  await expect(panel).toHaveAttribute("data-awake", "0");
  await expect(panel.locator(".squad-energy")).toHaveCount(0);
  await slider.fill("5");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect((await diagnostics()).scheduled).toBe(0);
  await expect(panel).toHaveAttribute("data-awake", "5");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const returned = (await diagnostics()).voices;
  await page.waitForTimeout(800);
  expect((await diagnostics()).voices).toBe(returned);
  await slider.fill("0");
  await slider.fill("5");
  await page.getByRole("button", { name: "Face gallery", exact: true }).click();
  expect((await diagnostics()).scheduled).toBe(0);
  const departed = (await diagnostics()).voices;
  await page.waitForTimeout(900);
  expect((await diagnostics()).voices).toBe(departed);
});

test("reduced motion keeps the full state static and the mobile capsule usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const panel = page.locator(".squad-selector");
  const slider = page.getByRole("slider", { name: "Squad size" });
  await slider.fill("5");
  await expect(panel).toHaveAttribute("data-awake", "5");
  await expect(panel.locator(".agent-body").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(panel.locator(".squad-energy")).toHaveAttribute(
    "data-fire",
    "still",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await slider.blur();
  await panel.screenshot({ path: "artifacts/squad-full-mobile.png" });
  await page.getByRole("button", { name: "Remove a bot", exact: true }).click();
  await expect(slider).toHaveValue("4");
  await page.getByRole("button", { name: "Add a bot", exact: true }).click();
  await expect(slider).toHaveValue("5");
  await expect(
    page.getByRole("button", { name: "Add a bot", exact: true }),
  ).toBeDisabled();
  const lime = (await panel
    .locator('[data-agent="bot2"] .seat-art')
    .boundingBox())!;
  await page.mouse.click(lime.x + lime.width / 2, lime.y + lime.height / 2);
  await expect(slider).toHaveValue("2");
  await expect(panel.locator(".squad-energy")).toHaveCount(0);
  const zero = (await panel.locator(".zero-seat > span").boundingBox())!;
  await page.mouse.click(zero.x + zero.width / 2, zero.y + zero.height / 2);
  await expect(slider).toHaveValue("0");
});

test("empty run directs back to assembly and the launched team matches the selection", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Squad in action", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your squad is still asleep." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Build your squad", exact: true })
    .click();
  await expect(page.getByRole("slider", { name: "Squad size" })).toBeFocused();
  await page.getByRole("slider", { name: "Squad size" }).fill("3");
  await expect(page.locator(".squad-selector")).toHaveAttribute(
    "data-awake",
    "3",
  );
  await page
    .getByRole("button", { name: "Play a sample run", exact: true })
    .click();
  await expect(page.locator("[data-tile]")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Character studio", exact: true })
    .click();
  await expect(page.getByRole("slider", { name: "Squad size" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Remove a bot", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Squad in action", exact: true })
    .click();
  await page.getByRole("button", { name: "Stop sample", exact: true }).click();
});

test("native pointer dragging reaches each detent and the full squad stays animated", async ({
  page,
}) => {
  const slider = page.getByRole("slider", { name: "Squad size" });
  const range = (await slider.boundingBox())!;
  const y = range.y + range.height / 2;
  const x = (n: number) => range.x + 12 + ((range.width - 24) * n) / 5;
  await slider.fill("2");
  await expect(page.locator(".squad-selector")).toHaveAttribute(
    "data-awake",
    "2",
  );
  await page.waitForTimeout(200);
  await page.mouse.move(x(2), y);
  await page.mouse.down();
  await page.mouse.move(x(2) + 8, y);
  await expect(slider).toHaveValue("2");
  const thumb = (await page.locator(".agent-thumb .agent-body").boundingBox())!;
  expect(Math.abs(thumb.x + thumb.width / 2 - x(2) - 8)).toBeLessThan(2);
  await page.mouse.up();
  await slider.fill("0");
  await page.mouse.move(x(0), y);
  await page.mouse.down();
  for (let n = 1; n <= 5; n++) {
    await page.mouse.move(x(n), y, { steps: 4 });
    await expect(slider).toHaveValue(String(n));
  }
  await page.mouse.up();
  const panel = page.locator(".squad-selector");
  await expect(panel).toHaveClass(/squad-powered/);
  await expect(panel.locator(".squad-energy")).toHaveAttribute(
    "data-fire",
    "flowing",
  );
  await slider.blur();
  await page.mouse.move(0, 0);
  await panel.screenshot({ path: "artifacts/squad-full.png" });
  await page.mouse.click(x(0), y);
  await expect(slider).toHaveValue("0");
  await expect(panel).toHaveAttribute("data-awake", "0");
});

test("changing motion preference preserves one natural greeting per bot", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Turn sound on", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Turn sound off", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("slider", { name: "Squad size" }).fill("5");
  await expect(page.locator(".squad-selector")).toHaveAttribute(
    "data-awake",
    "1",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".squad-selector")).toHaveAttribute(
    "data-awake",
    "5",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForTimeout(3400);
  const greetings = await page.evaluate(async () =>
    (await import("/src/effects/sound.ts"))
      .getAudioDiagnostics()
      .trace.filter(
        (e) =>
          e.scope === "preview" &&
          e.channel === "voice" &&
          e.label === "greeting",
      )
      .map((e) => e.id),
  );
  expect(greetings).toEqual(["bot1", "bot2", "bot3", "bot4", "bot5"]);
});
