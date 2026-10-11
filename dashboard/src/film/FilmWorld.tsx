import { useEffect, type CSSProperties } from "react";
import { CAST } from "@swarm/shared/cast";
import { BotCharacter } from "../characters/BotCharacter";
import { MasterCharacter } from "../characters/MasterCharacter";
import { useBotActor } from "../characters/useBotActor";
import { activityAt, clamp, ease, workers } from "./timeline";
import "./world.css";

const faces = ["suspicious", "found", "bored", "focused", "curious"] as const;
const symbols = ["⌂", "✦", "♧", "↗", "≡"];
const slugs = ["stays", "discoveries", "food", "routes", "itinerary"];
const mix = (a: number, b: number, p: number) => a + (b - a) * p;

// Stage coordinates keep the same character nodes alive from browser work to sleep.
function positionAt(time: number, i: number) {
  const w = workers[i];
  const t = Math.min(time, w.done);
  const step = Math.max(0, (t - 14) / 2.5) + i;
  const move = ease(((step % 1) - 0.5) * 2);
  const points = [
    [275, 126],
    [280, 197],
    [150, 184],
    [255, 155],
  ];
  const a = points[Math.floor(step) % points.length];
  const b = points[(Math.floor(step) + 1) % points.length];
  const dock = ease((time - 31 - i * 0.1) / 1.4);
  const x = mix(w.x + mix(a[0], b[0], move), 550 + i * 125, dock);
  const y = mix(w.y + mix(a[1], b[1], move), 785, dock);
  const home = ease((time - 42 - i * 0.22) / 2.6);
  return {
    x: mix(x, 587 + i * 142, home),
    y: mix(y, 594, home) - Math.sin(home * Math.PI) * (90 + i * 17),
    size: mix(62, 100, home),
    angle: Math.sin(home * Math.PI * 2) * (i % 2 ? -12 : 12),
  };
}

function Agent({ time, index }: { time: number; index: number }) {
  const bot = CAST[index];
  const w = workers[index];
  const finished = time >= w.done + 0.7;
  const mood = finished ? faces[index] : "focused";
  const actor = useBotActor(bot.id, mood, false, 1, "film-work");
  const activity = finished ? null : activityAt(time, index);
  useEffect(() => {
    if (activity) actor.flourish(activity, { hold: true });
    else actor.clearActivity();
    return () => actor.clearActivity();
  }, [actor, activity]);
  const p = positionAt(time, index);
  return (
    <div
      className="film-world-agent"
      data-agent={index}
      data-face={mood}
      style={{
        left: p.x,
        top: p.y,
        transform: `translate(-50%, -50%) rotate(${p.angle}deg)`,
      }}
    >
      <BotCharacter
        id={bot.id}
        mood={mood}
        size={p.size}
        actor={actor}
        resting={time >= 47 + index * 0.18}
        seed="film-work"
      />
      {time < 31 && (
        <span className="film-agent-pointer" style={{ color: bot.color }}>
          ↖
        </span>
      )}
    </div>
  );
}

function BrowserPage({ index, time }: { index: number; time: number }) {
  const w = workers[index];
  const bot = CAST[index];
  const done = time >= w.done;
  const progress = clamp((time - 14.5 - index * 0.18) / (w.done - 14.5));
  const closing = ease((time - 31 - index * 0.08) / 1);
  return (
    <article
      className="film-browser"
      data-worker={index}
      data-complete={done}
      style={
        {
          left: w.x,
          top: w.y,
          "--worker": bot.color,
          opacity: 1 - closing,
          transform: `translateY(${closing * 25}px) scale(${1 - closing * 0.08})`,
        } as CSSProperties
      }
    >
      <header>
        <span className="film-traffic">
          <i />
          <i />
          <i />
        </span>
        <b>{bot.name}</b>
        <span>{done ? "✓ Complete" : "● Working"}</span>
      </header>
      <div className="film-address">
        <span>‹ &nbsp; › &nbsp; ⟳</span>
        <span>⌕ &nbsp; workspace / {slugs[index]}</span>
        <span>⋯</span>
      </div>
      <div className="film-webpage">
        <span className="film-page-eyebrow">
          KOCHI / {w.role.toUpperCase()}
        </span>
        <h2>{w.page}</h2>
        <div className="film-page-cards">
          {w.lines.slice(0, 2).map((line, j) => (
            <div key={line} className="film-page-card">
              <div className={`film-page-art film-art-${index}`}>
                <i />
                <i />
                <b>{symbols[index]}</b>
              </div>
              <strong>{line}</strong>
              <span>
                {j ? "Worth a closer look" : "A little more to explore"}
              </span>
            </div>
          ))}
        </div>
        <div className="film-page-note">
          <i style={{ width: `${progress * 100}%` }} />
          <span>
            {done
              ? `✓ ${w.lines[2]}`
              : index === 1 && time >= 24
                ? "Adding a rainy-day alternative…"
                : `${Math.round(progress * 100)}% · Comparing the details`}
          </span>
        </div>
      </div>
    </article>
  );
}

