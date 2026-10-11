// The WebSocket to the dashboard server, ported from ui/app.js "Connection": the hello (config and
// tunnel), the snapshot of the current run, its events, and binary frames for the wall.
import { S, apply, loadRun, notify, touchLayout, touchTop, type ServerEvent } from "./store";
import { loadHistory } from "./history";
import { onFrame } from "../wall/frames";

let ws: WebSocket | null = null;
let retry = 0;
let firstSnapshot = true;

/** Sends a JSON message on the socket (takeover input: { type: "input", botId, event }). */
export function send(msg: unknown) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

export function connect() {
  if (ws && ws.readyState <= WebSocket.OPEN) return; // one socket (React's dev double-mount calls this twice)
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.binaryType = "arraybuffer";
  ws.onopen = () => {
    retry = 0;
    S.banner = null;
    notify();
  };
  ws.onmessage = (m) => {
    if (m.data instanceof ArrayBuffer) return void onFrame(m.data);
    let msg: any;
    try {
      msg = JSON.parse(m.data);
    } catch {
      return;
    }
    if (msg.type === "hello") {
      S.config = msg.config;
      S.tunnel = msg.config.tunnel ?? S.tunnel;
      touchTop();
    } else if (msg.type === "tunnel") {
      S.tunnel = msg.tunnel;
      touchTop();
    } else if (msg.type === "snapshot") onSnapshot(msg);
    else if (msg.type === "event") apply(msg.event);
  };
  ws.onclose = () => {
    S.banner = "Lost the connection to the SquadLings server. Reconnecting…";
    notify();
    setTimeout(connect, Math.min(5000, 400 * 2 ** retry++));
  };
}

type Snapshot = { run: { id: string; task: string; status: string; startedAt: number; endedAt?: number; out?: string } | null; events: ServerEvent[] };

/** The server's current run: open it if it's live and this tab is free for it (or asked for it). */
function onSnapshot(msg: Snapshot) {
  const run = msg.run;
  const live = Boolean(run && ["starting", "running", "ending"].includes(run.status));
  S.liveId = live ? run!.id : null;
  if (live && run && (S.starting || firstSnapshot || S.run?.id === run.id || (S.view === "home" && (!S.run || S.run.id !== run.id)))) {
    // A reconnect while you're on the home screen refreshes the live chat in the background.
    const stayHome = S.view === "home" && !S.starting && !firstSnapshot && S.run?.id === run.id;
    S.starting = false;
    loadRun({ id: run.id, task: run.task, status: run.status, startedAt: run.startedAt, endedAt: run.endedAt, out: run.out }, msg.events, false);
    if (stayHome) (S.view = "home"), touchLayout();
  } else touchLayout();
  firstSnapshot = false;
  void loadHistory();
}
