// Actions shared by the chat and the wall (ported from ui/app.js focusBot, takeover, setHover, showHint).
import { S, notify, touchLayout } from "./store";
import { backendFetch } from "../backend";

export async function post<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await backendFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? `HTTP ${res.status}`), { status: res.status });
  return json as T;
}

let hintTimer: ReturnType<typeof setTimeout> | undefined;
/** The line under the composer (errors stay longer). */
export function showHint(text: string, error = false) {
  S.hint = text ? { text, error } : null;
  clearTimeout(hintTimer);
  if (text) hintTimer = setTimeout(() => ((S.hint = null), notify()), error ? 12000 : 6000);
  notify();
}

/** An agent takes the stage (null: back to the grid; not while you have a browser). */
export function focusBot(id: string | null) {
  if (id && !S.botById.has(id)) return;
  if (!id && S.ui.control) return; // hand the browser back first
  S.ui.focus = id;
  touchLayout();
}

/** Hovering an agent anywhere lights up its tile and its rows. */
export function setHover(id: string | null) {
  if (S.ui.hover === id) return;
  S.ui.hover = id;
  notify();
}

/** You take over an agent's browser (or hand it back). */
export async function takeover(botId: string, on: boolean) {
  if (!S.run) return;
  if (on) focusBot(botId);
  try {
    await post(`/api/runs/${S.run.id}/bots/${botId}/takeover`, { action: on ? "start" : "end" });
  } catch (err) {
    showHint(err instanceof Error ? err.message : String(err), true);
  }
}