function Charms({ time }: { time: number }) {
  return (
    <div className="film-charms" aria-hidden="true">
      {workers.flatMap((w, i) =>
        [
          { at: 19.2 + i * 0.19, inward: false, kind: "dispatch", glyph: "✦" },
          {
            at: w.report + 1.3,
            inward: true,
            kind: "report",
            glyph: symbols[i],
          },
          { at: w.done - 1.25, inward: true, kind: "complete", glyph: "✓" },
          ...(i === 1
            ? [{ at: 24, inward: false, kind: "followup", glyph: "+" }]
            : []),
        ].map((signal) => {
          const p = clamp((time - signal.at) / 1.25);
          if (p <= 0 || p >= 1) return null;
          const from = signal.inward
            ? positionAt(signal.at, i)
            : { x: 800, y: 410 };
          const to = signal.inward
            ? { x: 800, y: 410 }
            : positionAt(signal.at + 1.25, i);
          const travel = ease(p);
          const x =
            mix(from.x, to.x, travel) +
            Math.sin(p * Math.PI) * (i % 2 ? 55 : -55);
          const y = mix(from.y, to.y, travel) - Math.sin(p * Math.PI) * 85;
          return (
            <span
              key={`${i}-${signal.kind}`}
              className="film-charm"
              data-signal={signal.kind}
              style={{
                left: x,
                top: y,
                color: CAST[i].color,
                opacity: Math.sin(p * Math.PI) ** 0.3,
                transform: `translate(-50%, -50%) rotate(${Math.sin(p * Math.PI * 2) * 25}deg) scale(${0.7 + Math.sin(p * Math.PI) * 0.3})`,
              }}
            >
              {signal.glyph}
              <i>·</i>
              <i>·</i>
            </span>
          );
        }),
      )}
    </div>
  );
}

function Review({ time }: { time: number }) {
  const checked = Math.max(0, Math.min(5, Math.floor((time - 31.7) / 0.7)));
  const seal = ease((time - 35.4) / 0.6);
  return (
    <section
      className="film-review"
      data-reviewed={checked}
      style={{
        opacity: ease((time - 31.2) / 0.6) * (1 - ease((time - 36) / 0.45)),
        transform: `translateY(${-seal * 30}px) scale(${1 - seal * 0.12})`,
      }}
    >
      <span className="film-review-label">ONYX IS REVIEWING</span>
      {workers.map((w, i) => (
        <div
          key={w.page}
          className="film-review-row"
          data-checked={i < checked}
          data-reviewing={i === checked}
          style={{ "--worker": CAST[i].color } as CSSProperties}
        >
          <span className="film-review-symbol">{symbols[i]}</span>
          <div>
            <strong>{w.page}</strong>
            <small>
              {i < checked
                ? w.lines[2]
                : i === checked
                  ? "Checking details & fitting it into the plan…"
                  : "Contribution received"}
            </small>
          </div>
          <b>{i < checked ? "✓" : i === checked ? "···" : "·"}</b>
        </div>
      ))}
      <footer>
        {checked === 5
          ? "Everything checked. One report, ready for you."
          : "Five contributions. Every detail considered."}
      </footer>
    </section>
  );
}

function Report({ time }: { time: number }) {
  const fly = ease((time - 36) / 0.9);
  const open = ease((time - 36.8) / 0.8);
  const out = ease((time - 42) / 0.8);
  return (
    <div
      className="film-report-delivery"
      data-delivered={time >= 37.6}
      style={{ opacity: 1 - out }}
    >
      <div
        className="film-report-envelope"
        style={{
          left: 800,
          top: mix(345, 475, fly),
          opacity: 1 - open,
          transform: `translate(-50%,-50%) rotate(${Math.sin(fly * Math.PI) * -14}deg) scale(${0.45 + fly * 0.55})`,
        }}
      >
        <span>✧</span>
        <b>YOUR WEEKEND, SORTED.</b>
        <i>From Onyx & your squad ↗</i>
      </div>
      <div
        className="film-results"
        style={{
          opacity: open,
          transform: `translateY(${(1 - open) * 50 - out * 25}px) scale(${0.94 + open * 0.06})`,
        }}
      >
        <div className="film-result-title">
          <h1>Consider it done.</h1>
          <p>Reviewed by Onyx. Made for you.</p>
        </div>
        <div className="film-itinerary">
          <div className="film-itinerary-top">
            <span>KOCHI / YOUR WEEKEND REPORT</span>
            <b>✓ All five contributions reviewed</b>
          </div>
          <div className="film-days">
            <div>
              <span>01 / SATURDAY</span>
              <h2>Explore & connect.</h2>
              <p>Settle into Fort Kochi</p>
              <p>Art lanes, cafés & a shared lunch</p>
              <p>Sunset along the waterfront</p>
            </div>
            <div>
              <span>02 / SUNDAY</span>
              <h2>Slow down, together.</h2>
              <p>A relaxed team breakfast</p>
              <p>Local galleries if rain rolls in</p>
              <p>One easy route back home</p>
            </div>
          </div>
          <div className="film-deliverables">
            {workers.map((w, i) => (
              <span key={w.page}>
                <i style={{ background: CAST[i].color }} />
                {w.page}
              </span>
            ))}
          </div>
          <small>
            Illustrative itinerary · verify availability before making plans
          </small>
        </div>
      </div>
    </div>
  );
}

