import { test, expect } from "@playwright/test";

test("film shows a selected squad, coordination, finished work, and sleeping cast", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/film?capture");
  const shell = await page.locator(".film-shell").boundingBox();
  expect(shell!.x).toBe(0);
  expect(shell!.width).toBe(1920);
  const seek = async (time: number) => {
    await page.evaluate((t) => window.squadFilm!.seek(t), time);
    await expect(page.locator(".film-stage")).toHaveAttribute(
      "data-time",
      time.toFixed(3),
    );
  };
  await seek(5.7);
  await expect(page.locator(".film-input")).toContainText(
    "Plan a weekend in Kochi for our team.",
  );
  await seek(9.1);
  await expect(page.locator(".squad-powered")).toBeVisible();
  await expect(page.locator(".film-selected-count")).toHaveText(
    "5 minds. Ready.",
  );
  await page.waitForTimeout(600);
  const flameTop = await page.locator(".squad-energy").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const pixels = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let top = canvas.height;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] > 230) {
          top = y;
          break;
        }
      }
      if (top < canvas.height) break;
    }
    const bounds = canvas.getBoundingClientRect();
    return bounds.y + (top / canvas.height) * bounds.height;
  });
  const bar = (await page.locator(".film-input").boundingBox())!;
  const bodies = (await page.locator(".squad-stack").boundingBox())!;
  expect(flameTop).toBeGreaterThan(bar.y + bar.height);
  expect(flameTop).toBeLessThan(bodies.y - 30);
  await seek(12.95);
  await expect(page.locator("[data-blackout=true]")).toBeVisible();
  const bounds = await page.locator(".film-black-wipe").boundingBox();
  expect(bounds!.width).toBeGreaterThan(1400);
  await seek(15.1);
  await expect(
    page.locator('[data-character="bot1"][data-activity="read"]'),
  ).toBeVisible();
  await seek(25.5);
  await expect(page.locator(".film-browser")).toHaveCount(5);
  await expect(page.locator(".film-onyx-caption")).toContainText(
    "Lime, add a rainy-day backup.",
  );
  await expect(page.locator('[data-worker="0"]')).toHaveAttribute(
    "data-complete",
    "true",
  );
  await expect(page.locator('[data-worker="1"]')).toHaveAttribute(
    "data-complete",
    "false",
  );
  await seek(31);
  await expect(page.locator('[data-complete="true"]')).toHaveCount(5);
  await seek(39);
  await expect(page.locator(".film-days > div")).toHaveCount(2);
  await expect(page.locator(".film-results")).toContainText(
    "Consider it done.",
  );
  await seek(50);
  await expect(page.locator(".film-ending h1")).toHaveText("SquadLings●");
  await expect(page.locator('[data-life="resting"]')).toHaveCount(5);
  await expect(page.getByRole("img", { name: "Onyx, resting" })).toBeVisible();
  await expect(page.locator(".sleep-notes")).toHaveCount(6);
  expect(errors).toEqual([]);
});

test("browser actors exchange free charms, Onyx reviews, and the same cast returns to sleep", async ({
  page,
}) => {
  await page.goto("/film?capture&t=22");
  const seek = async (t: number) => {
    await page.evaluate((t) => window.squadFilm!.seek(t), t);
    await expect(page.locator(".film-stage")).toHaveAttribute(
      "data-time",
      t.toFixed(3),
    );
  };
  const actor = await page.locator('[data-agent="0"]').elementHandle();
  for (let i = 0; i < 5; i++) {
    const browser = (await page.locator(`[data-worker="${i}"]`).boundingBox())!;
    const bot = (await page.locator(`[data-agent="${i}"]`).boundingBox())!;
    expect(bot.x).toBeGreaterThan(browser.x);
    expect(bot.x + bot.width).toBeLessThan(browser.x + browser.width);
    expect(bot.y).toBeGreaterThan(browser.y + 35);
    expect(bot.y + bot.height).toBeLessThan(browser.y + browser.height);
  }
  await seek(24.3);
  const charm = page.locator('[data-signal="followup"]');
  const first = (await charm.boundingBox())!;
  await seek(24.8);
  const next = (await charm.boundingBox())!;
  expect(Math.abs(next.x - first.x)).toBeGreaterThan(70);
  await expect(page.locator(".film-network")).toHaveCount(0);
  await seek(33.2);
  await expect(page.locator('[data-checked="true"]')).toHaveCount(2);
  await expect(page.locator(".film-review-lens")).toBeVisible();
  await expect(page.locator(".film-report-delivery")).toHaveCount(0);
  await seek(35.4);
  await expect(page.locator('[data-checked="true"]')).toHaveCount(5);
  await seek(36.4);
  await expect(page.locator(".film-report-envelope")).toBeVisible();
  await expect(page.locator(".film-report-delivery")).toHaveAttribute(
    "data-delivered",
    "false",
  );
  await seek(38);
  await expect(page.locator(".film-report-delivery")).toHaveAttribute(
    "data-delivered",
    "true",
  );
  await seek(43.5);
  expect(
    await actor!.evaluate(
      (node) => node === document.querySelector('[data-agent="0"]'),
    ),
  ).toBe(true);
  await expect(page.locator(".film-swarm")).toHaveCount(0);
  await seek(46);
  expect(
    new Set(
      await page
        .locator(".film-world-agent")
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-face"))),
    ).size,
  ).toBe(5);
  await expect(page.locator('[data-life="resting"]')).toHaveCount(0);
  await seek(47.3);
  await expect(page.locator('[data-life="resting"]')).toHaveCount(2);
  await seek(50);
  expect(
    await actor!.evaluate(
      (node) => node === document.querySelector('[data-agent="0"]'),
    ),
  ).toBe(true);
  await expect(page.locator('[data-life="resting"]')).toHaveCount(5);
});

test("film fits a phone in landscape letterboxing and playback can restart", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/film?t=52");
  const stage = await page.locator(".film-stage").boundingBox();
  expect(stage!.width).toBeCloseTo(390, 0);
  expect(stage!.height / stage!.width).toBeCloseTo(9 / 16, 2);
  await page.getByRole("checkbox", { name: "Sound" }).uncheck();
  await page.getByRole("button", { name: "Replay" }).click();
  await expect(page.locator(".film-stage")).toHaveAttribute(
    "data-scene",
    "task",
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await page.locator(".film-stage").getAttribute("data-time");
  await page.waitForTimeout(150);
  await expect(page.locator(".film-stage")).toHaveAttribute(
    "data-time",
    paused!,
  );
});

test("film soundtrack is 52 seconds, audible, bounded, and ends quietly", async ({
  page,
}) => {
  await page.goto("/film?capture");
  const stats = await page.evaluate(async () => {
    const raw = atob(await window.squadFilm!.renderSoundtrack());
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    let peak = 0,
      energy = 0,
      tailPeak = 0;
    const length = (bytes.length - 44) / 2;
    for (let i = 0; i < length; i++) {
      const sample = view.getInt16(44 + i * 2, true) / 32767;
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
      if (i > length - 48000) tailPeak = Math.max(tailPeak, Math.abs(sample));
    }
    return {
      seconds: length / view.getUint32(24, true),
      peak,
      rms: Math.sqrt(energy / length),
      tailPeak,
    };
  });
  expect(stats.seconds).toBe(52);
  expect(stats.peak).toBeGreaterThan(0.001);
  expect(stats.peak).toBeLessThan(0.95);
  expect(stats.rms).toBeGreaterThan(0.0001);
  expect(stats.tailPeak).toBeLessThan(0.0001);
});
