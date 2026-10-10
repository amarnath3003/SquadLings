import { useEffect, useRef } from "react";
import { FRAME_FPS } from "@swarm/shared/cast";
import type { SwarmEvent } from "@swarm/shared/events";
type Frame = Extract<SwarmEvent, { type: "frame" }>["data"];
const sinks = new Map<string, (frame: Frame) => void>();
export function drawFrame(frame: Frame) {
  sinks.get(frame.botId)?.(frame);
}
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
      disposed = false,
      decodeSeq = -1;
    let bitmap: ImageBitmap | undefined;
    const w = phone ? 390 : 1280,
      h = phone ? 844 : 800;
    canvas.width = w;
    canvas.height = h;
    const styles = getComputedStyle(canvas);
    const theme = (name: string) => styles.getPropertyValue(name).trim();
    const paper = theme("--paper"),
      surface = theme("--surface"),
      ink = theme("--ink"),
      muted = theme("--muted"),
      line = theme("--line"),
      soft = theme("--soft");
    const draw = () => {
      if (document.hidden) return;
      frame++;
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = surface;
      ctx.fillRect(0, 0, w, 100);
      ctx.fillStyle = ink;
      ctx.font = `500 ${phone ? 18 : 24}px Arial`;
      ctx.fillText("Example workspace", phone ? 24 : 55, 58);
      ctx.fillStyle = muted;
      ctx.font = `${phone ? 12 : 17}px Arial`;
      ctx.fillText(
        "Synthetic page · no website connected",
        phone ? 24 : 55,
        84,
      );
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
    sinks.set(id, async (value) => {
      const seq = value.seq;
      if (seq <= decodeSeq) return;
      decodeSeq = seq;
      try {
        const binary = atob(value.jpeg),
          bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const next = await createImageBitmap(
          new Blob([bytes], { type: "image/jpeg" }),
        );
        if (disposed || seq !== decodeSeq) {
          next.close();
          return;
        }
        bitmap?.close();
        bitmap = next;
        ctx.drawImage(next, 0, 0, w, h);
      } catch (error) {
        console.error("Could not decode browser frame", error);
      }
    });
    return () => {
      disposed = true;
      clearInterval(timer);
      sinks.delete(id);
      bitmap?.close();
    };
  }, [id, color, load, phone]);
  return (
    <canvas
      ref={ref}
      className="frame-canvas"
      aria-label="Simulated browser page"
    />
  );
}
