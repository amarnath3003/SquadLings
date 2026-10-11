import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const publicDir = new URL("./public/", import.meta.url);
export const BUG_IDS = Array.from({ length: 10 }, (_, i) => `BM-${String(i + 1).padStart(2, "0")}`);

export function createBuggyMart(bugs = "all") {
  const enabled = bugs === "all" ? BUG_IDS : bugs === "none" ? [] : bugs.split(",").map(s => s.trim());
  if (enabled.some(id => !BUG_IDS.includes(id))) throw new Error(`Unknown bug selection: ${bugs}`);
  const assets: Record<string, [string, string]> = {
    "/app.js": ["app.js", "text/javascript"],
    "/styles.css": ["styles.css", "text/css"],
  };
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'self'");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/config.json") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(req.method === "HEAD" ? undefined : JSON.stringify({ enabled }));
      return;
    }
    if (url.pathname === "/favicon.ico") { res.writeHead(204).end(); return; }
    const route = /^\/(?:search|cart|checkout|order|product\/[a-z-]+)?$/.test(url.pathname);
    const asset = assets[url.pathname] ?? (route ? ["index.html", "text/html"] : undefined);
    // Only public assets and known app routes are served. The answer key stays on disk.
    if (!asset) { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); return; }
    try {
      const body = await readFile(new URL(asset[0]!, publicDir));
      res.writeHead(200, { "Content-Type": `${asset[1]}; charset=utf-8` }).end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain" }).end("Could not load BuggyMart assets.");
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    port: { type: "string", default: "3001" },
    bugs: { type: "string", default: process.env.BUGGYMART_BUGS ?? "all" },
    help: { type: "boolean", short: "h" },
  } });
  if (values.help) {
    console.log("npm run buggymart -- [--port 3001] [--bugs all|none|BM-02,BM-09]");
  } else {
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535.");
    const server = createBuggyMart(values.bugs);
    server.on("error", error => { console.error(error.message); process.exitCode = 1; });
    server.listen(port, "127.0.0.1", () => console.log(`BuggyMart: http://127.0.0.1:${port}\nBugs: ${values.bugs} · local demo only · no API key needed`));
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
      server.close();
      server.closeAllConnections();
    });
  }
}
