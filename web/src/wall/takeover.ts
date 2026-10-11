// Takeover, ported from ui/app.js: while you have an agent's browser, your mouse, wheel, keys and pastes
// go to it as { type: "input", botId, event } on the socket, with the classic event shapes (x and y are
// fractions of the frame). Never logged, never shown to a model.

import { useEffect } from "react";
import { S } from "../live/store";
import { send } from "../live/connection";

const input = (botId: string, event: Record<string, unknown>) => send({ type: "input", botId, event });

/** Mouse and wheel on `layer` (over the agent's frame `canvas`) go to that agent's browser while you have it. */
export function attachInput(botId: string, layer: HTMLElement, canvas: HTMLElement, focusTarget?: HTMLElement | null) {
  const at = (ev: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
  };
  const live = () => S.ui.control === botId && S.ui.focus === botId;
  let lastMove = 0;
  const button = (n: number) => (n === 1 ? "middle" : n === 2 ? "right" : "left");
  const down = (ev: MouseEvent) => {
    if (!live()) return;
    ev.preventDefault();
    focusTarget?.focus({ preventScroll: true });
    input(botId, { kind: "down", ...at(ev), button: button(ev.button), clickCount: ev.detail || 1 });
  };
  const up = (ev: MouseEvent) => {
    if (!live()) return;
    ev.preventDefault();
    input(botId, { kind: "up", ...at(ev), button: button(ev.button), clickCount: ev.detail || 1 });
  };
  const move = (ev: MouseEvent) => {
    if (!live() || performance.now() - lastMove < 33) return; // ≤ 30 moves a second (§14.7)
    lastMove = performance.now();
    input(botId, { kind: "move", ...at(ev) });
  };
  const wheel = (ev: WheelEvent) => {
    if (!live()) return;
    ev.preventDefault();
    input(botId, { kind: "wheel", ...at(ev), dx: ev.deltaX, dy: ev.deltaY });
  };
  const menu = (ev: MouseEvent) => void (live() && ev.preventDefault());
  layer.addEventListener("mousedown", down);
  layer.addEventListener("mouseup", up);
  layer.addEventListener("mousemove", move);
  layer.addEventListener("wheel", wheel, { passive: false });
  layer.addEventListener("contextmenu", menu);
  return () => {
    layer.removeEventListener("mousedown", down);
    layer.removeEventListener("mouseup", up);
    layer.removeEventListener("mousemove", move);
    layer.removeEventListener("wheel", wheel);
    layer.removeEventListener("contextmenu", menu);
  };
}

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn"]);

/** While you have a browser, keys and pastes outside the page's own fields go to it (the App's shortcuts skip then). */
export function useTakeoverKeys() {
  useEffect(() => {
    const keydown = (ev: KeyboardEvent) => {
      const id = S.ui.control;
      if (!id || !S.botById.has(id) || (ev.target as Element | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (MODIFIERS.has(ev.key) || ev.isComposing) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "v") return; // the paste event sends the text
      ev.preventDefault();
      input(id, { kind: "key", key: ev.key, ctrl: ev.ctrlKey, meta: ev.metaKey, alt: ev.altKey, shift: ev.shiftKey });
    };
    const paste = (ev: ClipboardEvent) => {
      const id = S.ui.control;
      if (!id || !S.botById.has(id) || (ev.target as Element | null)?.closest?.("input, textarea")) return;
      const text = ev.clipboardData?.getData("text") ?? "";
      if (text) ev.preventDefault(), input(id, { kind: "text", text });
    };
    document.addEventListener("keydown", keydown);
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("paste", paste);
    };
  }, []);
}
