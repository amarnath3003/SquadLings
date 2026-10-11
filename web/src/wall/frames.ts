// Live frames (master.md §18.3), ported from ui/app.js "Frames" and paintKeyframe. The connection hands
// every binary WebSocket message to onFrame: u8 version, u8 bot index, u16 width, u16 height, u32 seq,
// then the JPEG. Bot index n is agent "bot<n>" (as in S.bots). The latest frame wins: frames that arrive
// while one decodes replace each other.
//
// The tiles' canvases (studio/components/FrameCanvas) register here by agent id. The last decoded
// picture of each agent is kept, so a re-mounted tile (or one that mounts after its first frames) is
// painted at once. A closed chat's tiles show the last screen each agent saved
// (/api/runs/:id/frames/<name>.jpg).

import { S, touchBot } from "../live/store";

type Slot = { buf: ArrayBuffer | null; bmp: ImageBitmap | null; decoding: boolean };
type Sink = { canvas: HTMLCanvasElement; onPaint: () => void };
/** The live run's frames by agent id: the newest undecoded one, and the last picture. */
const live = new Map<string, Slot>();
let liveFor: string | null = null; // the run those frames belong to
/** Mounted tiles' canvases, by agent id. */
const sinks = new Map<string, Sink>();
/** A closed chat's keyframes by agent id (null: none, or still loading). */
const keyframes = new Map<string, ImageBitmap | null>();
let keysFor: string | null = null;

/** A new live run drops the old run's pictures (classic cleared them when the snapshot's run changed). */
function syncLive() {
  if (!S.liveId || S.liveId === liveFor) return;
  for (const s of live.values()) s.bmp?.close();
  live.clear();
  liveFor = S.liveId;
}
/** The open chat is the run these live frames belong to (still true for a moment after it ends). */
const showingLive = () => Boolean(S.run && !S.run.past && S.run.id === liveFor);

function paint(id: string, bmp: ImageBitmap) {
  const sink = sinks.get(id);
  if (!sink) return;
  const c = sink.canvas;
  if (c.width !== bmp.width || c.height !== bmp.height) (c.width = bmp.width), (c.height = bmp.height);
  c.getContext("2d")?.drawImage(bmp, 0, 0);
  sink.onPaint();
  const b = S.botById.get(id);
  if (b && !b.live) (b.live = true), touchBot(b);
}

/** One binary message from the socket. */
export function onFrame(buf: ArrayBuffer) {
  if (buf.byteLength < 10) return;
  const v = new DataView(buf);
  if (v.getUint8(0) !== 1) return;
  syncLive();
  if (!S.liveId) return;
  const id = `bot${v.getUint8(1)}`;
  let slot = live.get(id);
  if (!slot) live.set(id, (slot = { buf: null, bmp: null, decoding: false }));
  slot.buf = buf;
  void pump(id);
}

/** Decodes the newest waiting frame of that agent and paints it (only while its run is on screen). */
async function pump(id: string) {
  const slot = live.get(id);
  if (!slot || slot.decoding || !slot.buf || !showingLive()) return;
  const buf = slot.buf;
  slot.buf = null;
  slot.decoding = true;
  try {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(buf, 10)], { type: "image/jpeg" }));
    if (live.get(id) !== slot) return void bmp.close(); // a new run meanwhile
    slot.bmp?.close();
    slot.bmp = bmp;
    if (showingLive()) {
      const v = new DataView(buf);
      const b = S.botById.get(id);
      if (b) (b.vw = v.getUint16(2) || b.vw), (b.vh = v.getUint16(4) || b.vh);
      paint(id, bmp);
    }
  } catch {
    // a broken frame: the next one replaces it
  }
  slot.decoding = false;
  if (slot.buf) void pump(id);
}

/** A closed chat's tile: the last screen its agent saved (fetched once per chat). */
function keyframe(id: string) {
  const run = S.run!;
  const name = S.botById.get(id)?.name.toLowerCase();
  if (!name) return;
  if (keysFor !== run.id) {
    for (const k of keyframes.values()) k?.close();
    keyframes.clear();
    keysFor = run.id;
  }
  if (keyframes.has(id)) {
    const bmp = keyframes.get(id);
    if (bmp) paint(id, bmp);
    return;
  }
  keyframes.set(id, null);
  const runId = run.id;
  void (async () => {
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/frames/${encodeURIComponent(name)}.jpg`);
      if (!res.ok) return;
      const bmp = await createImageBitmap(await res.blob());
      if (keysFor !== runId) return void bmp.close();
      keyframes.set(id, bmp);
      if (S.run?.id === runId && S.run.past) paint(id, bmp);
    } catch {
      // no keyframe: the tile keeps its placeholder
    }
  })();
}

/** A tile's canvas mounted: paint what we have for that agent; `onPaint` runs on every real picture. Returns the unmount. */
export function attachFrameCanvas(id: string, canvas: HTMLCanvasElement, onPaint: () => void) {
  const sink = { canvas, onPaint };
  sinks.set(id, sink);
  if (S.run?.past) keyframe(id);
  else {
    syncLive();
    const slot = live.get(id);
    if (slot?.bmp && showingLive()) paint(id, slot.bmp);
    void pump(id);
  }
  return () => {
    if (sinks.get(id) === sink) sinks.delete(id);
  };
}
