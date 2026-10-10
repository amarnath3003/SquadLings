import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { once } from "node:events";

const baseURL = process.env.FILM_URL ?? "http://127.0.0.1:5173";
const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
const output = resolve(
  process.env.FILM_OUTPUT ?? "artifacts/video/squadlink-film.mp4",
);
const width = 1920,
  height = 1080,
  fps = 30;
const check = spawnSync(ffmpeg, ["-version"], { encoding: "utf8" });
if (check.status !== 0)
  throw new Error(
    "FFmpeg was not found. Install FFmpeg or set FFMPEG_PATH to its executable.",
  );
mkdirSync(dirname(output), { recursive: true });
const scratch = resolve("artifacts/video");
mkdirSync(scratch, { recursive: true });
const audioPath = resolve(scratch, "soundtrack.wav");
let browser, encoder;
let encodeLog = "";
try {
  browser = await chromium.launch({
    channel:
      process.env.PLAYWRIGHT_CHANNEL ??
      (process.platform === "darwin" &&
      existsSync("/Applications/Google Chrome.app")
        ? "chrome"
        : undefined),
  });
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await page.clock.install({ time: new Date(0) });
  await page.clock.pauseAt(1000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${baseURL}/film?capture`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.squadFilm));
  await page.evaluate(() => document.fonts.ready);
  const duration = await page.evaluate(() => window.squadFilm.duration);
  const wav = await page.evaluate(() => window.squadFilm.renderSoundtrack());
  writeFileSync(audioPath, Buffer.from(wav, "base64"));
  console.log(`Recording ${duration}s at ${width}×${height}, ${fps} fps…`);
  encoder = spawn(
    ffmpeg,
    [
      "-y",
      "-loglevel",
      "warning",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "-framerate",
      String(fps),
      "-i",
      "pipe:0",
      "-i",
      audioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-t",
      String(duration),
      "-movflags",
      "+faststart",
      output,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  const finished = once(encoder, "close");
  encoder.stderr.on("data", (data) => {
    encodeLog += data.toString();
  });
  let pipeError;
  encoder.stdin.on("error", (error) => {
    pipeError = error;
  });
  // Advance JS timers and CSS/Web Animations independently of wall-clock capture
  // speed, so heavy frames never turn into a multi-second freeze in the export.
  await page.evaluate(() => {
    window.filmAnimationBirth = new WeakMap();
    window.squadFilm.seek(0);
  });
  const total = duration * fps;
  let written = 0;
  const renderStart = Date.now();
  for (let frame = 0; frame < total; frame++) {
    await page.clock.runFor(1000 / fps);
    await page.evaluate(
      (seconds) => window.squadFilm.seek(seconds),
      frame / fps,
    );
    await page.evaluate(() => {
      const now = performance.now();
      for (const animation of document.getAnimations()) {
        if (!window.filmAnimationBirth.has(animation))
          window.filmAnimationBirth.set(animation, now);
        animation.pause();
        animation.currentTime = now - window.filmAnimationBirth.get(animation);
      }
    });
    const jpg = await page.screenshot({
      type: "jpeg",
      quality: 95,
      animations: "allow",
      caret: "initial",
    });
    if (pipeError) throw pipeError;
    if (!encoder.stdin.write(jpg)) await once(encoder.stdin, "drain");
    written++;
    if (frame % 150 === 0)
      console.log(`Rendered ${frame / fps}s / ${duration}s`);
  }
  encoder.stdin.end();
  const [code] = await finished;
  if (code !== 0 || pipeError)
    throw new Error(`FFmpeg failed: ${pipeError?.message ?? encodeLog}`);
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
  const report = {
    recordedAt: new Date().toISOString(),
    browser: await browser.version(),
    width,
    height,
    fps,
    duration,
    encodedFrames: written,
    capturedFrames: written,
    captureMode:
      "Fixed 1/30-second browser clock steps; CSS/Web Animations sampled at virtual time",
    renderWallSeconds: Math.round((Date.now() - renderStart) / 1000),
    errors,
    audio: "Existing synthesized effects, offline WAV muxed as AAC",
    output,
  };
  writeFileSync(
    resolve(scratch, "recording.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  encoder?.kill();
  console.error(`Film recording failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
