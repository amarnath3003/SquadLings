// One bot's browser: Playwright Chromium, element snapshots, actions, and a visible cursor.
// Spike version of master.md §14 (browser server). Phase 1 moves it to server/src/browser/.
//
// The CLI spikes draw the cursor inside the page, because the Chromium window is their only
// "dashboard". That breaks D-03 (characters live in the dashboard overlay, never in the page), so it's
// a spike-only aid: pointer-events:none and aria-hidden, so it's skipped by snapshots, clicks
// and the model. The dashboard (`npm run ui`) sets cursorInPage: false and draws the cursor over
// the live frames from onCursor events instead. Turn it off with showCursor: false. Its motion is
// for the person watching; the real input stays plain Playwright input (no disguise, no CAPTCHA
// solving: master.md §17.8).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import type { Browser, BrowserContext, CDPSession, Page, Request } from "playwright";
import type { SitePolicy } from "./site-gate.ts";

export class ToolError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type Box = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

/** What the user decided about a human-check page: solved it in the window, skipped it, or no answer yet. */
export type HumanCheckAnswer = "solved" | "skipped" | "pending";

/** A window on screen, in screen points. */
export type WindowBounds = { left: number; top: number; width: number; height: number };

/** Where the cursor goes and what it does, in viewport CSS px: for a cursor drawn by the dashboard (D-03). */
export type CursorEvent = { kind: "move" | "click" | "think"; x: number; y: number; box: Box | null; glideMs: number; why: string };

/** A live frame of the active page (CDP screencast, §14.6). `width`/`height` are the page's CSS size. */
export type Frame = { jpeg: Buffer; width: number; height: number };

/**
 * The user's own input while they control the browser (§14.7 takeover). x and y are 0–1 within the
 * page. It is replayed with Playwright and never logged or shown to a model.
 */
export type UserInput =
  | { kind: "move" | "down" | "up"; x: number; y: number; button?: "left" | "middle" | "right"; clickCount?: number }
  | { kind: "wheel"; x: number; y: number; dx: number; dy: number }
  | { kind: "key"; key: string; ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean }
  | { kind: "text"; text: string };

/** Named keys the user may press while in control (single characters are typed as text). */
const USER_KEYS = new Set([
  "Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown", " ",
]);
/** How long a bot's tool call waits for the user to hand the browser back (under the tunnel's 100 s limit). */
const USER_WAIT_MS = 45000;

export type BrowserOptions = {
  headless: boolean;
  /** The page size in CSS px. With `window`, it's measured from the window instead (this is the first guess). */
  viewport: { width: number; height: number };
  /**
   * Put the window here, with the page zoomed out by `zoom` (Chrome's own zoom, set in the profile),
   * so a small tile still shows a full desktop-width page: a 504-point tile at zoom 0.39 is a
   * 1280 CSS px page (measured 2026-10-11). Needs `profileDir`. Clicks and snapshots stay in CSS px.
   */
  window?: WindowBounds & { zoom: number };
  /** Cursor size multiplier, so its label stays readable in a zoomed-out window (default 1). */
  cursorScale?: number;
  showCursor: boolean;
  color: string; // cursor color: the bot's slot color (§7.1)
  label: string; // shown on the cursor, e.g. "Plum"
  /** Longest cursor glide; shorter moves glide for less (CURSOR_GLIDE_MS). */
  glideMs: number;
  /** Which sites the bot may open (§14.8): checked for every top-level navigation. */
  sites: SitePolicy;
  /** How long open() waits for the user to answer about a new site before APPROVAL_PENDING (default 45 s). */
  approvalWaitMs?: number;
  /** Called when a page is a CAPTCHA or bot wall: the user may solve it in the window (§17.5 takeover). */
  onHumanCheck?: (host: string, reason: string) => Promise<HumanCheckAnswer>;
  onKeyframe?: (jpeg: Buffer) => void;
  /** Draw the cursor inside the page (default true). Off, a dashboard draws it from onCursor. */
  cursorInPage?: boolean;
  /** Every cursor move, click and "thinking" pause (when showCursor is on). */
  onCursor?: (e: CursorEvent) => void;
  /** The active page loaded a new document (url), and later its title. */
  onPage?: (info: { url: string; title: string }) => void;
  /**
   * A persistent profile folder: cookies (consent choices, a human check the user solved) survive
   * between runs, as in a normal browser. Without it, every run starts with a clean profile.
   */
  profileDir?: string;
  /** Snapshot features (all on by default; off reproduces the earlier agent for evaluations). */
  features?: { linkTargets?: boolean; pageHints?: boolean };
};

type SnapElement = {
  ref: number;
  role: string;
  name: string;
  states: string[];
  href: string | null;
  box: Box;
  inView: boolean;
  sensitive: boolean;
};

type PageSnapshot = {
  title: string;
  url: string;
  description: string;
  vw: number;
  vh: number;
  scrollPct: number;
  headings: string[];
  total: number;
  elements: SnapElement[];
  humanCheck: string | null;
  cookieRefs: number[];
};

export const ALLOWED_KEYS = [
  "Enter", "Tab", "Shift+Tab", "Escape", "Space", "Backspace",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End",
] as const;

// §17.3 hard rules (no model call). Matching clicks are blocked outright.
const FORBIDDEN = /\b(pay( now)?|place order|complete purchase|confirm (and )?pay|buy now|send money|transfer|delete (my )?account|submit application)\b/i;

