import { useEffect, useRef } from "react";
import { FRAME_FPS } from "@swarm/shared/cast";
import type { SwarmEvent } from "@swarm/shared/events";
import { attachFrameCanvas } from "../../wall/frames";

// The studio's FrameCanvas on our real frames: a placeholder page until the agent's first frame, then the
// browser itself. Live frames arrive binary through wall/frames.ts (decoded there, latest wins, kept for
// re-mounts); a closed chat shows each agent's last saved screen.
type Frame = Extract<SwarmEvent, { type: "frame" }>["data"];
/** The studio's base64 frame events. Ours arrive binary (wall/frames.ts onFrame), so this does nothing. */
export function drawFrame(_frame: Frame) {}
export function FrameCanvas({
  id,
  color,
  load,
  phone,
}: {
  id: string;
  color: string;
  load: boolean;
  phone: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!,
      ctx = canvas.getContext("2d")!;
    let frame = 0,
      real = false;
    const w = phone ? 390 : 1280,
      h = phone ? 844 : 800;
    canvas.width = w;
    canvas.height = h;
    const styles = getComputedStyle(canvas);
    const theme = (name: string) => styles.getPropertyValue(name).trim();
    const paper = theme("--paper"),
      surface = theme("--surface"),
      muted = theme("--muted"),
      line = theme("--line"),
      soft = theme("--soft");
    const draw = () => {
      if (real || document.hidden) return;
      frame++;
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = surface;
      ctx.fillRect(0, 0, w, 100);
      ctx.fillStyle = muted;
      ctx.font = `${phone ? 14 : 20}px Arial`;
      ctx.fillText("Connecting to the browser…", phone ? 24 : 55, 60);
      const pad = phone ? 24 : 55,
        cols = phone ? 1 : 2,
        gap = phone ? 15 : 30,
        cw = (w - pad * 2 - gap * (cols - 1)) / cols;
      for (let i = 0; i < (phone ? 3 : 4); i++) {
        const x = pad + (i % cols) * (cw + gap),
          y = 140 + Math.floor(i / cols) * 250;
        ctx.fillStyle = surface;
        ctx.fillRect(x, y, cw, 215);
        ctx.strokeStyle = line;
        ctx.strokeRect(x, y, cw, 215);
        ctx.fillStyle = color + "24";
        ctx.fillRect(x + 20, y + 20, 54, 54);
        ctx.fillStyle = muted;
        ctx.fillRect(x + 20, y + 100, cw * 0.6, 8);
        ctx.fillStyle = soft;
        ctx.fillRect(x + 20, y + 124, cw * 0.8, 7);
        ctx.fillRect(x + 20, y + 145, cw * 0.5, 7);
        ctx.fillStyle = color;
        ctx.fillRect(x + 20, y + 172, 90, 24);
      }
      if (load) {
        ctx.fillStyle = color;
        ctx.fillRect(0, 97, ((frame % 80) / 80) * w, 3);
      }
    };
    draw();
    const timer = load ? setInterval(draw, 1000 / FRAME_FPS) : undefined;
    // The first real picture ends the placeholder for good (frames.ts paints straight onto the canvas).
    const detach = attachFrameCanvas(id, canvas, () => {
      real = true;
      clearInterval(timer);
    });
    return () => {
      clearInterval(timer);
      detach();
    };
  }, [id, color, load, phone]);
  return <canvas ref={ref} className="frame-canvas" aria-label="The agent's browser" />;
}
