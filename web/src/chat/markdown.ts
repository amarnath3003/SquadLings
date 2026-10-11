// Markdown, ported from ui/app.js: a small, safe subset. Everything is escaped; only these tags come
// out (p, br, strong, em, code, a with http(s) links, ul/ol/li, h4, table), so the result can go into
// dangerouslySetInnerHTML.
import { shortUrl } from "../live/store";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const link = (url: string, label: string) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(/^https?:\/\//.test(label) ? shortUrl(label) : label)}</a>`;

function inline(text: unknown) {
  const tokens: string[] = [];
  const keep = (html: string) => `\u0000${tokens.push(html) - 1}\u0000`;
  let t = String(text ?? "");
  t = t.replace(/`([^`\n]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`));
  t = t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => keep(link(url, label)));
  t = t.replace(/https?:\/\/[^\s<>"'`\u0000]+/g, (raw) => {
    const [, url, tail] = /^(.*?)([.,;:!?)\]]*)$/.exec(raw)!;
    return keep(link(url, url)) + tail;
  });
  t = esc(t)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*\n]*)\*(?=$|[\s.,;:!?)])/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\s][^_\n]*)_(?=$|[\s.,;:!?)])/g, "$1<em>$2</em>");
  return t.replace(/\u0000(\d+)\u0000/g, (_, n) => tokens[Number(n)]);
}

export function md(src: unknown) {
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  const row = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const sep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const item = /^\s*([-*•]|\d+[.)])\s+(.*)$/;
  const heading = /^\s*#{1,6}\s+(.*)$/;
  const tableAt = (i: number) => row(lines[i]) && i + 1 < lines.length && sep(lines[i + 1]);
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
    } else if (tableAt(i)) {
      const cells = (r: string) => r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => inline(c.trim()));
      const head = cells(l);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && row(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else if (heading.test(l)) {
      out.push(`<h4>${inline(heading.exec(l)![1])}</h4>`);
      i++;
    } else if (item.test(l)) {
      const ordered = /^\s*\d/.test(l);
      const items: string[] = [];
      while (i < lines.length && item.test(lines[i])) {
        items.push(inline(item.exec(lines[i++])![2]));
        while (i < lines.length && lines[i].trim() && !item.test(lines[i]) && /^\s{2,}/.test(lines[i])) items[items.length - 1] += `<br>${inline(lines[i++].trim())}`;
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.map((t) => `<li>${t}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !item.test(lines[i]) && !heading.test(lines[i]) && !tableAt(i)) para.push(inline(lines[i++].trim()));
      out.push(`<p>${para.join("<br>")}</p>`);
    }
  }
  return out.join("");
}
