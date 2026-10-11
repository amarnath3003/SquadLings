import { useEffect } from "react";
import { EFFECTS, type UiCue } from "./audio/catalogue";
import { attachAudioLifecycle, playUi } from "./sound";

export function useUiSounds() {
  useEffect(() => {
    const detach = attachAudioLifecycle(),
      values = new WeakMap<Element, string>();
    const marked = (element: Element) =>
      element.closest<HTMLElement>("[data-audio]")?.dataset.audio;
    const remember = (event: Event) => {
      if (event.target instanceof HTMLInputElement)
        values.set(event.target, event.target.value);
    };
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest<HTMLElement>(
        "button,a[href],summary",
      );
      if (
        !control ||
        control.matches(":disabled,[aria-disabled=true]") ||
        marked(control) === "off" ||
        control.tagName === "SUMMARY"
      )
        return;
      const explicit = marked(control);
      if (
        control.getAttribute("aria-current") === "page" ||
        control.getAttribute("aria-selected") === "true" ||
        control.matches(".template-options .selected")
      )
        return;
      const cue =
        explicit && explicit in EFFECTS
          ? (explicit as UiCue)
          : control.matches(".nav-item")
            ? "tab"
            : "click";
      // Read selection before React updates it, but respect a cancelled activation.
      queueMicrotask(() => {
        if (!event.defaultPrevented) playUi(cue);
      });
    };
    const change = (event: Event) => {
      const input = event.target;
      if (
        !(
          input instanceof HTMLInputElement ||
          input instanceof HTMLSelectElement
        ) ||
        input.disabled ||
        marked(input) === "off"
      )
        return;
      if (
        event.type === "input" &&
        (!(input instanceof HTMLInputElement) || input.type !== "range")
      )
        return;
      if (input instanceof HTMLSelectElement) {
        if (values.get(input) !== input.value) playUi("select");
      } else if (input.type === "checkbox" || input.type === "radio")
        playUi(input.checked ? "on" : "off");
      else if (input.type === "range" && values.get(input) !== input.value)
        playUi("tick", {
          priority: 2,
          key: input.id || input.getAttribute("aria-label") || "range",
        });
      values.set(input, input.value);
    };
    const toggle = (event: Event) => {
      if (
        event.target instanceof HTMLDetailsElement &&
        marked(event.target) !== "off"
      )
        playUi(event.target.open ? "open" : "close");
    };
    document.addEventListener("click", click, true);
    document.addEventListener("change", change);
    document.addEventListener("input", change);
    document.addEventListener("focusin", remember);
    document.addEventListener("pointerdown", remember);
    document.addEventListener("toggle", toggle, true);
    return () => {
      detach();
      document.removeEventListener("click", click, true);
      document.removeEventListener("change", change);
      document.removeEventListener("input", change);
      document.removeEventListener("focusin", remember);
      document.removeEventListener("pointerdown", remember);
      document.removeEventListener("toggle", toggle, true);
    };
  }, []);
}
