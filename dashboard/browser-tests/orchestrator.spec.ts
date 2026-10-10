import { expect, test, type Page } from "@playwright/test";

async function status(page: Page, status: string) {
  await page.evaluate(async (status) => {
    const { consumeEvent } = await import("/src/ingest.ts");
    const { useDashboard } = await import("/src/store/index.ts");
    consumeEvent(
      {
        id: crypto.randomUUID(),
        runId: "onyx-check",
        seq: 1,
        ts: useDashboard.getState().state.now + 1,
        source: "orchestrator",
        type: "master.status",
        data: { status },
      },
      { reduced: false, speed: 1 },
    );
  }, status);
}

test("Onyx acknowledges landed reports and keeps approvals in view", async ({
  page,
}) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Add a bot", exact: true }).click();
  await page
    .getByRole("button", { name: "Squad in action", exact: true })
    .click();
  await page.getByRole("button", { name: "Read", exact: true }).click();
  const onyx = page.locator(".master-card .master-character");
  await onyx.scrollIntoViewIfNeeded();
  await expect(onyx).toHaveAttribute("data-active", "true");
  await status(page, "planning");
  await expect(onyx.getByRole("img")).toHaveAccessibleName("Onyx, planning");
  await status(page, "monitoring");
  for (let report = 0; report < 2; report++) {
    await page
      .getByRole("button", { name: "Found", exact: true })
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(onyx).toHaveAttribute("data-state", "receiving");
    await expect(onyx).toHaveAttribute("data-state", "monitoring");
  }
  await page
    .getByRole("button", { name: "Ask", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(onyx.getByRole("img")).toHaveAccessibleName("Onyx, needs you");
  // The approval's own report lands while the pending question retains priority.
  await page.waitForTimeout(900);
  await expect(onyx).toHaveAttribute("data-state", "needs you");
  await page
    .getByRole("button", { name: "Approve example", exact: true })
    .click();
  await expect(onyx).toHaveAttribute("data-state", "monitoring");
  await page.getByRole("button", { name: "Reset playground" }).click();
  const reception = await page.evaluate(async () => {
    const { useMasterTick } = await import("/src/director/director.ts");
    const { tick, lastBot } = useMasterTick.getState();
    return { tick, lastBot: lastBot ?? null };
  });
  expect(reception).toEqual({ tick: 0, lastBot: null });
});

test("Onyx rests offscreen and hidden; reduced motion preserves its expressions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 400 });
  await page.goto("/lab");
  const onyx = page.locator(".master-seat .master-character");
  await onyx.scrollIntoViewIfNeeded();
  await expect(onyx).toHaveAttribute("data-active", "true");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(onyx).toHaveAttribute("data-active", "false");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(onyx).toHaveAttribute("data-active", "true");
  await page.evaluate(() => scrollTo(0, 0));
  await expect(onyx).toHaveAttribute("data-active", "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Face gallery", exact: true }).click();
  const states = page.locator(".master-gallery");
  await states.scrollIntoViewIfNeeded();
  await expect(
    states.getByRole("img", { name: "Onyx, needs you", exact: true }),
  ).toBeVisible();
  const moving = await states.evaluate(
    (element) =>
      element
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === "running").length,
  );
  expect(moving).toBe(0);
  await expect(
    states.locator(".master-character[data-active=false]"),
  ).toHaveCount(9);
});
