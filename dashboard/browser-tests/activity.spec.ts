import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

async function playground(page: Page) {
  await page.goto("/lab");
  await page.getByRole("button", { name: "Squad in action", exact: true }).click();
}

const actions = [
  ["Output", "output", ".activity-output-line"],
  ["Type", "type", ".activity-hand-left"],
  ["Scroll", "scroll", ".activity-scroll-lines"],
  ["Read", "read", ".activity-pupil"],
  ["Found", "found", ".activity-idea"],
  ["Ask", "ask", ".activity-question"],
  ["Finish", "finish", ".activity-medal"],
] as const;

async function send(page: Page, type: string, data: Record<string, unknown>, botId = "bot1") {
  await page.evaluate(async ({ type, data, botId }) => {
    const { consumeEvent } = await import("/src/ingest.ts");
    const { useDashboard } = await import("/src/store/index.ts");
    consumeEvent({ id: crypto.randomUUID(), runId: "activity-check", seq: 1,
      ts: useDashboard.getState().state.now + 1, source: "browser", botId, type, data },
      { reduced: false, speed: 1 });
  }, { type, data, botId });
}

for (const [label, kind, movingPart] of actions) {
  test(`${label} has a visible, moving reaction on every SquadLing`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await playground(page);
    for (const id of ["bot1", "bot2", "bot3", "bot4", "bot5"]) {
      await page.getByLabel("Send an event to").selectOption(id);
      await page.getByRole("button", { name: label, exact: true }).click();
      const character = page.locator(`[data-actor="${id}"] [data-character]`);
      await expect(character).toHaveAttribute("data-activity", kind);
      await expect(page.locator(`[data-actor="${id}"]`)).toHaveCSS("opacity", "1");
      // Replay after the spawn flight so the screenshots show the full reaction.
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(character.locator(`[data-activity-prop="${kind}"]`)).toBeVisible();
      const part = character.locator(movingPart).first();
      await expect.poll(() => part.evaluate((node) =>
        node.getAnimations().some((animation) => animation.playState === "running"),
      )).toBe(true);
      const before = await character.locator("[data-action-body]").getAttribute("style");
      await page.waitForTimeout(120);
      expect(await character.locator("[data-action-body]").getAttribute("style")).not.toBe(before);
      if (id === "bot1") {
        mkdirSync("artifacts", { recursive: true });
        await page.locator(`[data-tile="${id}"] .tile-viewport`).screenshot({ path: `artifacts/activity-${kind}.png` });
      }
    }
    expect(errors).toEqual([]);
  });
}

test("textbox typing lands at its field on desktop and mobile; reading magnifies one eye", async ({ page }) => {
  await playground(page);
  for (const id of ["bot1", "bot3"]) {
    if (id === "bot3") await page.getByLabel("Mobile Tango (next run)").check();
    await page.getByLabel("Send an event to").selectOption(id);
    await page.getByRole("button", { name: "Type", exact: true }).click();
    const tile = page.locator(`[data-tile="${id}"]`);
    await expect(tile.locator('[data-activity="type"]')).toHaveCount(1);
    expect(await tile.evaluate((node) => {
      const viewport = node.querySelector(".tile-viewport")!;
      const rect = viewport.getBoundingClientRect();
      const actor = node.querySelector("[data-actor]")!.getBoundingClientRect();
      return Math.hypot(actor.x - rect.x - viewport.clientLeft - viewport.clientWidth * .45,
        actor.y - rect.y - viewport.clientTop - viewport.clientHeight * .42);
    })).toBeLessThanOrEqual(2);
    await page.getByRole("button", { name: "Read", exact: true }).click();
    const eyes = tile.locator('[data-activity-face="read"] circle');
    await expect(eyes).toHaveCount(3);
    expect(Number(await eyes.nth(0).getAttribute("r"))).toBeGreaterThan(Number(await eyes.nth(2).getAttribute("r")) * 2);
  }
});

test("reactions restart and reset, resolve, and pause clear their motion", async ({ page }) => {
  await playground(page);
  const character = page.locator('[data-actor="bot1"] [data-character]');
  await page.getByRole("button", { name: "Found", exact: true }).click();
  await expect(character).toHaveAttribute("data-activity", "found");
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Found", exact: true }).click();
  await page.waitForTimeout(800);
  await expect(character).toHaveAttribute("data-activity", "found");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(character).toHaveAttribute("data-activity", "ask");
  await page.getByRole("button", { name: "Approve example", exact: true }).click();
  await expect(character).toHaveAttribute("data-activity", "idle");
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await page.getByText("More reactions & states", { exact: true }).click();
  await page.getByLabel("Status preview").selectOption("paused");
  await expect(character).toHaveAttribute("data-activity", "idle");
  await expect(character.locator("[data-action-body]")).toHaveAttribute("style", /transform: none/);
  await page.getByRole("button", { name: "Reset playground" }).click();
  await page.waitForTimeout(1900);
  await expect(page.locator("[data-tile]")).toHaveCount(0);
});

test("reduced motion preserves readable activity props without motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await playground(page);
  const character = page.locator('[data-actor="bot1"] [data-character]');
  for (const [label, kind] of actions) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(character).toHaveAttribute("data-activity", kind);
    await expect(character.locator(`[data-activity-prop="${kind}"]`)).toBeVisible();
    expect(await character.locator("[data-activity-prop]").evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
    const body = character.locator("[data-action-body]");
    const before = await body.getAttribute("style");
    await page.waitForTimeout(120);
    expect(await body.getAttribute("style")).toBe(before);
    if (label === "Ask") await page.getByRole("button", { name: "Approve example", exact: true }).click();
  }
});

test("long tools retain their cue, stale results cannot stop a new call, and scroll follows direction", async ({ page }) => {
  await playground(page);
  await page.getByRole("button", { name: "Read", exact: true }).click();
  const character = page.locator('[data-actor="bot1"] [data-character]');
  await expect(character).toHaveAttribute("data-activity", "read");
  await send(page, "tool.called", { botId: "bot1", callId: "old-read", tool: "read_text", args: {} });
  await page.waitForTimeout(2600);
  await expect(character).toHaveAttribute("data-activity", "read");
  await send(page, "tool.called", { botId: "bot1", callId: "new-read", tool: "look", args: {} });
  await send(page, "tool.result", { callId: "old-read", ok: true, summary: "Old response", ms: 2600 });
  await expect(character).toHaveAttribute("data-activity", "read");
  await send(page, "tool.result", { callId: "new-read", ok: true, summary: "Current response", ms: 100 });
  await expect(character).toHaveAttribute("data-activity", "idle");
  for (const dy of [-200, 200]) {
    await send(page, "cursor.scroll", { botId: "bot1", dy });
    await expect(character).toHaveAttribute("data-activity", "scroll");
    await expect(character.locator(".activity-scroll")).toHaveCSS("--scroll-step", dy < 0 ? "-10px" : "10px");
  }
  await send(page, "page.navigated", { botId: "bot1", url: "https://lab.example/next", title: "Next page" });
  await send(page, "cursor.scroll", { botId: "bot1", dy: 0 });
  await send(page, "cursor.type", { botId: "bot1", x: 100, y: 100, length: 0, masked: true });
  await expect(character).toHaveAttribute("data-activity", "idle");
});
