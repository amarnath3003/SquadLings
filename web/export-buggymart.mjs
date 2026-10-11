// Publish only the shop's three public source files, never its answer key or server.
import { mkdir, readFile, writeFile } from "node:fs/promises";
const source = new URL("../targets/buggymart/public/", import.meta.url);
const output = new URL("./dist/buggymart/", import.meta.url);
const ids = Array.from({ length: 10 }, (_, i) => `BM-${String(i + 1).padStart(2, "0")}`);
for (const fixed of [false, true]) {
  const folder = new URL(fixed ? "fixed/" : "./", output);
  const base = fixed ? "/buggymart/fixed/" : "/buggymart/";
  await mkdir(folder, { recursive: true });
  for (const name of ["index.html", "app.js", "styles.css"]) {
    let body = await readFile(new URL(name, source), "utf8");
    if (name === "index.html") body = body.replace('<base href="/">', `<base href="${base}">`);
    await writeFile(new URL(name, folder), body);
  }
  await writeFile(new URL("config.json", folder), JSON.stringify({ enabled: fixed ? [] : ids }));
}
await writeFile(new URL("404.html", output), '<!doctype html><html lang="en"><meta charset="utf-8"><title>Not found · BuggyMart</title><h1>Not found</h1><p>This shop page does not exist.</p><a href="/buggymart/">Back to BuggyMart</a></html>');
console.log("BuggyMart exported at /buggymart/ and /buggymart/fixed/.");
