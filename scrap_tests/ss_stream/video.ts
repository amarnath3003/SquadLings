// Turns timestamped frames into a .webm video. Each frame stays on screen until the next one
// arrived (capped, so a 40 s wait doesn't become 40 s of the same picture).
//
//   node scrap_tests/ss_stream/video.ts <run-dir>     # rebuild the videos from <run-dir>/timeline.json
//
// Uses ffmpeg from PATH, else the copy Playwright downloads for its own video recording
// (~/Library/Caches/ms-playwright/ffmpeg-*). That build only decodes JPEG and only encodes
// VP9/WebM, which is all this needs, so nothing has to be installed.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type VideoFrame = { file: string; atMs: number }; // file is relative to the run directory

export type VideoResult = { ok: boolean; file?: string; frames: number; seconds: number; note?: string };

export function findFfmpeg(): string | null {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (dir && existsSync(join(dir, "ffmpeg"))) return join(dir, "ffmpeg");
  }
  const caches = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), "Library/Caches/ms-playwright"), join(homedir(), ".cache/ms-playwright")];
  for (const cache of caches) {
    if (!cache || !existsSync(cache)) continue;
    const dirs = readdirSync(cache).filter((d) => /^ffmpeg-\d+$/.test(d)).sort((a, b) => Number(b.slice(7)) - Number(a.slice(7)));
    for (const dir of dirs) {
      for (const name of ["ffmpeg-mac", "ffmpeg-linux", "ffmpeg-win64.exe"]) {
        if (existsSync(join(cache, dir, name))) return join(cache, dir, name);
      }
    }
  }
  return null;
}

function isJpeg(path: string): boolean {
  const head = Buffer.alloc(2);
  const fd = openSync(path, "r");
  try {
    readSync(fd, head, 0, 2, 0);
  } finally {
    closeSync(fd);
  }
  return head[0] === 0xff && head[1] === 0xd8;
}

export async function buildVideo(
  runDir: string,
  frames: VideoFrame[],
  outName: string,
  { fps = 2, maxHoldMs = 5000, lastHoldMs = 2000 } = {},
): Promise<VideoResult> {
  const usable = frames.filter((f) => existsSync(join(runDir, f.file)) && isJpeg(join(runDir, f.file))).sort((a, b) => a.atMs - b.atMs);
  if (!usable.length) return { ok: false, frames: 0, seconds: 0, note: "no JPEG frames" };
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) return { ok: false, frames: usable.length, seconds: 0, note: "no ffmpeg (brew install ffmpeg, or npx playwright install)" };

  // Output size is fixed; frames of other sizes are scaled to fit and letterboxed.
  const out = join(runDir, outName);
  const proc = spawn(
    ffmpeg,
    ["-hide_banner", "-loglevel", "error", "-y",
     "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "pipe:0", // Playwright's build rejects "-"
     "-vf", "scale=1280:880:force_original_aspect_ratio=decrease,pad=1280:880:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
     "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", "-deadline", "realtime", "-cpu-used", "8", out],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d));
  proc.stdin.on("error", () => {}); // ffmpeg exiting early shows up as a nonzero exit code below
  const exited = once(proc, "close");

  let written = 0;
  for (let i = 0; i < usable.length; i++) {
    const holdMs = i + 1 < usable.length ? Math.min(usable[i + 1].atMs - usable[i].atMs, maxHoldMs) : lastHoldMs;
    const copies = Math.max(1, Math.round((holdMs / 1000) * fps));
    const jpeg = readFileSync(join(runDir, usable[i].file));
    for (let c = 0; c < copies; c++) {
      if (proc.exitCode !== null) break;
      if (!proc.stdin.write(jpeg)) await Promise.race([once(proc.stdin, "drain"), exited]);
      written++;
    }
  }
  proc.stdin.end();
  const [code] = await exited;
  if (code !== 0) return { ok: false, frames: usable.length, seconds: 0, note: `ffmpeg exited ${code}: ${stderr.trim().slice(0, 300)}` };
  return { ok: true, file: out, frames: usable.length, seconds: written / fps };
}

if (import.meta.main) {
  const runDir = resolve(process.argv[2] ?? "");
  if (!process.argv[2] || !existsSync(join(runDir, "timeline.json"))) {
    console.error("Usage: node scrap_tests/ss_stream/video.ts <run-dir containing timeline.json>");
    process.exit(1);
  }
  const timeline = JSON.parse(readFileSync(join(runDir, "timeline.json"), "utf8"));
  for (const source of ["api", "sidecar"]) {
    const frames = timeline.frames.filter((f: any) => f.source === source);
    if (!frames.length) continue;
    const r = await buildVideo(runDir, frames, `video-${source}.webm`);
    console.log(`${source.padEnd(8)} ${r.ok ? `${r.file} (${r.frames} frames, ${r.seconds.toFixed(1)} s)` : `not built: ${r.note}`}`);
  }
}