// Settling (§14.5) waits for requests the action caused that can change the element list.
// Images, media, fonts, beacons and long-lived streams don't (the old networkidle wait cost
// 3 s per action on pages that poll, like Bing; see scripts/tests/bench-browser.ts).
const SETTLE_TYPES = new Set(["document", "xhr", "fetch", "script", "stylesheet"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── In-page scripts (serialized by page.evaluate: no outer references) ──

/** §14.3: collect visible interactive elements, tag them with refs, return them in reading order. */
function collectElements(args: { snap: number; max: number; all: boolean }): PageSnapshot {
  const SEL = [
    "a[href]", "button", "input:not([type=hidden])", "select", "textarea", "summary", '[contenteditable="true"]',
    "[role=button]", "[role=link]", "[role=checkbox]", "[role=radio]", "[role=tab]", "[role=menuitem]", "[role=option]",
    "[role=switch]", "[role=combobox]", "[role=textbox]", "[role=searchbox]", "[role=slider]", "[onclick]",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");
  const clean = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  for (const old of document.querySelectorAll("[data-squadlings-ref]")) old.removeAttribute("data-squadlings-ref");

  const found = new Set<Element>();
  const walk = (root: Document | ShadowRoot) => {
    for (const e of root.querySelectorAll(SEL)) found.add(e);
    for (const e of root.querySelectorAll("*")) if (e.shadowRoot) walk(e.shadowRoot);
  };
  walk(document);

  // div-style buttons: cursor:pointer with their own text and no interactive ancestor (capped for big pages)
  let checked = 0;
  for (const e of document.body?.querySelectorAll("div,span,li,p,img,label,td") ?? []) {
    if (++checked > 4000) break;
    if (e.parentElement?.closest(SEL)) continue;
    const ownText = [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && clean(n.textContent));
    if (!ownText && e.tagName !== "IMG") continue;
    if (getComputedStyle(e).cursor === "pointer") found.add(e);
  }

  const visible = (e: Element) => {
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(e);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    return !e.closest('[aria-hidden="true"]');
  };

  const nameOf = (e: Element): string => {
    const el = e as HTMLInputElement;
    const tries: unknown[] = [e.getAttribute("aria-label")];
    const by = e.getAttribute("aria-labelledby");
    if (by) tries.push(by.split(/\s+/).map((id) => document.getElementById(id)?.innerText ?? "").join(" "));
    if (el.labels?.length) tries.push([...el.labels].map((l) => l.innerText).join(" "));
    const formField = e instanceof HTMLInputElement || e instanceof HTMLSelectElement || e instanceof HTMLTextAreaElement;
    if (!formField) tries.push((e as HTMLElement).innerText);
    tries.push(e.getAttribute("placeholder"), e.getAttribute("title"), e.getAttribute("alt"));
    if (e.tagName === "BUTTON" || ["submit", "button", "reset"].includes(el.type)) tries.push(el.value);
    tries.push(e.querySelector("img[alt]")?.getAttribute("alt"));
    for (const t of tries) if (clean(t)) return clean(t).slice(0, 80);
    return "";
  };

  const roleOf = (e: Element): string => {
    const explicit = e.getAttribute("role");
    if (explicit) return explicit;
    const tag = e.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button" || tag === "summary") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      const t = ((e as HTMLInputElement).type || "text").toLowerCase();
      if (t === "search") return "searchbox";
      if (t === "checkbox" || t === "radio") return t;
      if (["button", "submit", "reset", "image"].includes(t)) return "button";
      if (t === "range") return "slider";
      return "textbox";
    }
    if ((e as HTMLElement).isContentEditable) return "textbox";
    return tag === "img" ? "image" : "button";
  };

  const statesOf = (e: Element): string[] => {
    const el = e as HTMLInputElement;
    const s: string[] = [];
    if (el.disabled || e.getAttribute("aria-disabled") === "true") s.push("disabled");
    if (el.type === "checkbox" || el.type === "radio") s.push(`checked=${el.checked}`);
    else if (e.getAttribute("aria-checked")) s.push(`checked=${e.getAttribute("aria-checked")}`);
    if (e.getAttribute("aria-selected") === "true") s.push("selected");
    if (e.getAttribute("aria-expanded")) s.push(`expanded=${e.getAttribute("aria-expanded")}`);
    if (el.required) s.push("required");
    if (e.getAttribute("aria-invalid") === "true") s.push("invalid");
    if (document.activeElement === e) s.push("focused");
    const textField = (e instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "reset", "image"].includes(el.type)) || e instanceof HTMLTextAreaElement;
    if (textField && el.value) s.push(`value="${el.type === "password" ? "••••" : clean(el.value).slice(0, 60)}"`);
    if (e instanceof HTMLSelectElement) s.push(`value="${clean(e.selectedOptions[0]?.text).slice(0, 60)}"`);
    return s;
  };

  const sensitive = (e: Element) => {
    const el = e as HTMLInputElement;
    return el.type === "password" || /^cc-/.test(e.getAttribute("autocomplete") ?? "");
  };

  /** Where a link goes, if it leads to another page (not "#", javascript: or mailto:). */
  const hrefOf = (e: Element): string | null => {
    if (!(e instanceof HTMLAnchorElement) || !e.href || !/^https?:/i.test(e.href)) return null;
    const u = new URL(e.href);
    if (u.href.split("#")[0] === location.href.split("#")[0]) return null;
    return u.href;
  };

  type Item = { e: Element; name: string; r: DOMRect; inView: boolean };
  const items: Item[] = [];
  for (const e of found) {
    if (!visible(e)) continue;
    const name = nameOf(e);
    const parent = e.parentElement?.closest(SEL);
    if (parent && found.has(parent) && nameOf(parent) === name) continue; // nested duplicate, e.g. span in a link
    const r = e.getBoundingClientRect();
    items.push({ e, name, r, inView: r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw });
  }
  items.sort((a, b) => Number(b.inView) - Number(a.inView) || Math.round(a.r.top / 10) - Math.round(b.r.top / 10) || a.r.left - b.r.left);
  const shown = (args.all ? items : items.filter((i) => i.inView)).slice(0, args.max);

  // Cookie and consent banners: their buttons, so the bot can close the banner in one click.
  const CONSENT_NAME = /^(accept( all)?( cookies)?|reject( all)?( cookies)?|allow all( cookies)?|i agree|agree( and close)?|got it|accept and close|necessary only|only necessary)$/i;
  const CONSENT_BOX = /cookie|consent|gdpr|privacy|onetrust|cmp/i;

  const elements = shown.map((it, i) => {
    it.e.setAttribute("data-squadlings-ref", `s${args.snap}-${i + 1}`);
    const r = it.r;
    return {
      ref: i + 1, role: roleOf(it.e), name: it.name, states: statesOf(it.e), href: hrefOf(it.e), inView: it.inView, sensitive: sensitive(it.e),
      box: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
    };
  });
  const inConsentBox = (e: Element) => {
    for (let n: Element | null = e; n; n = n.parentElement) {
      const cls = typeof n.className === "string" ? n.className : ""; // SVG elements have an object here
      if (n.getAttribute("role") === "dialog" || CONSENT_BOX.test(`${n.id} ${cls}`)) return true;
    }
    return false;
  };
  const cookieRefs = shown
    .map((it, i) => ({ it, ref: i + 1 }))
    .filter(({ it }) => CONSENT_NAME.test(it.name) && inConsentBox(it.e))
    .map(({ ref }) => ref)
    .slice(0, 3);

  // CAPTCHA and bot-wall pages. Many normal pages embed an invisible reCAPTCHA for a form (seen live on a
  // news article), so a challenge frame only counts when it's visible and sizeable on a page with little
  // else on it; challenge wording counts in the title, or on a short page.
  const bodyText = document.body?.innerText ?? "";
  const CHALLENGE_FRAME = /recaptcha|hcaptcha|challenges\.cloudflare\.com|turnstile|arkoselabs|funcaptcha|captcha-delivery|perimeterx/i;
  const CHALLENGE_TEXT = /verify (that )?you('re| are) (a )?human|are you a robot|not a robot|unusual traffic|press (and|&) hold|checking your browser|just a moment\.\.\.|human verification|security check to continue|complete the captcha|enable javascript and cookies to continue|access to this page has been denied/i;
  const wallFrame = [...document.querySelectorAll("iframe")].find((f) => {
    if (!CHALLENGE_FRAME.test(f.src)) return false;
    const r = f.getBoundingClientRect();
    const s = getComputedStyle(f);
    return r.width >= 250 && r.height >= 60 && r.bottom > 0 && r.top < vh && s.display !== "none" && s.visibility !== "hidden";
  });
  const titleMatch = CHALLENGE_TEXT.exec(document.title);
  const textMatch = bodyText.length < 4000 ? CHALLENGE_TEXT.exec(bodyText.slice(0, 2500)) : null;
  const humanCheck = wallFrame && bodyText.length < 3000
    ? `challenge frame (${CHALLENGE_FRAME.exec(wallFrame.src)![0]})`
    : titleMatch ?? textMatch ? `"${(titleMatch ?? textMatch)![0]}"` : null;

  const maxScroll = document.documentElement.scrollHeight - vh;
  return {
    title: document.title,
    url: location.href,
    description: clean(document.querySelector('meta[name="description"],meta[property="og:description"]')?.getAttribute("content")).slice(0, 160),
    vw,
    vh,
    scrollPct: maxScroll > 0 ? Math.round((window.scrollY / maxScroll) * 100) : 0,
    headings: [...document.querySelectorAll("h1,h2,h3")].filter(visible).map((h) => clean((h as HTMLElement).innerText).slice(0, 60)).filter(Boolean).slice(0, 8),
    total: args.all ? items.length : items.filter((i) => i.inView).length,
    elements,
    humanCheck,
    cookieRefs,
  };
}

/** Finds visible text on the page, scrolls the first match to the middle of the view, returns the matching lines. */
function findText(args: { query: string }): { count: number; lines: string[] } {
  const q = args.query.toLowerCase();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const hits: Element[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !n.textContent?.toLowerCase().includes(q) || el.closest('[aria-hidden="true"],script,style,noscript')) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) hits.push(el);
  }
  hits[0]?.scrollIntoView({ block: "center", behavior: "instant" });
  const lines = [...new Set(hits.map((h) => (h.closest("p,li,td,h1,h2,h3,h4,article,section,div") as HTMLElement | null ?? (h as HTMLElement)).innerText.replace(/\s+/g, " ").trim().slice(0, 300)))];
  return { count: hits.length, lines: lines.slice(0, 12) };
}

