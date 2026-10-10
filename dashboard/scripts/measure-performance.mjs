import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const baseURL = process.env.PREVIEW_URL ?? "http://127.0.0.1:5173";
const channel =
  process.env.PLAYWRIGHT_CHANNEL ??
  (process.platform === "darwin" &&
  existsSync("/Applications/Google Chrome.app")
    ? "chrome"
    : undefined);
let browser;
try {
  browser = await chromium.launch({ channel });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseURL}/lab`);
  await page.getByRole("button", { name: "Squad in action" }).click();
  await page.getByLabel("8 fps load streams").check();
  await page
    .getByRole("button", { name: "Play sample run", exact: true })
    .click();
  await page.locator("[data-tile]").nth(4).waitFor();
  await page.waitForTimeout(500);
  const measurement = await page.evaluate(async () => {
    const samples = [],
      longTasks = [];
    let last = performance.now();
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ entryTypes: ["longtask"] });
    await new Promise((resolve) => {
      const start = performance.now();
      const frame = (time) => {
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
      durationSeconds: 20,
      frames: samples.length,
      averageFps: Number((1000 / mean).toFixed(1)),
      p95Ms: Number(samples[Math.floor(samples.length * 0.95)].toFixed(2)),
      longTasksOver50Ms: longTasks.length,
      maxLongTaskMs: longTasks.length ? Math.round(Math.max(...longTasks)) : 0,
      streams: document.querySelectorAll(".frame-canvas").length,
    };
  });
  const report = {
    timestamp: new Date().toISOString(),
    browser: await browser.version(),
    viewport: { width: 1440, height: 1000 },
    mode: "Headless Chrome, synthetic 8 fps streams; 20s after all tiles mount, including finishes/confetti",
    ...measurement,
    pageErrors,
  };
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/performance.json",
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
  if (pageErrors.length) process.exitCode = 1;
} catch (error) {
  console.error(
    `Performance check failed: ${error.message}. Start the local server first; see dashboard/README.md.`,
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
}
