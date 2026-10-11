import { useEffect, useState } from "react";
import App from "./App";
import { checkConnection, initialConnection, remoteBackend, validateConnection, type BackendConnection } from "./backend";
import "./styles/backend.css";

export function BackendGate() {
  const [ready, setReady] = useState(!remoteBackend);
  const [url, setUrl] = useState(initialConnection?.url ?? "");
  const [token, setToken] = useState(initialConnection?.token ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connect(value: BackendConnection) {
    setBusy(true);
    setError("");
    try {
      await checkConnection(validateConnection(value));
      setReady(true);
    } catch (err) {
      setError(err instanceof TypeError ? "Couldn't reach your laptop. Keep the backend and sharing terminal running, then check the address." : err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (remoteBackend && initialConnection) void connect(initialConnection);
  }, []);

  if (ready) return <App />;
  return (
    <main className="backend-gate">
      <form onSubmit={(event) => { event.preventDefault(); void connect({ url, token }); }}>
        <img src="/favicon.svg" width="52" height="52" alt="" />
        <h1>Connect your squad</h1>
        <p>Your agents work on your laptop. Connect here to watch them and send tasks.</p>
        <label htmlFor="backend-url">Laptop address</label>
        <input id="backend-url" type="url" required placeholder="https://your-tunnel.trycloudflare.com" value={url} onChange={(event) => setUrl(event.target.value)} autoComplete="off" spellCheck={false} />
        <label htmlFor="backend-key">Access key</label>
        <input id="backend-key" type="password" required value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" />
        <button type="submit" disabled={busy}>{busy ? "Connecting…" : "Connect"}</button>
        {error && <p role="alert" className="backend-error">{error}</p>}
        <p className="backend-help">On the laptop running SquadLings, run <code>npm run share</code> and open its private connection link.</p>
      </form>
    </main>
  );
}