type CursorArgs = {
  from: Point;
  to: Point;
  box: Box | null;
  text: string;
  color: string;
  glideMs: number;
  size: number;
  click?: boolean;
  thinking?: boolean;
  hidden?: boolean;
};

/**
 * Draws or moves the spike cursor: a pointer, a label, and a box around the target. Moves follow a
 * gentle curve with ease-in-out (Web Animations on transform, so they stay smooth while the page is
 * busy); clicks add a ripple; "thinking" animates the label's dots while the model decides.
 */
function drawCursor(a: CursorArgs) {
  const ID = "__squadlings_cursor";
  let root = document.getElementById(ID);
  let frame = document.getElementById(`${ID}_box`);
  if (!root || !frame) {
    root = document.createElement("div");
    root.id = ID;
    root.setAttribute("aria-hidden", "true");
    root.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform";
    root.style.transform = `translate(${a.from.x}px, ${a.from.y}px)`;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.setAttribute("viewBox", "-2 -2 18 18");
    svg.style.cssText = "display:block;overflow:visible;transform-origin:2px 2px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))";
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", "M0 0 L14 5 L5 14 Z");
    path.setAttribute("fill", a.color);
    path.setAttribute("stroke", "#fff");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
    const label = document.createElement("div");
    label.dataset.label = "";
    // Dark text on light colors (Sky), white on the rest.
    const rgb = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(a.color);
    const light = rgb ? (0.299 * parseInt(rgb[1], 16) + 0.587 * parseInt(rgb[2], 16) + 0.114 * parseInt(rgb[3], 16)) / 255 > 0.65 : false;
    label.style.cssText = `margin:2px 0 0 16px;padding:2px 9px;border-radius:999px;background:${a.color};color:${light ? "#111" : "#fff"};font:600 12px/18px system-ui,-apple-system,sans-serif;white-space:nowrap;max-width:360px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 3px rgba(0,0,0,.25)`;
    // Pointer and label scale together (CSS zoom); the tip stays the hotspot at the root's origin.
    const body = document.createElement("div");
    body.style.zoom = String(a.size);
    body.append(svg, label);
    root.append(body);
    frame = document.createElement("div");
    frame.id = `${ID}_box`;
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = `position:fixed;z-index:2147483646;pointer-events:none;border:${Math.round(2 * a.size)}px solid ${a.color};border-radius:6px;opacity:0;transition:opacity 180ms ease-out`;
    document.documentElement.append(root, frame);
    root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); // a new page: fade in where the cursor was
  }
  root.style.display = a.hidden ? "none" : "";
  frame.style.display = a.hidden ? "none" : "";
  if (a.hidden) return;

  const label = root.querySelector<HTMLElement>("[data-label]")!;
  label.textContent = a.text;
  if (a.thinking) {
    const dots = document.createElement("span");
    dots.textContent = " •••";
    label.append(dots);
    dots.animate([{ opacity: 0.25 }, { opacity: 1 }, { opacity: 0.25 }], { duration: 1100, iterations: Infinity });
  }

  // Move along a quadratic curve that bows to one side of the straight line, easing in and out.
  const dx = a.to.x - a.from.x;
  const dy = a.to.y - a.from.y;
  const dist = Math.hypot(dx, dy);
  root.getAnimations().forEach((an) => an.cancel());
  root.style.transform = `translate(${a.to.x}px, ${a.to.y}px)`;
  if (dist > 2 && a.glideMs > 0) {
    // Long moves overshoot a little and settle back, the way a hand does; short hops land directly.
    const over = dist > 300 ? Math.min(dist * 0.025, 10) : 0;
    const end = { x: a.to.x + (dx / dist) * over, y: a.to.y + (dy / dist) * over };
    const bow = Math.min(dist * 0.12, 60);
    const cx = (a.from.x + end.x) / 2 - (dy / dist) * bow;
    const cy = (a.from.y + end.y) / 2 + (dx / dist) * bow;
    const reach = over ? 0.86 : 1; // the share of the glide spent reaching `end`
    const keyframes: Keyframe[] = Array.from({ length: 13 }, (_, i) => {
      const t = i / 12;
      const x = (1 - t) ** 2 * a.from.x + 2 * (1 - t) * t * cx + t ** 2 * end.x;
      const y = (1 - t) ** 2 * a.from.y + 2 * (1 - t) * t * cy + t ** 2 * end.y;
      return { transform: `translate(${x}px, ${y}px)`, offset: t * reach };
    });
    if (over) keyframes.push({ transform: `translate(${a.to.x}px, ${a.to.y}px)`, offset: 1 });
    root.animate(keyframes, { duration: a.glideMs, easing: "cubic-bezier(.45,.05,.25,1)" });
  }

  if (a.box) {
    Object.assign(frame.style, { left: `${a.box.x - 3}px`, top: `${a.box.y - 3}px`, width: `${a.box.width + 2}px`, height: `${a.box.height + 2}px`, opacity: "1" });
    frame.animate([{ transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 180, easing: "ease-out" });
  } else {
    frame.style.opacity = "0";
  }

  if (a.click) {
    root.querySelector("svg")?.animate([{ transform: "scale(1)" }, { transform: "scale(.75)" }, { transform: "scale(1)" }], { duration: 200, easing: "ease-out" });
    const ripple = document.createElement("div");
    ripple.setAttribute("aria-hidden", "true");
    const r = 14 * a.size;
    ripple.style.cssText = `position:fixed;left:${a.to.x - r}px;top:${a.to.y - r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;border:${Math.round(2 * a.size)}px solid ${a.color};z-index:2147483646;pointer-events:none`;
    document.documentElement.append(ripple);
    ripple.animate([{ transform: "scale(.3)", opacity: 0.9 }, { transform: "scale(1.8)", opacity: 0 }], { duration: 450, easing: "ease-out" }).finished.then(() => ripple.remove(), () => ripple.remove());
  }
}

// ── BotBrowser ──────────────────────────────────────

