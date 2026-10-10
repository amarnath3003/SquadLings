import { useEffect, useRef, useState } from "react";
import { Icon } from "../characters/icons";
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
        <Icon name={enabled ? "volume" : "mute"} size={18} />
      </button>
      <button
        ref={trigger}
        className={`icon-button ${open ? "is-on" : ""}`}
        aria-label="Sound settings"
        aria-expanded={open}
        aria-controls="sound-settings"
        onClick={() => setOpen(!open)}
      >
        <Icon name="sliders" size={16} />
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
            Master volume{" "}
            <output>{Math.round(preferences.volume * 100)}%</output>
          </label>
          <input
            id="master-volume"
            aria-label="Master volume"
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
          <p>
            Five original cartoon voices, made locally. Enable sound to listen.
            Your mix is saved; new visits start muted.
          </p>
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