export function FilmWorld({ time }: { time: number }) {
  const review = ease((time - 31) / 1.2);
  const home = ease((time - 42.3) / 2.8);
  // Start inside Plum's browser, then pull back to reveal all five independent pages.
  const zoom = 1 + 1.5 * (1 - ease((time - 17) / 2.2));
  const onyxY =
    mix(mix(410, 245, review), 594, home) - Math.sin(home * Math.PI) * 55;
  const followup = time >= 24 && time < 27;
  const received = workers.filter((w) => time >= w.report + 2.55).length;
  const tick = received;
  return (
    <div className="film-world" style={{ opacity: ease((time - 13.4) / 0.6) }}>
      <div
        className="film-world-camera"
        style={{
          transform: `translate(${(1 - ease((time - 17) / 2.2)) * 520}px, ${(1 - ease((time - 17) / 2.2)) * 150}px) scale(${zoom})`,
          transformOrigin: "280px 280px",
        }}
      >
        {time < 32.5 && (
          <>
            <div className="film-world-heading" style={{ opacity: 1 - review }}>
              <h1>Every mind. On it.</h1>
              <p>Five browsers. One shared purpose.</p>
            </div>
            {workers.map((_, i) => (
              <BrowserPage key={i} index={i} time={time} />
            ))}
          </>
        )}
        {time < 32 && <Charms time={time} />}
        {time >= 31 && time < 36.5 && <Review time={time} />}
        {time >= 36 && time < 43 && <Report time={time} />}
        {time >= 42 && (
          <section
            className="film-ending"
            style={{ opacity: ease((time - 42.4) / 1.3) }}
          >
            <h1>
              SquadLings<span className="film-brand-dot">●</span>
            </h1>
            <p>One squad. Many minds.</p>
            <span
              className="film-rest-caption"
              style={{ opacity: ease((time - 48) / 0.7) }}
            >
              Big task. Little team. Done.
            </span>
          </section>
        )}
        <div
          className="film-world-onyx"
          style={{ left: mix(800, 445, home), top: onyxY }}
        >
          <MasterCharacter
            size={mix(126, 106, home)}
            state={
              time >= 47
                ? "idle"
                : time >= 35.3
                  ? "done"
                  : time >= 31
                    ? "merging"
                    : followup
                      ? "planning"
                      : "monitoring"
            }
            tick={tick}
            resting={time >= 47}
          />
          {time >= 31.7 && time < 35.3 && (
            <svg
              className="film-review-lens"
              viewBox="0 0 70 70"
              style={{
                transform: `translateX(${Math.sin((time - 31.7) * 4) * 10}px) rotate(${-15 + Math.sin(time * 3) * 8}deg)`,
              }}
            >
              <circle
                cx="28"
                cy="28"
                r="18"
                fill="#262626"
                stroke="white"
                strokeWidth="4"
              />
              <path
                d="M41 41L59 59"
                stroke="white"
                strokeWidth="7"
                strokeLinecap="round"
              />
              <path d="M18 28h20M18 34h13" stroke="#aaa" strokeWidth="2" />
            </svg>
          )}
          {time >= 47 && (
            <span className="sleep-notes">
              <i>z</i>
              <i>z</i>
              <i>z</i>
            </span>
          )}
          {time < 31 && (
            <div className="film-onyx-caption">
              <span>ONYX / ORCHESTRATOR</span>
              <strong>
                {followup
                  ? "Lime, add a rainy-day backup."
                  : received
                    ? "Got it. Keep going, team."
                    : "A clear task for every mind."}
              </strong>
              <small>{received} / 5 reports received</small>
            </div>
          )}
          {time >= 31 && time < 36 && (
            <div className="film-onyx-review-title">
              <h1>{time >= 35.3 ? "All together." : "One last look."}</h1>
            </div>
          )}
        </div>
        {CAST.map((bot, i) => (
          <Agent key={bot.id} index={i} time={time} />
        ))}
      </div>
    </div>
  );
}