export class BotBrowser {
  browser: Browser | null; // null with a persistent profile (the context owns the browser)
  context: BrowserContext;
  page: Page;
  opts: BrowserOptions;
  private snapId = 0;
  private refs = new Map<number, SnapElement>();
  private notes: string[] = [];
  private blockedHost: string | undefined;
  private cursorAt: Point = { x: 40, y: 40 };
  private chain: Promise<unknown> = Promise.resolve();
  private keyframe: Promise<void> = Promise.resolve(); // taken after a result is returned; the next action waits for it
  private firstPage: Page;
  private navigated = new WeakSet<Page>(); // pages that loaded at least one http(s) document
  private closingBlocked = new WeakSet<Page>(); // tabs we close ourselves (no "tab closed" note)
  private inflight = new Map<Request, number>(); // requests that can change the element list → start time
  private lastNavigationAt = 0; // when the latest top-level document request started
  private humanChecked = new Set<string>(); // pages already handed to the user (url)
  private lastHumanCheck: string | null = null; // why the latest snapshot looks like a human check
  /** URL + element names of the latest snapshot: unchanged after an action means no progress (§11.5). */
  progressKey = "";
  /** The page size in CSS px: the emulated viewport, or a placed window's measured size. */
  viewport: { width: number; height: number };
  frames = 0;
  humanChecks = 0;
  private cast?: { onFrame: (f: Frame) => void; everyMs: number; quality: number; seq: number; cdp?: CDPSession; last: number; pending?: Frame; timer?: ReturnType<typeof setTimeout> };
  private control?: { done: Promise<void>; end: () => void };

  private constructor(browser: Browser | null, context: BrowserContext, page: Page, opts: BrowserOptions) {
    this.browser = browser;
    this.context = context;
    this.page = page;
    this.firstPage = page;
    this.opts = opts;
    this.viewport = { ...opts.viewport };
  }

  static async launch(opts: BrowserOptions): Promise<BotBrowser> {
    const { width, height } = opts.viewport;
    const win = opts.window;
    if (win && !opts.profileDir) throw new Error("BotBrowser: window placement needs a profileDir (the zoom lives in the profile)");
    // A placed window has no emulated viewport: the page is the window's size at the profile's zoom.
    const args = win
      ? [`--window-position=${Math.round(win.left)},${Math.round(win.top)}`, `--window-size=${Math.round(win.width)},${Math.round(win.height)}`]
      : [`--window-size=${width},${height + 90}`];
    const contextOptions = win
      ? { viewport: null, acceptDownloads: false, locale: "en-US" }
      : { viewport: opts.viewport, deviceScaleFactor: 1, acceptDownloads: false, locale: "en-US" };
    let browser: Browser | null;
    let context: BrowserContext;
    if (opts.profileDir) {
      setProfileZoom(opts.profileDir, win?.zoom ?? 1);
      context = await chromium.launchPersistentContext(opts.profileDir, { headless: opts.headless, args, ...contextOptions });
      browser = context.browser();
    } else {
      browser = await chromium.launch({ headless: opts.headless, args });
      context = await browser.newContext(contextOptions);
    }
    const page = context.pages()[0] ?? (await context.newPage());
    const bot = new BotBrowser(browser, context, page, opts);
    await bot.init();
    if (win) await bot.place(win);
    return bot;
  }

