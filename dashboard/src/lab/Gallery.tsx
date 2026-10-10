import { useState } from "react";
import { CAST } from "@swarm/shared/cast";
import { BotCharacter } from "../characters/BotCharacter";
import { MasterLogo } from "../characters/MasterLogo";
import { MOODS } from "../characters/faces";
import { Icon, TOOL_META, STATUS_META } from "../characters/icons";
import { EMOTES } from "../mood/emotes";
export function Gallery({ reduced }: { reduced: boolean }) {
  const [busy, setBusy] = useState(false);
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
              <div key={m} className="matrix-face">
                <BotCharacter id={c.id} mood={m} size={48} reduced />
              </div>
            ))}
          </div>
        ))}
      </section>
      <div className="gallery-lower">
        <section className="gallery-panel">
          <div className="section-label">THE MASTER’S MANY HATS</div>
          <div className="master-gallery">
            {[
              "idle",
              "classifying",
              "planning",
              "monitoring",
              "receiving",
              "needs you",
              "merging",
              "done",
              "failed",
            ].map((s) => (
              <div key={s}>
                <MasterLogo state={s} reduced={reduced} size={38} />
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
