import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { CAST } from "@swarm/shared/cast";
import { SquadSlider } from "../launch/SquadSlider";
import { EFFORTS, EffortStepper } from "../launch/EffortStepper";
import { startRun, type Config, type Settings } from "../api";
import { S, phase, runActive, useLive, working } from "../live/store";
import { post, showHint } from "../live/actions";

// The bar (ported from ui/app.js, same markup so classic.css applies): one pill with the task, how many
// agents, how hard they think, and "+" for the rest. The agents and effort chips open the studio's
// character pickers in our popovers.

const KEY = "squadlings.settings";
function loadSettings(defaults: Settings): Settings {
  try {
    return { ...defaults, bots: 5, botEffort: "medium", ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...defaults, bots: 5, botEffort: "medium" };
  }
}
function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // private window or storage off: settings just aren't remembered
  }
}

type Pop = "agents" | "effort" | "opts" | null;

export function Composer({ config, reduced }: { config: Config; reduced: boolean }) {
  useLive();
  const home = phase() === "home";
  const [settings, setSettings] = useState(() => loadSettings(config.defaults));
  const [text, setText] = useState("");
  const [pop, setPop] = useState<Pop>(null);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  const update = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  const toggle = (name: Pop) => setPop((p) => (p === name ? null : name));
  const effort = Math.max(0, EFFORTS.findIndex((e) => e.value === settings.botEffort));

  useEffect(() => {
    if (!pop) return;
    const outside = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.(".pop, #agents-chip, #effort-chip, #opts-btn")) setPop(null);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setPop(null);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [pop]);

  // The box grows with the text, up to its max-height (classic.css); measured again once the chat
  // panel has finished sliding (mid-animation widths are wrong).
  const grow = () => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    if (el.value && el.clientWidth >= 120) el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(grow, [text]);
  useEffect(() => {
    const chat = document.getElementById("chat");
    const done = (ev: Event) => ev.target === chat && grow();
    chat?.addEventListener("transitionend", done);
    window.addEventListener("resize", grow);
    return () => {
      chat?.removeEventListener("transitionend", done);
      window.removeEventListener("resize", grow);
    };
  }, []);

  const submit = async () => {
    const task = text.trim();
    if (!task || sending) return;
    setSending(true);
    setPop(null);
    showHint("");
    try {
      if (!home && S.run) {
        await post(`/api/runs/${S.run.id}/messages`, { text: task });
        if (S.run.masterBusy) showHint("Onyx is busy; it gets this with its next step.");
        setText("");
      } else {
        S.starting = true; // the snapshot of the new run opens it here
        if (await startRun(task, settings)) setText("");
        else S.starting = false;
      }
    } catch (err) {
      S.starting = false;
      showHint(err instanceof Error ? err.message : String(err), true);
    } finally {
      setSending(false);
    }
  };

  // While Onyx or the agents are at work, an empty box offers Stop (the chat stays open).
  const [stopping, setStopping] = useState(false);
  const busy = !home && runActive() && Boolean(S.run?.masterBusy || working().length);
  useEffect(() => {
    if (!busy) setStopping(false);
  }, [busy]);
  const halt = async () => {
    if (!S.run || stopping) return;
    setStopping(true);
    try {
      const r = await post<{ halted: boolean }>(`/api/runs/${S.run.id}/halt`);
      if (!r.halted) (showHint("Nothing to stop right now."), setStopping(false));
    } catch (err) {
      setStopping(false);
      showHint(err instanceof Error ? err.message : String(err), true);
    }
  };

  // The gauge's needle sweeps the arc from left (fast) to right (careful).
  const theta = Math.PI * (1 - effort / (EFFORTS.length - 1));
  return (
    <form
      id="composer"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="pillbox">
        <button type="button" id="opts-btn" className="pb-icon" title="More options" aria-label="More options" aria-expanded={pop === "opts"} onClick={() => toggle("opts")}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <textarea
          id="input"
          ref={input}
          rows={1}
          value={text}
          placeholder={home ? "Describe a task for the squad" : "Message Onyx"}
          aria-label="Message"
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="pb-chips">
          <button type="button" id="agents-chip" className="chip" aria-expanded={pop === "agents"} title="How many agents Onyx may use" onClick={() => toggle("agents")}>
            <span className="agent-dots" id="agent-dots" aria-hidden="true">
              {CAST.map((c, i) => (
                <i key={c.id} className={i < settings.bots ? "" : "off"} style={{ "--c": c.color } as CSSProperties} />
              ))}
            </span>
            <span id="agents-val">
              {settings.bots} agent{settings.bots === 1 ? "" : "s"}
            </span>
          </button>
          <button type="button" id="effort-chip" className="chip" aria-expanded={pop === "effort"} title="How hard each agent thinks before acting" onClick={() => toggle("effort")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4.5 16a7.5 7.5 0 1 1 15 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d={`M12 16l${(Math.cos(theta) * 5.5).toFixed(2)} ${(-Math.sin(theta) * 5.5).toFixed(2)}`} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span id="effort-val">{EFFORTS[effort].label}</span>
          </button>
        </div>
        {busy && !text.trim() ? (
          <button id="stop" className="send stop" type="button" aria-label="Stop" title="Stop Onyx and the agents. The chat stays open: send a message to carry on." disabled={stopping} onClick={() => void halt()}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button id="send" className="send" type="submit" aria-label="Send" disabled={sending || !text.trim()}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {pop === "agents" && (
        <div id="agents-pop" className="pop">
          <SquadSlider count={settings.bots} min={1} onChange={(bots) => update({ bots })} reduced={reduced} />
        </div>
      )}
      {pop === "effort" && (
        <div id="effort-pop" className="pop">
          <EffortStepper level={effort} count={settings.bots} onChange={(i) => update({ botEffort: EFFORTS[i].value })} reduced={reduced} />
        </div>
      )}
      {pop === "opts" && <Options config={config} settings={settings} update={update} />}
      <div className="hint">
        <span id="hint" className={S.hint?.error ? "err" : ""}>
          {S.hint?.text}
        </span>
      </div>
    </form>
  );
}

function Options({ config, settings, update }: { config: Config; settings: Settings; update: (p: Partial<Settings>) => void }) {
  const pick = (list: string[], value: string) => (list.includes(value) ? value : list[0]);
  return (
    <div id="opts" className="pop opts">
      <div className="pop-head">
        <b>More options</b>
      </div>
      <div className="fields">
        <label className="field">
          Onyx model
          <select id="o-masterModel" value={pick(config.models.master, settings.masterModel)} onChange={(e) => update({ masterModel: e.target.value })}>
            {config.models.master.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Agent model
          <select id="o-botModel" value={pick(config.models.bot, settings.botModel)} onChange={(e) => update({ botModel: e.target.value })}>
            {config.models.bot.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Onyx effort
          <select id="o-masterEffort" value={settings.masterEffort ?? ""} onChange={(e) => update({ masterEffort: e.target.value || undefined })}>
            <option value="">Model default</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="field">
          Actions per agent
          <input id="o-maxActions" type="number" min={5} max={200} step={5} value={settings.maxActions} onChange={(e) => update({ maxActions: Number(e.target.value) })} />
        </label>
        <label className="field">
          Time limit (minutes)
          <input id="o-timeoutMin" type="number" min={1} max={120} value={settings.timeoutMin} onChange={(e) => update({ timeoutMin: Number(e.target.value) })} />
        </label>
        <label className="field wide">
          Sites every agent may open
          <input
            id="o-allow"
            type="text"
            placeholder="e.g. example.com, docs.example.org (optional)"
            value={Array.isArray(settings.allow) ? settings.allow.join(", ") : settings.allow}
            onChange={(e) => update({ allow: e.target.value })}
          />
        </label>
        <label className="check">
          <span>
            Agents can use web search
            <small>Else they search in the browser</small>
          </span>
          <input id="o-webSearch" type="checkbox" checked={settings.webSearch !== false} onChange={(e) => update({ webSearch: e.target.checked })} />
        </label>
        <label className="check">
          <span>
            Onyx may answer simple questions itself
            <small>No agents</small>
          </span>
          <input id="o-allowDirect" type="checkbox" checked={Boolean(settings.allowDirect)} onChange={(e) => update({ allowDirect: e.target.checked })} />
        </label>
        <label className="check">
          <span>
            Clean browser profiles
            <small>Forget cookies and solved checks</small>
          </span>
          <input id="o-fresh" type="checkbox" checked={Boolean(settings.fresh)} onChange={(e) => update({ fresh: e.target.checked })} />
        </label>
      </div>
    </div>
  );
}
