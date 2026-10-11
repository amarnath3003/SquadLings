import { useState } from "react";
import { CAST, ORCHESTRATOR } from "@swarm/shared/cast";
import { useDashboard } from "../store";
import { MasterCharacter, MASTER_LINES } from "../../characters/MasterCharacter";
import { BotCharacter } from "../../characters/BotCharacter";
import { STATUS_META } from "../../characters/icons";
import { currentMood } from "../mood/engine";
import { useMasterTick } from "../director/director";
import { motion } from "motion/react";
import { focusBot } from "../../live/actions";
import { S } from "../../live/store";
import "../../styles/onyx-card.css";

// Onyx's coordinator card (the studio's MasterCard), pinned at the top of the chat: Onyx and its state,
// a row per agent with its latest report and progress, and the reports received. Its classes are the
// studio's (.master-card .master-character, [data-master-row]): the flights start and land here.
const STATE_LABEL: Record<string, string> = {
  idle: "Ready",
  classifying: "Reading the task",
  planning: "Planning",
  monitoring: "Watching the team",
  receiving: "Got a report",
  merging: "Writing the answer",
  done: "Done",
  failed: "Stopped",
};

/** The row's status chip: the few states that matter to you. */
function rowState(b: { status: string; steps: number; maxSteps: number } | undefined) {
  if (!b) return "Waiting";
  switch (b.status) {
    case "finished":
      return "Done";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    case "waiting_user":
      return "Needs you";
    case "paused":
      return "You're in control";
    case "pending":
    case "starting":
      return "Starting";
    default:
      return `${b.steps}/${b.maxSteps}`;
  }
}

export function MasterCard({ reduced, count }: { reduced: boolean; count: number }) {
  const [open, setOpen] = useState(true);
  const bots = useDashboard((s) => s.state.bots),
    master = useDashboard((s) => s.state.master),
    pending = useDashboard((s) => s.state.approvals.some((a) => a.status === "pending")),
    tick = useMasterTick((s) => s.tick),
    lastBot = useMasterTick((s) => s.lastBot),
    plan = useDashboard((s) => s.state.run.plan);
  const assigned = plan?.assignments.length ?? count;
  const list = Object.values(bots);
  const total = list.length,
    done = list.filter((b) => b?.status === "finished").length;
  const face = pending ? "needs you" : master;
  return (
    <section className={`master-card onyx-card${open ? "" : " collapsed"}`} aria-label="Onyx and the team">
      <button type="button" className="onyx-card-top" aria-expanded={open} onClick={() => setOpen(!open)} title={open ? "Fold the team" : "Show the team"}>
        <MasterCharacter state={face} reduced={reduced} size={34} tick={tick} />
        <span className="onyx-card-id">
          <strong>
            {ORCHESTRATOR.name}
            <em className={pending ? "warn" : ""}>{pending ? "Needs you" : (STATE_LABEL[master] ?? master)}</em>
          </strong>
          <small>{MASTER_LINES[face] ?? ORCHESTRATOR.line}</small>
        </span>
        <span className="onyx-card-count" title="Reports received">
          <b>
            {done}/{total || count}
          </b>
          reports
        </span>
        <svg className="onyx-card-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="master-roster">
        {CAST.slice(0, assigned).map((c) => {
          const ours = S.botById.get(c.id);
          const b = bots[c.id],
            m = b ? currentMood(b.conditions, useDashboard.getState().state.now) : c.signature;
          return (
            <div key={c.id} data-master-row={c.id} className="roster-row" style={{ "--bot-color": c.color } as React.CSSProperties} title={`Show ${c.name}'s browser`} onClick={() => b && focusBot(c.id)}>
              {lastBot === c.id && (
                <motion.i
                  key={tick}
                  className="roster-flash"
                  style={{ background: c.color }}
                  initial={{ opacity: 0.18 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                />
              )}
              <span className="roster-avatar">
                <BotCharacter id={c.id} mood={m} size={24} reduced />
              </span>
              <div className="roster-text">
                <div className="roster-line">
                  <strong>{c.name}</strong>
                  {b ? <span className="roster-role">{b.roleName}</span> : null}
                  <span className={`roster-state state-${ours?.control ? "paused" : ours?.human ? "waiting_user" : (b?.status ?? "pending")}`}>{ours?.control ? "You're in control" : ours?.human ? "Needs you" : rowState(b)}</span>
                </div>
                <small title={b?.report ?? undefined}>{b?.report ?? (b ? STATUS_META[b.status][1] : "Waiting for an assignment")}</small>
                <div className="roster-progress">
                  <i style={{ transform: `scaleX(${b ? (b.status === "finished" ? 1 : Math.min(1, b.steps / b.maxSteps)) : 0})` }} />
                </div>
              </div>
            </div>
          );
        })}
        {assigned < count && (
          <div className="bench-row">
            <span>Not needed</span>
            <div>
              {CAST.slice(assigned, count).map((bot) => (
                <span key={bot.id} title={`${bot.name} isn't needed for this plan`}>
                  <BotCharacter id={bot.id} mood="content" size={18} reduced />
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