  /** Moves the window (screen points) and measures the page size it now has. */
  async place(bounds: WindowBounds) {
    if (this.opts.headless) return;
    try {
      const cdp = await this.context.newCDPSession(this.page);
      const { windowId } = await cdp.send("Browser.getWindowForTarget");
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { left: Math.round(bounds.left), top: Math.round(bounds.top), width: Math.round(bounds.width), height: Math.round(bounds.height) } });
      await cdp.detach().catch(() => {});
    } catch {
      // the window stays where the launch flags put it
    }
    await this.measure();
  }

  /** The usable screen area (screen points, without the menu bar and Dock), as the browser sees it. */
  async screenArea(): Promise<WindowBounds> {
    return this.page.evaluate(() => {
      const s = screen as Screen & { availLeft?: number; availTop?: number };
      return { left: s.availLeft ?? 0, top: s.availTop ?? 0, width: s.availWidth, height: s.availHeight };
    });
  }

  /** Reads the page size (CSS px) from the page, for a window without an emulated viewport. */
  private async measure() {
    if (!this.opts.window) return;
    const vp = await this.page.evaluate(() => ({ width: innerWidth, height: innerHeight })).catch(() => null);
    if (vp?.width && vp.height) this.viewport = vp;
  }

  private async init() {
    // §14.8: stop top-level navigations to sites that aren't allowed. Never wait on the user here:
    // a held navigation races page timeouts (live bug, 2026-10-10). Unknown sites are asked about in
    // the background, and open() is where the bot waits for the answer. (Routing disables the HTTP cache.)
    await this.context.route("**/*", async (route) => {
      const req = route.request();
      // A new tab's first navigation has no frame yet (req.frame() throws): it's top-level too.
      // Treating it as a sub-request let pop-ups skip this check (found by the self-test, 2026-10-10).
      let frame: ReturnType<typeof req.frame> | undefined;
      try {
        frame = req.frame();
      } catch {
        // a navigation before its frame exists, or a service-worker request
      }
      const topLevel = req.isNavigationRequest() && !frame?.parentFrame();
      if (!topLevel || !/^https?:/i.test(req.url())) return route.continue().catch(() => {});
      const host = new URL(req.url()).hostname;
      const state = this.opts.sites.check(host);
      if (state === "allowed") return route.continue().catch(() => {});
      this.blockedHost = host;
      if (state === "denied") {
        this.note(`${host} isn't allowed, so the page didn't change. Use another site.`);
      } else {
        this.note(`Opening ${host} needs the user's OK, so the page didn't change. They've been asked: call open with the URL to wait for their answer, or use another site.`);
        void this.opts.sites.request(host, { reason: "a link or redirect" });
      }
      await route.abort("aborted").catch(() => {}); // a plain cancel: "blockedbyclient" leaves Chromium's error page
      await this.closeBlockedTabs(host);
    });
    this.context.on("page", (p) => {
      this.watch(p);
      this.setPage(p);
      this.note("A new tab opened and is now your active page.");
    });
    this.watch(this.page);
    await this.page.setContent(
      `<title>SquadLings · ${this.opts.label}</title><body style="margin:0;height:100vh;display:grid;place-items:center;font:18px system-ui,sans-serif;color:#111">` +
        `<div style="text-align:center"><div style="width:56px;height:56px;border-radius:50%;background:${this.opts.color};margin:0 auto 16px"></div>` +
        `${this.opts.label} is waiting for its first instruction…</div></body>`,
    );
  }

  private watch(p: Page) {
    p.on("framenavigated", (f) => {
      if (f !== p.mainFrame()) return;
      if (/^https?:/i.test(f.url())) this.navigated.add(p);
      if (p === this.page) this.opts.onPage?.({ url: f.url(), title: "" });
    });
    p.on("domcontentloaded", () => {
      if (p === this.page && this.opts.onPage) void p.title().then((title) => this.opts.onPage?.({ url: p.url(), title }), () => {});
    });
    // In-flight requests that can change the element list, for settling.
    p.on("request", (r) => {
      if (!SETTLE_TYPES.has(r.resourceType())) return;
      this.inflight.set(r, performance.now());
      if (r.isNavigationRequest() && r.resourceType() === "document") {
        try {
          if (!r.frame().parentFrame()) this.lastNavigationAt = performance.now();
        } catch {
          this.lastNavigationAt = performance.now(); // a new tab's first navigation
        }
      }
    });
    const done = (r: Request) => this.inflight.delete(r);
    p.on("requestfinished", done);
    p.on("requestfailed", done);
    // Alerts and "leave this page?" are accepted (a dismissed beforeunload traps the bot on the page);
    // confirm and prompt are dismissed, so nothing is confirmed on the user's behalf (§14.2).
    p.on("dialog", async (d) => {
      const kind = d.type();
      const accept = kind === "alert" || kind === "beforeunload";
      this.note(`A ${kind} dialog said "${d.message().slice(0, 200)}" and was ${accept ? "accepted" : "dismissed"}.`);
      await (accept ? d.accept() : d.dismiss()).catch(() => {});
    });
    p.on("close", () => {
      if (this.page !== p || this.closingBlocked.has(p)) return;
      const open = this.context.pages().filter((x) => !x.isClosed());
      if (open.length) {
        this.setPage(open[open.length - 1]);
        this.note("The active tab closed; switched to the previous tab.");
      }
    });
  }

  /** Closes new tabs that never loaded a page because their navigation was blocked, and says so once. */
  private async closeBlockedTabs(host: string) {
    const blocked = this.context.pages().filter((p) => {
      const url = p.url();
      return p !== this.firstPage && !p.isClosed() && !this.navigated.has(p) && (url === "" || url === "about:blank" || url.startsWith("chrome-error://"));
    });
    if (!blocked.length) return;
    for (const p of blocked) this.closingBlocked.add(p);
    await Promise.all(blocked.map((p) => p.close().catch(() => {})));
    const open = this.context.pages().filter((p) => !p.isClosed());
    if (this.page.isClosed() && open.length) this.setPage(open[open.length - 1]);
    this.notes = this.notes.filter((n) => !n.startsWith("A new tab opened"));
    this.note(`A new tab tried to open ${host}; it was closed, and your active page is unchanged.`);
  }

  /** Makes `p` the active page, and moves the screencast to it (§14.6). */
  private setPage(p: Page) {
    if (this.page === p) return;
    this.page = p;
    if (this.cast) void this.castTo(p);
    if (this.opts.onPage) void p.title().then((title) => this.opts.onPage?.({ url: p.url(), title }), () => {});
  }

  // ── Live frames (§14.6) ──

  /**
   * Streams the active page as JPEG frames, at most `fps` a second (the latest frame wins, so the
   * last change always arrives). Chrome sends frames only when the page changes; the stream follows
   * new tabs.
   */
  async startScreencast(onFrame: (f: Frame) => void, o: { fps?: number; quality?: number } = {}) {
    this.cast = { onFrame, everyMs: 1000 / (o.fps ?? 8), quality: o.quality ?? 55, seq: 0, last: 0 };
    await this.castTo(this.page);
  }

  async stopScreencast() {
    const c = this.cast;
    this.cast = undefined;
    if (!c) return;
    clearTimeout(c.timer);
    await c.cdp?.send("Page.stopScreencast").catch(() => {});
    await c.cdp?.detach().catch(() => {});
  }

  private async castTo(p: Page) {
    const c = this.cast;
    if (!c) return;
    const seq = ++c.seq;
    const old = c.cdp;
    c.cdp = undefined;
    if (old) {
      await old.send("Page.stopScreencast").catch(() => {});
      await old.detach().catch(() => {});
    }
    if (p.isClosed() || seq !== c.seq || this.cast !== c) return;
    let cdp: CDPSession;
    try {
      cdp = await this.context.newCDPSession(p);
    } catch {
      return; // the page closed meanwhile
    }
    if (seq !== c.seq || this.cast !== c) return void cdp.detach().catch(() => {});
    c.cdp = cdp;
    const emit = () => {
      c.timer = undefined;
      const f = c.pending;
      c.pending = undefined;
      if (!f || this.cast !== c) return;
      c.last = performance.now();
      c.onFrame(f);
    };
    cdp.on("Page.screencastFrame", (f) => {
      void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); // ack at once or Chrome stops
      if (seq !== c.seq) return;
      c.pending = { jpeg: Buffer.from(f.data, "base64"), width: Math.round(f.metadata.deviceWidth ?? this.viewport.width), height: Math.round(f.metadata.deviceHeight ?? this.viewport.height) };
      const wait = c.everyMs - (performance.now() - c.last);
      if (wait <= 0) emit();
      else c.timer ??= setTimeout(emit, wait);
    });
    const { width, height } = this.viewport;
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: c.quality, maxWidth: width, maxHeight: height, everyNthFrame: 1 }).catch(() => {});
  }

  // ── Takeover (§14.7) ──

  /** The user is controlling this browser: the bot's next actions wait (up to 45 s each). */
  get inControl() {
    return Boolean(this.control);
  }

  takeover(on: boolean) {
    if (on && !this.control) {
      let end!: () => void;
      const done = new Promise<void>((r) => (end = r));
      this.control = { done, end };
    } else if (!on && this.control) {
      this.control.end();
      this.control = undefined;
      this.note("The user finished a manual step in your browser (for example, a human check or a sign-in). Check the page with list_elements before you continue.");
    }
  }

  /** Waits while the user is in control; USER_IN_CONTROL if they keep it longer than USER_WAIT_MS. */
  private async waitForUser() {
    if (!this.control) return;
    const back = await Promise.race([this.control.done.then(() => true), sleep(USER_WAIT_MS).then(() => false)]);
    if (!back) throw new ToolError("USER_IN_CONTROL", "The user is controlling your browser right now (for example, to solve a human check or sign in). Wait, then try again; the page may change.");
  }

  /** Replays the user's input on the active page. Only while they're in control; never logged. */
  async userInput(e: UserInput) {
    if (!this.control) return;
    const { width, height } = this.viewport;
    const at = (x: number, y: number) => ({ x: Math.min(Math.max(x, 0), 1) * width, y: Math.min(Math.max(y, 0), 1) * height });
    const p = this.page;
    try {
      if (e.kind === "move") await p.mouse.move(at(e.x, e.y).x, at(e.x, e.y).y);
      else if (e.kind === "down" || e.kind === "up") {
        const pt = at(e.x, e.y);
        await p.mouse.move(pt.x, pt.y);
        const o = { button: e.button ?? "left", clickCount: Math.min(Math.max(e.clickCount ?? 1, 1), 3) };
        await (e.kind === "down" ? p.mouse.down(o) : p.mouse.up(o));
      } else if (e.kind === "wheel") {
        const pt = at(e.x, e.y);
        await p.mouse.move(pt.x, pt.y);
        await p.mouse.wheel(Math.max(-2000, Math.min(2000, e.dx)), Math.max(-2000, Math.min(2000, e.dy)));
      } else if (e.kind === "text") {
        if (e.text) await p.keyboard.insertText(e.text.slice(0, 2000));
      } else if (e.kind === "key") {
        const mods = [e.ctrl && "Control", e.meta && "Meta", e.alt && "Alt"].filter(Boolean) as string[];
        if (e.key.length === 1 && !mods.length) await p.keyboard.type(e.key);
        else if (USER_KEYS.has(e.key) || (e.key.length === 1 && mods.length)) {
          const key = e.key === " " ? "Space" : e.key;
          await p.keyboard.press([...mods, ...(e.shift && key.length > 1 ? ["Shift"] : []), key].join("+"));
        }
      }
    } catch {
      // the page navigated or closed under the input
    }
  }

  /** One action at a time (§14.9), each after the previous action's keyframe is saved, and never while the user is in control. */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.chain.then(() => this.keyframe).then(() => this.waitForUser(), () => this.waitForUser()).then(fn);
    this.chain = result.catch(() => {});
    return result;
  }

  /** Saves a keyframe of the current view now: when the bot finishes, and when the run ends (a closed chat shows it). */
  async keyframeNow() {
    if (!this.opts.onKeyframe || this.page.isClosed()) return;
    try {
      const jpeg = await this.page.screenshot({ type: "jpeg", quality: 60, scale: "css", timeout: 3000 });
      this.frames++;
      this.opts.onKeyframe(jpeg);
    } catch {
      // the page is closing or busy: the last keyframe stands
    }
  }

  /** Resolves once the latest keyframe is saved. */
  flushed(): Promise<void> {
    return this.chain.then(() => this.keyframe, () => this.keyframe);
  }

  async close() {
    this.takeover(false);
    await this.stopScreencast();
    await this.flushed();
    if (this.opts.profileDir) await this.context.close().catch(() => {});
    else await this.browser?.close().catch(() => {});
  }

  // ── Snapshot ──

  /** Formats a link target briefly: path only on the same site, host + path elsewhere. */
  private static target(href: string, pageUrl: string): string {
    const u = new URL(href);
    let here = "";
    try {
      here = new URL(pageUrl).host;
    } catch {
      // not an http page
    }
    const text = (u.host === here ? "" : u.host.replace(/^www\./, "")) + u.pathname + (u.search.length > 1 ? u.search : "");
    return text.length > 70 ? `${text.slice(0, 69)}…` : text;
  }

  async snapshot(all: boolean): Promise<string> {
    const snap = ++this.snapId;
    const s = await this.page.evaluate(collectElements, { snap, max: all ? 150 : 60, all });
    this.refs = new Map(s.elements.map((e) => [e.ref, e]));
    if (this.opts.window && s.vw && s.vh) this.viewport = { width: s.vw, height: s.vh }; // the user may resize the window
    // Focus moves with every click, so it isn't progress.
    this.progressKey = `${s.url}|${s.scrollPct}|${s.elements.map((e) => `${e.name}${e.states.filter((x) => x !== "focused").join("")}`).join("|")}`;
    let where = s.url;
    try {
      const u = new URL(s.url);
      where = u.protocol.startsWith("http") ? `${u.host}${u.pathname}${u.search.length > 1 ? u.search.slice(0, 50) : ""}` : s.url;
    } catch {
      // keep the raw URL
    }
    const lines = [`Page: "${s.title.slice(0, 80)}" — ${where}   (snapshot s${snap}, ${s.vw}×${s.vh}, scrolled ${s.scrollPct}%)`];
    const hints = this.opts.features?.pageHints !== false;
    if (!hints) s.humanCheck = null;
    if (s.humanCheck) {
      lines.push(`⚠ HUMAN CHECK: this page looks like a CAPTCHA or bot wall (${s.humanCheck}). Never solve or bypass it. The same facts are often on this site's normal pages (home, search, product or listing pages), on another site, or via web_search.`);
    }
    if (hints && s.description) lines.push(`About: ${s.description}`);
    if (s.headings.length) lines.push(`Headings: ${s.headings.join(" · ")}`);
    if (hints && s.cookieRefs.length) lines.push(`Cookie banner: ${s.cookieRefs.map((r) => `[${r}] "${this.refs.get(r)?.name}"`).join(", ")} closes it.`);
    lines.push(all ? "Elements:" : "Elements in view:");
    for (const e of s.elements) {
      const target = e.href && this.opts.features?.linkTargets !== false ? ` → ${BotBrowser.target(e.href, s.url)}` : "";
      lines.push(`[${e.ref}] ${e.role} "${e.name}"${e.states.length ? " " + e.states.join(" ") : ""}${target}`);
    }
    if (!s.elements.length) lines.push("(no interactive elements in view)");
    if (s.total > s.elements.length) lines.push(`… ${s.total - s.elements.length} more not listed. Call list_elements with scope "all".`);
    else if (!all) lines.push('Scroll, find, or call list_elements with scope "all", to see more.');
    this.lastHumanCheck = s.humanCheck;
    return lines.join("\n");
  }

  private resolve(ref: number) {
    const el = this.refs.get(ref);
    if (!el) throw new ToolError("NOT_FOUND", `No element [${ref}] in the latest list. Use a number from the latest list.`);
    return { el, locator: this.page.locator(`[data-squadlings-ref="s${this.snapId}-${ref}"]`) };
  }

  /** Scrolls the element into view and returns its center point and box (viewport CSS px). */
  private async target(ref: number) {
    const { el, locator } = this.resolve(ref);
    if ((await locator.count()) === 0) throw new ToolError("STALE_REF", `Element [${ref}] is gone from the page. Call list_elements again.`);
    await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    const b = await locator.boundingBox();
    if (!b) throw new ToolError("STALE_REF", `Element [${ref}] isn't visible any more. Call list_elements again.`);
    const vp = this.viewport;
    const pt = { x: Math.min(Math.max(b.x + b.width / 2, 1), vp.width - 1), y: Math.min(Math.max(b.y + b.height / 2, 1), vp.height - 1) };
    return { el, locator, pt, box: { x: b.x, y: b.y, width: b.width, height: b.height } };
  }

  // ── Cursor ──

  /** Glide time for a move: short hops are quick, long moves take up to glideMs. */
  private glideFor(to: Point): number {
    const dist = Math.hypot(to.x - this.cursorAt.x, to.y - this.cursorAt.y);
    return Math.round(Math.min(this.opts.glideMs, 110 + dist * 0.3));
  }

  private drawArgs(extra: Partial<CursorArgs>): CursorArgs {
    return { from: this.cursorAt, to: this.cursorAt, box: null, text: this.opts.label, color: this.opts.color, glideMs: 0, size: this.opts.cursorScale ?? 1, ...extra };
  }

  /** Draws the cursor in the page and/or tells the dashboard (onCursor). `why` is the caption ("thinking" while the model decides). */
  private async cursor(why: string, extra: Partial<CursorArgs> = {}) {
    if (!this.opts.showCursor) return;
    const a = this.drawArgs({ text: `${this.opts.label} · ${why}`, ...extra });
    if (!a.hidden) this.opts.onCursor?.({ kind: a.click ? "click" : a.thinking ? "think" : "move", x: a.to.x, y: a.to.y, box: a.box, glideMs: a.glideMs, why });
    if (this.opts.cursorInPage !== false) await this.page.evaluate(drawCursor, a).catch(() => {});
  }

  /**
   * Glides the cursor to `to` (and the real pointer with it, so hover effects show), then returns
   * when it has landed. `work` runs during the glide (for example, the click hit-test).
   */
  private async moveTo<T>(to: Point, box: Box | null, why: string, work?: () => Promise<T>): Promise<T | undefined> {
    const glide = this.opts.showCursor ? this.glideFor(to) : 0;
    const started = performance.now();
    await this.cursor(why, { to, box, glideMs: glide });
    this.cursorAt = to;
    const steps = Math.max(1, Math.round(glide / 40));
    const [, result] = await Promise.all([
      this.page.mouse.move(to.x, to.y, { steps }).catch(() => {}),
      work?.(),
    ]);
    const left = glide - (performance.now() - started);
    if (left > 0) await sleep(left); // let the glide land before acting
    return result;
  }

  private async clickEffect(at: Point, box: Box | null, why: string) {
    await this.cursor(why, { to: at, box, click: true });
  }

  /** Shows "Plum · thinking •••" where the cursor rests, while the model decides the next step. */
  private async thinking() {
    await this.cursor("thinking", { thinking: true });
  }

  // ── Settling (§14.5) ──

  /**
   * Waits until the action's effects have landed: a navigation it started has reached
   * DOMContentLoaded, the requests it caused that can change the element list have finished
   * (polling, long-lived requests, images and media don't count), and the DOM has stopped changing.
   */
  private async settle(actionStart: number): Promise<number> {
    const t0 = performance.now();
    await sleep(80); // let a click-triggered navigation or fetch start
    const quietNetwork = async (since: number, capMs: number) => {
      const deadline = performance.now() + capMs;
      for (;;) {
        const now = performance.now();
        // Count requests that started after `since` and aren't long-lived (> 2.5 s means polling or a stream).
        const busy = [...this.inflight.values()].some((start) => start >= since && now - start < 2500);
        if (!busy || now > deadline) return;
        await sleep(40);
      }
    };
    await quietNetwork(actionStart, 4000);
    if (this.lastNavigationAt >= actionStart) {
      await this.page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
      await quietNetwork(this.lastNavigationAt, 2000); // the new page's own data and scripts
    }
    await this.page
      .evaluate(
        () =>
          new Promise<void>((resolve) => {
            const done = () => {
              obs.disconnect();
              clearTimeout(quiet);
              clearTimeout(cap);
              resolve();
            };
            let quiet = setTimeout(done, 200);
            const cap = setTimeout(done, 1500);
            // Changes inside aria-hidden parts (our cursor, its ripple) don't affect the element list.
            const hidden = (r: MutationRecord) => {
              const el = r.target.nodeType === 1 ? (r.target as Element) : r.target.parentElement;
              if (el?.closest('[aria-hidden="true"]')) return true;
              if (r.type !== "childList") return false;
              const nodes = [...r.addedNodes, ...r.removedNodes];
              return nodes.length > 0 && nodes.every((n) => n.nodeType === 1 && (n as Element).getAttribute("aria-hidden") === "true");
            };
            const obs = new MutationObserver((records) => {
              if (records.every(hidden)) return;
              clearTimeout(quiet);
              quiet = setTimeout(done, 200);
            });
            obs.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
          }),
      )
      .catch(() => {});
    return performance.now() - t0;
  }

  /** Settles, saves a keyframe in the background, and returns the outcome line plus a fresh snapshot and notes. */
  private async after(outcome: string, actionStart: number): Promise<string> {
    const ms = await this.settle(actionStart);
    if (this.page.url().startsWith("chrome-error://") && this.blockedHost) {
      await this.page.goBack({ waitUntil: "domcontentloaded", timeout: 5000 }).catch(() => {}); // stay where we were
    }
    let snap = await this.snapshot(false).catch((err) => `(snapshot failed: ${err instanceof Error ? err.message : err})`);
    if (this.lastHumanCheck) snap = await this.handleHumanCheck(snap);
    // A navigation replaced the document (and the cursor): draw it where it was, in its "thinking" state.
    await this.thinking();
    if (this.opts.onKeyframe) {
      // In the background: the model gets the result now; the screenshot is done long before it acts again.
      this.keyframe = this.page.screenshot({ type: "jpeg", quality: 60, scale: "css" }).then(
        (jpeg) => {
          this.frames++;
          this.opts.onKeyframe?.(jpeg);
        },
        () => {},
      );
    }
    return [`${outcome} (settled in ${(ms / 1000).toFixed(1)} s)`, snap, ...this.takeNotes()].join("\n");
  }

  /** A CAPTCHA or bot wall: offer it to the user once (§17.5); if they solve it, continue on the real page. */
  private async handleHumanCheck(snap: string): Promise<string> {
    const url = this.page.url();
    const reason = this.lastHumanCheck ?? "";
    if (this.humanChecked.has(url) || !this.opts.onHumanCheck) return snap;
    this.humanChecked.add(url);
    this.humanChecks++;
    const host = URL.canParse(url) ? new URL(url).hostname : url;
    const answer = await this.opts.onHumanCheck(host, reason);
    if (answer === "solved") {
      await this.settle(performance.now());
      this.note("The user completed the human check in the browser window.");
      return this.snapshot(false);
    }
    this.note(`${answer === "pending" ? "The user hasn't dealt with the human check yet." : "The user skipped the human check."} Leave that page: try this site's normal pages (home, search, listings), another site, or web_search.`);
    return snap;
  }

  /** Adds a line to the next tool result (dialogs, tabs, the user's site decisions). */
  note(text: string) {
    this.notes.push(text);
  }

  takeNotes(): string[] {
    const notes = this.notes;
    this.notes = [];
    return notes.length ? ["Notes:", ...notes.map((n) => `• ${n}`)] : [];
  }

  // ── Tools (§15.2) ──

  listElements(scope: "viewport" | "all" = "viewport") {
    return this.run(async () => [await this.snapshot(scope === "all"), ...this.takeNotes()].join("\n"));
  }

  readText(query?: string, maxChars = 4000) {
    return this.run(async () => {
      // The main content, if a main/article block holds most of the page's text; otherwise the whole page.
      // (Bing's <main> is empty: reading only it returned nothing, live 2026-10-11.)
      const raw = await this.page.evaluate(() => {
        const body = document.body?.innerText ?? "";
        for (const sel of ["main", "[role=main]", "article"]) {
          const text = (document.querySelector(sel) as HTMLElement | null)?.innerText ?? "";
          if (text.trim().length >= 200 && text.length >= body.length * 0.3) return text;
        }
        return body;
      });
      const lines = raw.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
      let text: string;
      if (query) {
        const q = query.toLowerCase();
        const keep = new Set<number>();
        lines.forEach((l, i) => {
          if (l.toLowerCase().includes(q)) for (let j = i - 2; j <= i + 2; j++) if (j >= 0 && j < lines.length) keep.add(j);
        });
        text = keep.size ? [...keep].sort((a, b) => a - b).map((i) => lines[i]).join("\n") : `(no lines match "${query}")`;
      } else {
        text = lines.join("\n");
      }
      const cap = Math.min(Math.max(maxChars, 200), 4000);
      if (text.length > cap) text = `${text.slice(0, cap)}\n… (cut at ${cap} characters)`;
      return [`<<<PAGE_CONTENT (untrusted)>>>\n${text}\n<<<END_PAGE_CONTENT>>>`, ...this.takeNotes()].join("\n");
    });
  }

  /** Finds text on the page and scrolls to it: the matching lines, then the elements around it. */
  find(query: string) {
    return this.run(async () => {
      if (!query.trim()) throw new ToolError("INVALID_INPUT", "find needs some text to look for.");
      const r = await this.page.evaluate(findText, { query: query.trim() });
      if (!r.count) return [`No visible text matches "${query}" on this page.`, ...this.takeNotes()].join("\n");
      await sleep(60);
      const snap = await this.snapshot(false);
      return [
        `Found "${query}" ${r.count} time${r.count === 1 ? "" : "s"}; scrolled to the first.`,
        `<<<PAGE_CONTENT (untrusted)>>>\n${r.lines.join("\n")}\n<<<END_PAGE_CONTENT>>>`,
        snap,
        ...this.takeNotes(),
      ].join("\n");
    });
  }

  open(url: string, why: string) {
    return this.run(async () => {
      const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      if (!URL.canParse(full)) throw new ToolError("INVALID_INPUT", `"${url}" isn't a valid URL.`);
      const host = new URL(full).hostname;
      // Ask about a new site before navigating, so the page-load timeout doesn't run while the user decides.
      const answer = await this.opts.sites.request(host, { reason: why, waitMs: this.opts.approvalWaitMs ?? 45000 });
      if (answer === "denied") throw new ToolError("NOT_ALLOWED_DOMAIN", `The user didn't allow ${host}. Use another site.`);
      if (answer === "pending") throw new ToolError("APPROVAL_PENDING", `The user hasn't answered yet whether you may open ${host}. Try open again in a moment, or use another site.`);
      this.blockedHost = undefined;
      const start = performance.now();
      await this.cursor(why);
      try {
        await this.page.goto(full, { waitUntil: "domcontentloaded", timeout: 20000 });
      } catch (err) {
        const blocked = this.blockedHost; // a redirect to a site that isn't allowed (yet)
        if (blocked && this.opts.sites.check(blocked) === "denied") throw new ToolError("NOT_ALLOWED_DOMAIN", `${full} redirected to ${blocked}, which the user didn't allow.`);
        if (blocked) throw new ToolError("APPROVAL_PENDING", `${full} redirected to ${blocked}, which needs the user's OK. They've been asked; try open again in a moment.`);
        throw new ToolError("NAVIGATION_FAILED", err instanceof Error ? err.message.split("\n")[0] : String(err));
      }
      return this.after(`✓ Opened ${full}`, start);
    });
  }

  click(ref: number, why: string) {
    return this.run(async () => {
      const { el, pt, box } = await this.target(ref);
      if (FORBIDDEN.test(el.name)) {
        throw new ToolError("BLOCKED_FORBIDDEN", `"${el.name}" is for the user to do. Mention it in your finish summary instead.`);
      }
      const hit = await this.moveTo(pt, box, why, () =>
        this.page.evaluate(
          ([sel, x, y]) => {
            const t = document.querySelector(sel as string);
            const h = document.elementFromPoint(x as number, y as number);
            if (!t || !h || t === h || t.contains(h) || h.contains(t)) return null;
            return `${h.tagName.toLowerCase()} "${(h.textContent ?? "").trim().slice(0, 40)}"`;
          },
          [`[data-squadlings-ref="s${this.snapId}-${ref}"]`, pt.x, pt.y] as const,
        ).catch(() => null),
      );
      await sleep(70); // a brief pause on the target before clicking
      const start = performance.now();
      await this.page.mouse.click(pt.x, pt.y);
      await this.clickEffect(pt, box, why);
      return this.after(`✓ Clicked [${ref}] ${el.role} "${el.name}"${hit ? ` — but the click landed on ${hit}, which covers it` : ""}`, start);
    });
  }

  type(ref: number, text: string, why: string, submit = false, clear = true) {
    return this.run(async () => {
      const { el, locator, pt, box } = await this.target(ref);
      if (el.sensitive) throw new ToolError("SENSITIVE_FIELD", "Password and payment fields are for the user. Skip this, or finish and say a sign-in is needed.");
      await this.moveTo(pt, box, why);
      const start = performance.now();
      await this.page.mouse.click(pt.x, pt.y);
      await this.clickEffect(pt, box, why);
      if (clear) await locator.fill("").catch(() => {});
      if (text.length <= 60) await this.page.keyboard.type(text, { delay: 18 });
      else await locator.fill(text);
      if (submit) await this.page.keyboard.press("Enter");
      return this.after(`✓ Typed "${text.slice(0, 60)}" into [${ref}] ${el.role} "${el.name}"${submit ? " and pressed Enter" : ""}`, start);
    });
  }

  select(ref: number, option: string, why: string) {
    return this.run(async () => {
      const { el, locator, pt, box } = await this.target(ref);
      await this.moveTo(pt, box, why);
      const start = performance.now();
      try {
        await locator.selectOption({ label: option }, { timeout: 3000 });
      } catch {
        await locator.selectOption(option, { timeout: 3000 }).catch(() => {
          throw new ToolError("INVALID_INPUT", `[${ref}] has no option "${option}", or isn't a select.`);
        });
      }
      return this.after(`✓ Selected "${option}" in [${ref}] ${el.role} "${el.name}"`, start);
    });
  }

  press(key: string, why: string) {
    return this.run(async () => {
      const start = performance.now();
      await this.page.keyboard.press(key === "Space" ? " " : key);
      const focus = await this.page.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return null;
        const r = a.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }).catch(() => null);
      if (focus) await this.moveTo({ x: focus.x + focus.width / 2, y: focus.y + focus.height / 2 }, focus, why);
      return this.after(`✓ Pressed ${key}`, start);
    });
  }

  scroll(direction: "up" | "down", amount: "small" | "page", why: string) {
    return this.run(async () => {
      const { width, height } = this.viewport;
      const dy = (amount === "page" ? Math.round(height * 0.85) : 300) * (direction === "down" ? 1 : -1);
      await this.moveTo({ x: width / 2, y: height / 2 }, null, why);
      const start = performance.now();
      // A few small wheel steps with an ease-out, so the page glides instead of jumping.
      const parts = [0.35, 0.25, 0.18, 0.12, 0.1];
      for (const p of parts) {
        await this.page.mouse.wheel(0, Math.round(dy * p));
        await sleep(16);
      }
      return this.after(`✓ Scrolled ${direction} (${amount})`, start);
    });
  }

  back(why: string) {
    return this.run(async () => {
      await this.cursor(why);
      const start = performance.now();
      const res = await this.page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => null);
      return this.after(res ? "✓ Went back" : "✓ No previous page to go back to", start);
    });
  }

  wait(seconds: number) {
    return this.run(async () => {
      const start = performance.now();
      await sleep(Math.min(Math.max(seconds, 0), 5) * 1000);
      return this.after(`✓ Waited ${seconds} s`, start);
    });
  }

  /** A JPEG of the current view, without the spike cursor. */
  screenshot() {
    return this.run(async () => {
      if (this.opts.showCursor && this.opts.cursorInPage !== false) await this.page.evaluate(drawCursor, this.drawArgs({ hidden: true })).catch(() => {});
      const jpeg = await this.page.screenshot({ type: "jpeg", quality: 70, scale: "css" });
      await this.thinking();
      return jpeg;
    });
  }
}

/**
 * Sets a Chromium profile's default page zoom (Chrome stores it as a level: zoom = 1.2^level).
 * The squad uses it to fit full-width pages into small tiled windows; 1 resets it.
 */
export function setProfileZoom(profileDir: string, zoom: number) {
  const dir = join(profileDir, "Default");
  const file = join(dir, "Preferences");
  mkdirSync(dir, { recursive: true });
  let prefs: any = {};
  try {
    prefs = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    // a new profile
  }
  const level = Math.log(zoom) / Math.log(1.2);
  prefs.partition ??= {};
  prefs.partition.default_zoom_level = { x: Math.abs(level) < 1e-9 ? 0 : level };
  writeFileSync(file, JSON.stringify(prefs));
}
