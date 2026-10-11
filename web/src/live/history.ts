// Chats: the list, opening one, a new chat (ported from ui/app.js "Chats").
import { S, effects, goHome, loadRun, notify, runActive, touchLayout } from "./store";
import { post, showHint } from "./actions";
import { listRuns } from "../api";

export async function loadHistory() {
  try {
    S.history = await listRuns();
  } catch {
    return;
  }
  notify();
}
effects.historyChanged = () => void loadHistory();

export function toggleHistory(open = !S.historyOpen) {
  S.historyOpen = open;
  notify();
  if (open) void loadHistory();
}

/** Opens a chat: the live one, or a closed one (read-only, with each agent's last screen). */
export async function openChat(id: string) {
  toggleHistory(false);
  if (S.run?.id === id) {
    S.view = "run";
    return void touchLayout();
  }
  try {
    const res = await fetch(`/api/runs/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
    const data = await res.json();
    loadRun(data.run, data.events, id !== S.liveId);
  } catch (err) {
    showHint(`Couldn't open that chat: ${err instanceof Error ? err.message : err}`, true);
  }
}

export async function newChat() {
  if (runActive() && S.view === "run") {
    if (!confirm("End this chat and start a new one? The agents stop and their browsers close. This chat stays under Chats.")) return;
    try {
      await post(`/api/runs/${S.run!.id}/stop`);
    } catch (err) {
      return showHint(err instanceof Error ? err.message : String(err), true);
    }
  }
  toggleHistory(false);
  goHome();
}
