// Local dashboards use their own server. Hosted dashboards connect directly to the laptop's bridge.
export const remoteBackend = import.meta.env.VITE_REMOTE_BACKEND === "true";
export type BackendConnection = { url: string; token: string };
const STORAGE_KEY = "squadlings-backend";
let connection: BackendConnection | null = null;

export function validateConnection(value: BackendConnection): BackendConnection {
  const url = new URL(value.url.trim());
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Enter the HTTPS address of your laptop's bridge, without a path.");
  }
  if (!/^[A-Za-z0-9_-]{32,}$/.test(value.token.trim())) throw new Error("Enter the access key generated on your laptop.");
  return { url: url.origin, token: value.token.trim() };
}

function readConnection(): BackendConnection | null {
  if (!remoteBackend) return null;
  const fragment = new URLSearchParams(location.hash.slice(1));
  const fromLink = fragment.has("backend") || fragment.has("key");
  if (fromLink) history.replaceState(null, "", location.pathname + location.search);
  try {
    const value = fromLink
      ? { url: fragment.get("backend") ?? "", token: fragment.get("key") ?? "" }
      : JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    return value ? validateConnection(value) : null;
  } catch {
    return null;
  }
}

export const initialConnection = readConnection();

export async function checkConnection(value: BackendConnection) {
  const res = await fetch(`${value.url}/api/config`, {
    headers: { Authorization: `Bearer ${value.token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "That access key is incorrect. Check the key on your laptop." : `The laptop returned HTTP ${res.status}.`);
  const config = await res.json();
  if (!config.defaults || !config.models) throw new Error("That address is not a SquadLings dashboard bridge.");
  connection = value;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // The current tab still works when browser storage is disabled.
  }
}

export function backendFetch(path: string, options?: RequestInit): Promise<Response> {
  if (!remoteBackend) return fetch(path, options);
  if (!connection) return Promise.reject(new Error("Connect to your laptop first."));
  const headers = new Headers(options?.headers);
  headers.set("Authorization", `Bearer ${connection.token}`);
  return fetch(`${connection.url}${path}`, { ...options, headers });
}

export function backendSocket(): WebSocket {
  if (!remoteBackend) return new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  if (!connection) throw new Error("Connect to your laptop first.");
  // A subprotocol carries the key without putting it in request URLs or access logs.
  return new WebSocket(`${connection.url.replace(/^https:/, "wss:")}/ws`, ["squadlings", `auth.${connection.token}`]);
}
