import { CAST, ORCHESTRATOR } from "@swarm/shared/cast";
import { Icon } from "../../characters/icons";
import { useDashboard } from "../store";
import { S, runActive, useLive } from "../../live/store";
import { takeover } from "../../live/actions";

// The studio's shared board (lab/CharacterLab BoardPanel) and its "X needs you" card, on real data: the
// board's notes come from the team's messages (board.posted in the studio store); the card is a human
// check, and its one action is taking over that agent's browser.
export function BoardPanel() {
  const notes = useDashboard((s) => s.state.board);
  return (
    <section className="board-panel" data-board>
      <div className="section-label">
        <span>SHARED BOARD</span>
        <span>{notes.length.toString().padStart(2, "0")}</span>
      </div>
      {notes.length ? (
        notes.slice(0, 4).map((n) => (
          <div className="board-note" key={n.id}>
            <span className="note-dot" style={{ background: CAST.find((c) => c.id === n.from)?.color ?? "#111" }} />
            <div>
              <strong>{n.title}</strong>
              <span>
                {CAST.find((c) => c.id === n.from)?.name ?? ORCHESTRATOR.name} → Everyone
              </span>
            </div>
          </div>
        ))
      ) : (
        <div className="empty-board">
          <Icon name="note" size={26} />
          <p>Findings land here.</p>
        </div>
      )}
    </section>
  );
}

/** One card per agent waiting at a human check (not while you already have its browser). */
export function NeedsYou() {
  useLive();
  if (!runActive()) return null;
  return (
    <>
      {S.bots
        .filter((b) => b.human && !b.control)
        .map((b) => (
          <section key={b.id} className="approval-card" style={{ "--bot-color": b.color } as React.CSSProperties}>
            <div>
              <Icon name="ask" size={18} />
              <strong>{b.name} needs you</strong>
            </div>
            <h4>Human check on {b.human!.host}</h4>
            <p>Agents never solve these. Take over its browser to get past it.</p>
            <div className="approval-buttons" data-audio="off">
              <button className="primary-button" type="button" onClick={() => void takeover(b.id, true)}>
                Take over
              </button>
            </div>
          </section>
        ))}
    </>
  );
}
