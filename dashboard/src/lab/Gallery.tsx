import { playUi, playVoice, stopAudio } from "../effects/sound";
import {
  MOOD_VOICE,
  REACTIONS,
  type Reaction,
} from "../effects/audio/catalogue";
import { useState } from "react";
import { CAST, ORCHESTRATOR } from "@swarm/shared/cast";
import { BotCharacter } from "../characters/BotCharacter";
import { MasterCharacter, MASTER_LINES } from "../characters/MasterCharacter";
import { MOODS } from "../characters/faces";
import { Icon, TOOL_META, STATUS_META } from "../characters/icons";
import { EMOTES } from "../mood/emotes";
export function Gallery({ reduced }: { reduced: boolean }) {
  const [busy, setBusy] = useState(false);
  const [reaction, setReaction] = useState<Reaction>("greeting");
  return (
    <div className="gallery">
      <div className="gallery-heading">
        <div>
          <span className="eyebrow">A FACE FOR EVERY MOMENT</span>
          <h1>
            Same little circle.
            <br />
            So much personality.
          </h1>
          <p>Five characters, ten expressions. Every face has a reason.</p>
        </div>
        <button
          className={`outline-button ${busy ? "active" : ""}`}
          onClick={() => setBusy(!busy)}
        >
          <Icon name="grid" size={16} />
          {busy ? "Plain background" : "Busy background"}
        </button>
      </div>
      <section className="voice-bank gallery-panel" aria-label="Voice audition">
        <div>
          <div className="section-label">FIVE LITTLE VOICES</div>
          <p>
            Choose a feeling, then listen. Enable sound in the toolbar first.
          </p>
        </div>
        <label>
          Voice reaction{" "}
          <select
            aria-label="Voice reaction"
            value={reaction}
            onChange={(e) => setReaction(e.target.value as Reaction)}
          >
            {REACTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <div className="voice-buttons">
          {CAST.map((c) => (
            <button
              key={c.id}
              className="outline-button"
              data-audio="off"
              onClick={() => {
                stopAudio("preview");
                playVoice(c.id, reaction, { scope: "preview" });
              }}
            >
              Listen to {c.name}
            </button>
          ))}
        </div>
      </section>
      <section className={`face-matrix ${busy ? "busy-background" : ""}`}>
        <div className="matrix-label" />
        {MOODS.map((m) => (
          <div className="matrix-label" key={m}>
            {m}
          </div>
        ))}
        {CAST.map((c) => (
          <div className="matrix-row" key={c.id}>
            <div className="matrix-name">
              <strong>{c.name}</strong>
              <span>{c.personality}</span>
            </div>
            {MOODS.map((m) => (
              <button
                key={m}
                className="matrix-face"
                data-audio="off"
                aria-label={`Hear ${c.name}, ${m}`}
                onClick={() => {
                  stopAudio("preview");
                  playUi("select", { scope: "preview", botId: c.id });
                  playVoice(c.id, MOOD_VOICE[m], { scope: "preview" });
                }}
              >
                <BotCharacter id={c.id} mood={m} size={48} reduced />
              </button>
            ))}
          </div>
        ))}
      </section>
      <div className="gallery-lower">
        <section className="gallery-panel">
          <div className="section-label">ONYX · THE CALM CONDUCTOR</div>
          <p className="onyx-intro">{ORCHESTRATOR.line}</p>
          <div className="master-gallery">
            {Object.keys(MASTER_LINES).map((s) => (
              <div key={s}>
                <MasterCharacter state={s} reduced={reduced} size={38} />
                <span>{s}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="gallery-panel">
          <div className="section-label">LITTLE REACTIONS</div>
          <div className="icon-gallery">
            {Object.entries(EMOTES).map(([name, m]) => (
              <div key={name}>
                <Icon name={m.icon} />
                <span>{name}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="gallery-panel">
        <div className="section-label">ACTIVITY & STATUS ICONS</div>
        <div className="icon-gallery tool-gallery">
          {Object.entries(TOOL_META).map(([name, [icon, verb]]) => (
            <div key={name} title={name}>
              <Icon name={icon} />
              <span>{verb}</span>
            </div>
          ))}
          {Object.entries(STATUS_META).map(([name, [icon, verb]]) => (
            <div key={name}>
              <Icon name={icon} />
              <span>{verb}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
