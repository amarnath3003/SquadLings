// Where the squad's browser windows go: a 3 × 2 grid on the main screen, bots in reading order and
// the last cell left for the terminal, where you chat with the Master.

import { execFileSync } from "node:child_process";
import type { WindowBounds } from "./browser.ts";

/**
 * The main screen's usable area in points (no menu bar, no Dock). macOS asks AppKit through JXA
 * (no permissions needed); elsewhere, or if that fails, a 1512 × 982 laptop screen is assumed.
 */
export function screenArea(): WindowBounds {
  if (process.platform === "darwin") {
    try {
      const out = execFileSync(
        "osascript",
        ["-l", "JavaScript", "-e", 'ObjC.import("AppKit"); const s = $.NSScreen.mainScreen; const f = s.frame, v = s.visibleFrame; JSON.stringify([f.size.height, v.origin.x, v.origin.y, v.size.width, v.size.height])'],
        { encoding: "utf8", timeout: 4000 },
      );
      const [fh, vx, vy, vw, vh] = JSON.parse(out) as number[];
      // AppKit counts y from the bottom; windows are placed from the top.
      if (vw > 0 && vh > 0) return { left: vx, top: fh - (vy + vh), width: vw, height: vh };
    } catch {
      // fall through
    }
  }
  return { left: 0, top: 33, width: 1512, height: 882 };
}

/**
 * `count` window tiles (at most 5) in a 3 × 2 grid, each with the page zoom that makes the page
 * `pageWidth` CSS px wide. The sixth cell (bottom right) stays free for the terminal.
 */
export function tiles(area: WindowBounds, count: number, pageWidth = 1280): (WindowBounds & { zoom: number })[] {
  const cols = 3;
  const rows = 2;
  const width = Math.floor(area.width / cols);
  const height = Math.floor(area.height / rows);
  const zoom = Math.min(1, width / pageWidth);
  return Array.from({ length: Math.min(count, cols * rows - 1) }, (_, i) => ({
    left: area.left + (i % cols) * width,
    top: area.top + Math.floor(i / cols) * height,
    width,
    height,
    zoom,
  }));
}
