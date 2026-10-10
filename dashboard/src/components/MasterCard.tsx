import { CAST } from "@swarm/shared/cast";
import { useDashboard } from "../store";
import { MasterLogo } from "../characters/MasterLogo";
import { BotCharacter } from "../characters/BotCharacter";
import { Icon, STATUS_META } from "../characters/icons";
import { currentMood } from "../mood/engine";
import { useMasterTick } from "../director/director";
import { motion } from "motion/react";
export function MasterCard({
  reduced,
  count,
}: {
  reduced: boolean;
  count: number;
}) {
  const bots = useDashboard((s) => s.state.bots),
    master = useDashboard((s) => s.state.master),
    pending = useDashboard((s) =>
      s.state.approvals.some((a) => a.status === "pending"),
    ),
    tick = useMasterTick((s) => s.tick),
    lastBot = useMasterTick((s) => s.lastBot),
    plan = useDashboard((s) => s.state.run.plan);
  const assigned = plan?.assignments.length ?? count;
  const total = Object.values(bots).length,
    done = Object.values(bots).filter((b) => b?.status === "finished").length;
  return (
    <section className="master-card">
      <div className="master-card-top">
        <MasterLogo
          state={pending ? "needs you" : master}
          reduced={reduced}
          size={44}
          tick={tick}
          shared
          ringColor={
            lastBot ? CAST.find((bot) => bot.id === lastBot)!.color : "var(--ink)"
          }
        />
        <div>
          <strong>Master</strong>
          <span>
            {pending
              ? "Needs your input"
              : master === "idle"
                ? "The big-picture thinker"
                : master.charAt(0).toUpperCase() + master.slice(1)}
          </span>
        </div>
        <span className="micro-tag">COORDINATOR</span>
      </div>
      <p className="master-description">
        A place for every finding.
        <br />A plan that brings it all together.
      </p>
      <div className="master-roster">
        {CAST.slice(0, assigned).map((c) => {
          const b = bots[c.id],
            m = b
              ? currentMood(b.conditions, useDashboard.getState().state.now)
              : c.signature;
          return (
            <div key={c.id} data-master-row={c.id} className="roster-row">
              {lastBot === c.id && (
                <motion.i
                  key={tick}
                  className="roster-flash"
                  style={{ background: c.color }}
                  initial={{ opacity: 0.15 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                />
              )}
              <BotCharacter id={c.id} mood={m} size={22} reduced />
              <div>
                <strong>
                  {c.name}
                  <span>{b ? ` / ${b.roleName}` : ""}</span>
                </strong>
                <small>
                  {b?.report?.slice(0, 40) ??
                    (b ? STATUS_META[b.status][1] : "Waiting for assignment")}
                </small>
                <div className="roster-progress">
                  <i
                    style={{
                      background: c.color,
                      transform: `scaleX(${b ? b.steps / b.maxSteps : 0})`,
                    }}
                  />
                </div>
              </div>
              {b?.status === "finished" ? (
                <Icon name="check" size={14} />
              ) : (
                <span className="roster-dot" style={{ background: c.color }} />
              )}
            </div>
          );
        })}
      </div>
      {assigned < count && (
        <div className="bench-row">
          <span>Not needed for this plan</span>
          <div>
            {CAST.slice(assigned, count).map((bot) => (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, rotate: reduced ? 0 : -6 }}
                animate={{ opacity: 1, rotate: reduced ? 0 : [-6, 6, 0] }}
                transition={{ duration: 0.6 }}
              >
                <BotCharacter
                  id={bot.id}
                  mood="content"
                  size={28}
                  reduced={reduced}
                />
                <small>{bot.name}</small>
              </motion.div>
            ))}
          </div>
        </div>
      )}
      <div className="master-bottom">
        <span>
          <Icon name="note" size={14} /> Reports received
        </span>
        <strong>
          {done} / {total || count}
        </strong>
      </div>
    </section>
  );
}
