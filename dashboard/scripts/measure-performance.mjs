import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const baseURL = process.env.PREVIEW_URL ?? "http://127.0.0.1:5173";
const channel =
  process.env.PLAYWRIGHT_CHANNEL ??
  (process.platform === "darwin" &&
  existsSync("/Applications/Google Chrome.app")
    ? "chrome"
    : undefined);
const scene = process.env.PERF_SCENE ?? "run";
const audio = process.env.PERF_AUDIO === "1";
let browser;
try {
  if (!["run", "studio"].includes(scene))
    throw new Error("PERF_SCENE must be run or studio");
  browser = await chromium.launch({ channel });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseURL}/lab`);
  await page.getByRole("slider", { name: "Squad size" }).fill("5");
  await page.locator(".squad-powered").waitFor();
  if (audio) {
    await page
      .getByRole("button", { name: "Turn sound on", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Turn sound off", exact: true })
      .waitFor();
  }
  if (scene === "run") {
    await page.getByRole("button", { name: "Squad in action" }).click();
    await page.getByLabel("8 fps load streams").check();
    await page
      .getByRole("button", { name: "Play sample run", exact: true })
      .click();
    await page.locator("[data-tile]").nth(4).waitFor();
  } else {
    await page.locator(".room-roster .character").nth(4).waitFor();
  }
  await page.waitForTimeout(500);
  const measurement = await page.evaluate(async (studio) => {
    const samples = [],
      longTasks = [],
      actions = [];
    let last = performance.now(),
      speakingFrames = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ entryTypes: ["longtask"] });
    await new Promise((resolve) => {
      const start = performance.now();
      let danced = false,
        spark = false;
      const play = (label) => {
        const button = [
          ...document.querySelectorAll(".room-play-buttons button"),
        ].find((button) => button.textContent?.trim() === label);
        if (button) {
          button.click();
          actions.push(label);
        }
      };
      const frame = (time) => {
        if (document.querySelector("[data-speaking=true]")) speakingFrames++;
        if (studio) {
          window.dispatchEvent(
            new PointerEvent("pointermove", {
              pointerType: "mouse",
              clientX: 820 + Math.sin((time - start) / 900) * 420,
              clientY: 510 + Math.cos((time - start) / 1300) * 130,
            }),
          );
          if (!danced && time - start > 5000) {
            danced = true;
            play("Dance break");
          }
          if (!spark && time - start > 12000) {
            spark = true;
            play("Pass a spark");
          }
        }
        samples.push(time - last);
        last = time;
        if (time - start < 20000) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    observer.disconnect();
    samples.shift();
    samples.sort((a, b) => a - b);
    const mean =
      samples.reduce((sum, value) => sum + value, 0) / samples.length;
    return {
      actions,
      speakingFrames,
      durationSeconds: 20,
      frames: samples.length,
      averageFps: Number((1000 / mean).toFixed(1)),
      p95Ms: Number(samples[Math.floor(samples.length * 0.95)].toFixed(2)),
      longTasksOver50Ms: longTasks.length,
      maxLongTaskMs: longTasks.length ? Math.round(Math.max(...longTasks)) : 0,
      streams: document.querySelectorAll(".frame-canvas").length,
      studioCharacters: document.querySelectorAll(".room-roster .character")
        .length,
      fireCanvases: document.querySelectorAll(
        '.squad-energy[data-fire="flowing"]',
      ).length,
      poweredAgents: document.querySelectorAll(
        '.squad-selector[data-visible="true"] .agent-seat[data-powered="true"]',
      ).length,
    };
  }, scene === "studio");
  if (
    scene === "studio" &&
    (measurement.actions.length !== 2 ||
      measurement.studioCharacters !== 5 ||
      measurement.poweredAgents !== 5 ||
      measurement.fireCanvases !== 1)
  )
    throw new Error(
      "The studio scene did not exercise all expected controls, characters and fired-up agents",
    );
  if (scene === "run" && measurement.streams !== 5)
    throw new Error("The run scene did not mount five synthetic streams");
  const report = {
    timestamp: new Date().toISOString(),
    browser: await browser.version(),
    viewport: { width: 1440, height: 1000 },
    audioEnabled: audio,
    mode:
      scene === "studio"
        ? "Headless Chrome, 20s living studio with continuous pointer tracking, dance and spark interactions"
        : "Headless Chrome, synthetic 8 fps streams; 20s after all tiles mount, including finishes/confetti",
    ...measurement,
    pageErrors,
  };
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    audio
      ? `artifacts/performance-${scene}-audio.json`
      : scene === "studio"
        ? "artifacts/performance-studio.json"
        : "artifacts/performance.json",
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
  if (pageErrors.length) process.exitCode = 1;
  if (audio && !measurement.speakingFrames)
    throw new Error("No bot speech was observed during the audio sample");
} catch (error) {
  console.error(
    `Performance check failed: ${error.message}. Start the local server first; see dashboard/README.md.`,
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
}
