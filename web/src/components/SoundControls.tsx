import { useEffect, useRef, useState } from "react";
import {
  playUi,
  setAudioPreferences,
  setSound,
  useAudio,
} from "../effects/sound";

export function SoundControls() {
  const enabled = useAudio((s) => s.enabled),
    pending = useAudio((s) => s.pending),
    error = useAudio((s) => s.error),
    preferences = useAudio((s) => s.preferences);
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLInputElement>("input")?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div ref={root} className="sound-controls">
      <button
        className={`icon-button ${enabled ? "is-on" : ""}`}
        data-audio="off"
        aria-label={enabled ? "Turn sound off" : "Turn sound on"}
        aria-pressed={enabled}
        disabled={pending}
        title={enabled ? "Turn sound off" : "Turn sound on"}
        onClick={() => void setSound(!enabled)}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" fillOpacity="0.18" />
          {enabled ? (
            <>
              <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
              <path d="M18.2 6.6a7.6 7.6 0 0 1 0 10.8" />
            </>
          ) : (
            <path d="M16 9.5l5 5M21 9.5l-5 5" />
          )}
        </svg>
      </button>
      <button
        ref={trigger}
        className={`icon-button ${open ? "is-on" : ""}`}
        aria-label="Sound settings"
        aria-expanded={open}
        aria-controls="sound-settings"
        onClick={() => setOpen(!open)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.3 3.6h3.4l.5 2.4 1.6.9 2.3-.8 1.7 2.9-1.8 1.6v1.8l1.8 1.6-1.7 2.9-2.3-.8-1.6.9-.5 2.4h-3.4l-.5-2.4-1.6-.9-2.3.8-1.7-2.9 1.8-1.6v-1.8L4.2 9l1.7-2.9 2.3.8 1.6-.9z" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      </button>
      {open && (
        <section
          id="sound-settings"
          className="sound-settings"
          role="dialog"
          aria-label="Sound settings"
        >
          <div className="sound-settings-title">
            <strong>A little sound</strong>
            <span>{enabled ? "Sound on" : "Muted"}</span>
          </div>
          <label htmlFor="master-volume">
            Volume{" "}
            <output>{Math.round(preferences.volume * 100)}%</output>
          </label>
          <input
            id="master-volume"
            aria-label="Volume"
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(preferences.volume * 100)}
            data-audio="off"
            onChange={(e) =>
              setAudioPreferences({ volume: Number(e.target.value) / 100 })
            }
            onPointerUp={() => playUi("tick")}
            onKeyUp={(e) => {
              if (e.key.startsWith("Arrow")) playUi("tick");
            }}
          />
          {(
            [
              ["effects", "UI and workflow effects"],
              ["voices", "Bot voices"],
              ["idle", "Idle chatter"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="sound-switch">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={preferences[key]}
                disabled={key === "idle" && !preferences.voices}
                onChange={(e) =>
                  setAudioPreferences({ [key]: e.target.checked })
                }
              />
            </label>
          ))}
          <p>Five cartoon voices, made in your browser. Your mix is saved; new visits start muted.</p>
          <button
            className="quiet-button"
            onClick={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            Close sound settings
          </button>
        </section>
      )}
      {error && (
        <p className="sound-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
