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
  await seek(12.95);
  await expect(page.locator("[data-blackout=true]")).toBeVisible();
  const bounds = await page.locator(".film-black-wipe").boundingBox();
  expect(bounds!.width).toBeGreaterThan(1400);
  await seek(15.1);
  await expect(
    page.locator('[data-character="bot1"][data-activity="read"]'),
  ).toBeVisible();
  await seek(25.5);
  await expect(page.locator(".film-task-window")).toHaveCount(5);
  await expect(page.locator(".film-onyx")).toContainText(
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
  await seek(35);
  await expect(page.locator(".film-days > div")).toHaveCount(2);
  await expect(page.locator(".film-results")).toContainText(
    "Consider it done.",
  );
  await seek(46);
  await expect(page.locator('[data-life="resting"]')).toHaveCount(5);
  await expect(page.getByRole("img", { name: "Onyx, resting" })).toBeVisible();
  await expect(page.locator(".sleep-notes")).toHaveCount(6);
  expect(errors).toEqual([]);
});

test("film fits a phone in landscape letterboxing and playback can restart", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/film?t=48");
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

test("film soundtrack is 48 seconds, audible, bounded, and ends quietly", async ({
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
  expect(stats.seconds).toBe(48);
  expect(stats.peak).toBeGreaterThan(0.001);
  expect(stats.peak).toBeLessThan(0.95);
  expect(stats.rms).toBeGreaterThan(0.0001);
  expect(stats.tailPeak).toBeLessThan(0.0001);
});
