import type { BotId } from "@swarm/shared/types";
import { CAST } from "@swarm/shared/cast";
import { Icon } from "../characters/icons";
import { useDashboard } from "../store";
import type { useLab } from "./useLab";
import type { TemplateId } from "./fakeRun";
import { ExtendedEvents } from "./ExtendedEvents";
export type LabController = ReturnType<typeof useLab>;
export function EventControls({
  id,
  onSelect,
  lab,
  template,
  mobile,
}: {
  id: BotId;
  onSelect: (id: BotId) => void;
  lab: LabController;
  template: TemplateId;
  mobile: boolean;
}) {
  const fire = lab.fire;
  const ensure = () => lab.spawn(id, template, mobile);
  const call = (tool: "click" | "type" | "scroll" | "read_text" | "wait") => {
    ensure();
    const key = `manual-${Date.now()}`,
      viewport = useDashboard.getState().state.bots[id]!.viewport;
    const x = viewport.width * (tool === "read_text" ? 0.25 : 0.45),
      y = viewport.height * (tool === "read_text" ? 0.3 : 0.42);
    fire("tool.called", { botId: id, callId: key, tool, args: {} }, id);
    if (tool === "click" || tool === "read_text") {
      fire(
        "cursor.move",
        {
          botId: id,
          x,
          y,
          box: {
            x: x - 30,
            y: y - 20,
            width: tool === "read_text" ? 160 : 60,
            height: 40,
          },
          durationMs: 350,
        },
        id,
      );
      if (tool === "click")
        lab.schedule(350, "cursor.click", { botId: id, x, y }, id);
    }
    if (tool === "type")
      fire("cursor.type", { botId: id, x, y, length: 12, masked: true }, id);
    if (tool === "scroll") fire("cursor.scroll", { botId: id, dy: 200 }, id);
    lab.schedule(
      tool === "click" || tool === "wait" ? 800 : 1800,
      "tool.result",
      {
        callId: key,
        ok: true,
        summary: `Simulated ${tool} completed.`,
        ms: tool === "click" || tool === "wait" ? 800 : 1800,
      },
      id,
    );
  };
  const report = () => {
    ensure();
    const ts = useDashboard.getState().state.now;
    fire(
      "board.posted",
      {
        note: {
          id: `manual-note-${ts}`,
          seq: 1,
          runId: "lab-manual",
          from: id,
          to: "all",
          type: "tip",
          title: "A little finding from the Lab.",
          data: { simulated: true },
          createdAt: ts,
        },
      },
      id,
    );
  };
  const ask = () => {
    ensure();
    const ts = useDashboard.getState().state.now;
    fire(
      "approval.requested",
      {
        approval: {
          id: `manual-approval-${ts}`,
          runId: "lab-manual",
          botId: id,
          kind: "confirm",
          title: "Give this idea a try?",
          detail:
            "A simulated request. No website or external action is connected.",
          status: "pending",
          createdAt: ts,
          expiresAt: ts + 300000,
        },
      },
      id,
    );
  };
  return (
    <section className="event-controls">
      <div className="section-label">
        <span>EVENT PLAYGROUND</span>
        <Icon name="sliders" size={15} />
      </div>
      <label className="field-label" htmlFor="event-bot">
        Send an event to
      </label>
      <select
        id="event-bot"
        value={id}
        onChange={(e) => onSelect(e.target.value as BotId)}
      >
        {CAST.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {c.personality}
          </option>
        ))}
      </select>
      <div className="event-button-grid" data-audio="off">
        {(
          [
            ["pointer", "Click", () => call("click")],
            ["keyboard", "Type", () => call("type")],
            [
              "note",
              "Output",
              () => {
                ensure();
                fire(
                  "bot.caption",
                  {
                    botId: id,
                    text: "Composing an example update for the squad.",
                  },
                  id,
                );
              },
            ],
            ["scroll", "Scroll", () => call("scroll")],
            ["eye", "Read", () => call("read_text")],
            ["clock", "Wait", () => call("wait")],
            ["spark", "Found", report],
            ["ask", "Ask", ask],
            [
              "retry",
              "Error",
              () => {
                ensure();
                fire(
                  "bot.error",
                  {
                    botId: id,
                    message: "Simulated timeout. Ready to retry.",
                    retryable: true,
                  },
                  id,
                );
              },
            ],
            [
              "flag",
              "Finish",
              () => {
                ensure();
                fire(
                  "bot.result",
                  {
                    botId: id,
                    result: { simulated: true },
                    summary: "Example report ready.",
                  },
                  id,
                );
              },
            ],
          ] as const
        ).map(([icon, label, fn]) => (
          <button key={label} className="event-button" onClick={fn}>
            <Icon name={icon} size={16} />
            {label}
          </button>
        ))}
      </div>
      <p className="control-note">
        Real event shapes. Simulated actions.
        <br />
        Try Found, Ask, or Finish to see a report fly.
      </p>
      <ExtendedEvents id={id} lab={lab} ensure={ensure} />
    </section>
  );
}
export function BoardPanel({ lab }: { lab: LabController }) {
  const notes = useDashboard((s) => s.state.board),
    allApprovals = useDashboard((s) => s.state.approvals);
  const approvals = allApprovals.filter((a) => a.status === "pending");
  return (
    <>
      <section className="board-panel" data-board>
        <div className="section-label">
          <span>SHARED BOARD</span>
          <span>{notes.length.toString().padStart(2, "0")}</span>
        </div>
        {notes.length ? (
          notes.slice(0, 4).map((n) => (
            <div className="board-note" key={n.id}>
              <span
                className="note-dot"
                style={{
                  background:
                    CAST.find((c) => c.id === n.from)?.color ?? "#111",
                }}
              />
              <div>
                <strong>{n.title}</strong>
                <span>
                  {CAST.find((c) => c.id === n.from)?.name ?? "Master"} →
                  Everyone
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-board">
            <Icon name="note" size={26} />
            <p>
              Good ideas travel.
              <br />
              Findings will land here.
            </p>
          </div>
        )}
      </section>
      {approvals.map((a) => (
        <section key={a.id} className="approval-card">
          <div>
            <Icon name="ask" size={18} />
            <strong>
              {CAST.find((c) => c.id === a.botId)?.name} needs you
            </strong>
          </div>
          <h4>{a.title}</h4>
          <p>{a.detail}</p>
          <div className="approval-buttons" data-audio="off">
            <button
              className="primary-button"
              onClick={() => lab.resolve(a, "approved")}
            >
              Approve example
            </button>
            <button
              className="quiet-button"
              onClick={() => lab.resolve(a, "skipped")}
            >
              Skip
            </button>
          </div>
        </section>
      ))}
    </>
  );
}
