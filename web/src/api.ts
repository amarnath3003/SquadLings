// The dashboard server's REST API (scripts/lib/ui-server.ts; master.md §19.8).
import { backendFetch } from "./backend";

export type Tunnel = { state: "starting" | "ready" | "failed"; url?: string; source?: string; error?: string };
export type Config = {
  defaults: Settings;
  models: { master: string[]; bot: string[] };
  efforts: string[];
  tunnel: Tunnel;
};
export type RunListing = { id: string; task: string; startedAt: number; status: string; reason: string | null; costUSD: number | null; answers: number; bots: number; live: boolean };

/** What the bar sends with a task (squad-runner.ts parseRunOptions). */
export type Settings = {
  bots: number;
  botEffort: string;
  masterModel: string;
  botModel: string;
  masterEffort?: string;
  maxActions: number;
  timeoutMin: number;
  allow: string | string[];
  webSearch: boolean;
  allowDirect: boolean;
  fresh: boolean;
};

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await backendFetch(path, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? `HTTP ${res.status}`), { status: res.status });
  return json as T;
}

export const getConfig = () => call<Config>("/api/config");
export const listRuns = async () => (await call<{ runs: RunListing[] }>("/api/runs")).runs;

/** Starts a run. If a chat is still live, offers to end it first (false: you kept it). */
export async function startRun(task: string, options: Settings): Promise<boolean> {
  const live = (await listRuns().catch(() => [])).find((r) => r.live);
  if (live) {
    if (!confirm("A chat is still running. End it and start this one?")) return false;
    await call(`/api/runs/${live.id}/stop`, {}).catch(() => {});
  }
  for (let i = 0; ; i++) {
    try {
      await call("/api/runs", { task, options });
      return true;
    } catch (err) {
      if ((err as { status?: number }).status !== 409 || i > 40) throw err;
      await new Promise((r) => setTimeout(r, 600)); // the old chat is still closing
    }
  }
}
