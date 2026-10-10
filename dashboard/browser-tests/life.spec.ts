import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/lab");
});

test("all five signature moods breathe, and gaze follows the visitor", async ({
  page,
}) => {
  const bots = page.locator(".room-roster .character");
  await expect(bots).toHaveCount(5);
  for (const bot of await bots.all())
    await expect(bot).toHaveAttribute("data-life", "awake");
  const breaths = await page
    .locator(".room-roster .life-breath")
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).animationName),
    );
  expect(breaths).toEqual(Array(5).fill("life-breathe"));
  const gaze = page.locator(".room-roster [data-character=bot3] [data-gaze]");
  const box = await page
    .getByRole("button", { name: "Meet Tango" })
    .boundingBox();
  await page.mouse.move(box!.x - 70, box!.y + 60);
  await page.waitForTimeout(300);
  const left = await gaze.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.move(box!.x + box!.width + 70, box!.y + 60);
  await page.waitForTimeout(300);
  const right = await gaze.evaluate((el) => getComputedStyle(el).transform);
  expect(left).not.toBe(right);
  const transform = await bots
    .first()
    .locator(".life-breath")
    .evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(400);
  expect(
    await bots
      .first()
      .locator(".life-breath")
      .evaluate((el) => getComputedStyle(el).transform),
  ).not.toBe(transform);
});

test("group play, naps, wake-up, and repeated boops stay responsive", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "Dance break", exact: true }).click();
  await expect(
    page.getByText("This is for research.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("I love this part!", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/living-room-dance.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pass a spark", exact: true }).click();
  await expect(page.locator(".passing-spark")).toHaveCount(1);
  await expect(
    page.getByText("A little joy for you.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nap time", exact: true }).click();
  await expect(page.locator(".room-roster [data-life=resting]")).toHaveCount(5);
  await expect(page.locator(".room-roster .sleep-notes")).toHaveCount(5);
  await expect(page.locator(".passing-spark")).toHaveCount(0);
  await page.getByRole("button", { name: "Wake up", exact: true }).click();
  await expect(page.locator(".room-roster [data-life=awake]")).toHaveCount(5);
  await expect(
    page.getByText("Good morning, world!", { exact: true }),
  ).toBeVisible();
  const boop = page
    .locator(".personality-preview")
    .getByRole("button", { name: "Boop Plum", exact: true });
  await boop.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".personality-preview [role=img]")).toHaveAttribute(
    "aria-label",
    "Plum, happy",
  );
  await expect(
    page.locator(".personality-preview .affection-burst"),
  ).toHaveCount(1);
  await page.waitForTimeout(700);
  await boop.click();
  await expect(
    page.locator(".personality-preview .affection-burst"),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("motion preferences and offscreen suspension apply to the living room", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".room-roster [data-life=reduced]")).toHaveCount(5);
  expect(
    await page
      .locator(".room-roster .life-breath")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.getByRole("button", { name: "Say hello", exact: true }).click();
  await expect(
    page.getByText("Hi! Want to explore?", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".room-motes")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".room-roster [data-life=awake]")).toHaveCount(5);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Add a bot", exact: true })
    .scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator(".room-roster [data-life=paused]")).toHaveCount(5);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".room-roster [data-life=awake]")).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/living-room-mobile.png",
    fullPage: true,
  });
});

test("friends trade remarks, chatter can stop, and dragged characters return home", async ({
  page,
}) => {
  await expect(
    page.getByText("I found a shortcut!", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByText("Is it actually shorter?", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Chatter on", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Chatter off", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".stage-thought")).toHaveCount(0);
  const art = page
    .getByRole("button", { name: "Meet Sky", exact: true })
    .locator(".stage-art");
  const before = await art.boundingBox();
  await page.mouse.move(
    before!.x + before!.width / 2,
    before!.y + before!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(before!.x - 80, before!.y - 60, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const after = await art.boundingBox();
      return Math.hypot(after!.x - before!.x, after!.y - before!.y);
    })
    .toBeLessThan(2);
  const strayText = await page
    .locator(".character-seat")
    .evaluateAll((elements) =>
      elements.some((element) =>
        [...element.childNodes].some(
          (node) =>
            node.nodeType === Node.TEXT_NODE &&
            /\S/.test(node.textContent ?? ""),
        ),
      ),
    );
  expect(strayText).toBe(false);
});

test("a blink closes in place instead of dropping the eyes down the face", async ({
  page,
}) => {
  const eyes = page.locator(".room-roster [data-character=bot3] [data-blink]");
  let measuredDrift = Infinity;
  await expect
    .poll(
      async () => {
        const sample = await eyes.evaluate((node) => {
          const eye = node as SVGGElement;
          const scale = new DOMMatrix(getComputedStyle(eye).transform).d;
          const bounds = eye.getBBox();
          const center = new DOMPoint(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
          );
          const screen = center.matrixTransform(eye.getScreenCTM()!);
          const inParent = screen.matrixTransform(
            (eye.parentElement as unknown as SVGGElement)
              .getScreenCTM()!
              .inverse(),
          );
          return {
            scale,
            drift: Math.hypot(inParent.x - center.x, inParent.y - center.y),
          };
        });
        measuredDrift = sample.drift;
        return sample.scale;
      },
      { timeout: 12000, intervals: [40] },
    )
    .toBeLessThan(0.75);
  expect(measuredDrift).toBeLessThan(1);
});
