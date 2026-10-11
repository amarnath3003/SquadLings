import { useEffect, useState } from "react";
import { useMotionValueEvent } from "motion/react";
import type { ActivityCue, Actor } from "./useBotActor";
import "../styles/activity.css";

// Only activity boundaries render React; all body motion stays in MotionValues.
export function useActorActivity(actor: Actor) {
  const [cue, setCue] = useState<ActivityCue | null>(actor.activity.get());
  useMotionValueEvent(actor.activity, "change", (next) => setCue(next));
  useEffect(() => setCue(actor.activity.get()), [actor]);
  return cue;
}

const ink = {
  fill: "none",
  stroke: "#171717",
  strokeWidth: 2.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function ActivityFace({ cue }: { cue: ActivityCue }) {
  switch (cue.kind) {
    case "read":
      return (
        <g data-activity-face="read">
          <circle
            cx="22"
            cy="30"
            r="9"
            fill="white"
            {...{ stroke: "#171717", strokeWidth: 2.8 }}
          />
          <circle
            className="activity-pupil"
            cx="22"
            cy="30"
            r="4"
            fill="#171717"
          />
          <circle cx="43" cy="31" r="2.8" fill="#171717" />
          <path d="M28 37l6 6M39 23q5-3 9 0" {...ink} />
        </g>
      );
    case "ask":
      return (
        <g data-activity-face="ask">
          <path d="M15 20q5-4 10-1M38 23l9 2" {...ink} />
          <circle cx="22" cy="30" r="5.5" {...ink} />
          <circle cx="43" cy="32" r="3" fill="#171717" />
          <ellipse cx="32" cy="42" rx="2.7" ry="3.2" {...ink} />
        </g>
      );
    case "found":
      return (
        <g data-activity-face="found">
          <path
            d="M22 20l2.7 6.3L31 29l-6.3 2.7L22 38l-2.7-6.3L13 29l6.3-2.7ZM43 20l2.7 6.3L52 29l-6.3 2.7L43 38l-2.7-6.3L34 29l6.3-2.7Z"
            fill="#171717"
          />
          <path d="M27 43q5 6 10 0" {...ink} />
        </g>
      );
    case "finish":
      return (
        <g data-activity-face="finish">
          <path d="M16 31q6-11 12 0M36 31q6-11 12 0" {...ink} />
          <path d="M24 39q8 14 16 0Z" fill="#171717" />
          <path
            d="M29 45h6"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>
      );
    case "type":
    case "output":
      return (
        <g data-activity-face={cue.kind}>
          <path d="M17 23l9 2M38 25l9-2" {...ink} />
          <circle cx="23" cy="32" r="3" fill="#171717" />
          <circle cx="41" cy="32" r="3" fill="#171717" />
          <path d="M28 41q4 3 8 0" {...ink} />
        </g>
      );
    default:
      return null;
  }
}

export function ActivityProps({ cue }: { cue: ActivityCue }) {
  return (
    <g
      key={cue.sequence}
      data-activity-prop={cue.kind}
      aria-hidden="true"
      {...ink}
    >
      {cue.kind === "type" && (
        <>
          <g className="activity-keyboard">
            <rect x="5" y="50" width="54" height="17" rx="4" fill="white" />
            <path
              d="M11 55h42M11 60h42M17 53v9M26 53v9M35 53v9M44 53v9M23 64h18"
              strokeWidth="1.8"
            />
            <rect
              className="activity-key"
              x="27"
              y="53"
              width="7"
              height="9"
              rx="1"
              fill="var(--bot-color)"
              stroke="none"
            />
          </g>
          <ellipse
            className="activity-hand-left"
            cx="18"
            cy="47"
            rx="6"
            ry="4"
            fill="white"
          />
          <ellipse
            className="activity-hand-right"
            cx="46"
            cy="47"
            rx="6"
            ry="4"
            fill="white"
          />
        </>
      )}
      {cue.kind === "output" && (
        <>
          <g className="activity-paper">
            <path d="M54 13h18l7 7v31H54Z" fill="white" />
            <path d="M72 13v8h7" strokeWidth="1.8" />
            {[28, 34, 40].map((y, i) => (
              <path
                key={y}
                className={`activity-output-line activity-line-${i}`}
                d={`M59 ${y}h${i === 2 ? 9 : 14}`}
                strokeWidth="2"
              />
            ))}
            <path
              className="activity-caret"
              d="M70 39v5"
              stroke="var(--bot-color)"
            />
          </g>
          <path d="M49 43q8 4 12-6" />
          <circle
            className="activity-writing-hand"
            cx="61"
            cy="37"
            r="4"
            fill="white"
          />
        </>
      )}
      {cue.kind === "scroll" && (
        <g
          className="activity-scroll"
          style={
            {
              "--scroll-step": `${cue.direction * 10}px`,
            } as React.CSSProperties
          }
        >
          <rect x="59" y="18" width="20" height="37" rx="7" fill="white" />
          <path d="M65 25l4-4 4 4M65 48l4 4 4-4" />
          <path
            className="activity-scroll-lines"
            d="M64 31h10M64 37h10M64 43h10"
            strokeWidth="2"
          />
          <path d="M52 40q7 1 10-5" />
          <circle cx="63" cy="34" r="3" fill="white" />
        </g>
      )}
      {cue.kind === "read" && (
        <g className="activity-reading-lines" strokeWidth="1.8" opacity=".85">
          <path d="M12 47h35M12 52h28M12 57h32" />
          <rect
            className="activity-scan"
            x="10"
            y="44"
            width="14"
            height="6"
            rx="3"
            fill="white"
            fillOpacity=".65"
            stroke="none"
          />
        </g>
      )}
      {cue.kind === "ask" && (
        <>
          <g className="activity-question">
            <path
              d="M57 6q-1-8 6-8 8 0 7 7-1 4-6 6v4M64 21v.1"
              strokeWidth="3.5"
            />
            <path d="M54 14l-4 3" strokeWidth="2" opacity=".4" />
          </g>
          <path d="M48 47q-5 6-13 1" />
          <circle cx="34" cy="48" r="4" fill="white" />
        </>
      )}
      {cue.kind === "found" && (
        <>
          <g className="activity-idea">
            <path
              d="M25 0q-3-4-3-8a10 10 0 0 1 20 0q0 4-3 8l-2 4H27Z"
              fill="#fff3ad"
            />
            <path d="M28 8h8M32-25v-4M16-19l-3-3M48-19l3-3M11-7H7M53-7h4" />
          </g>
          <path d="M8 38Q0 33 3 23M56 38q8-5 5-15" />
          <circle cx="3" cy="23" r="4" fill="white" />
          <circle cx="61" cy="23" r="4" fill="white" />
        </>
      )}
      {cue.kind === "finish" && (
        <>
          <path d="M7 39Q-5 31 0 18M57 39q12-8 7-21" />
          <circle cx="0" cy="18" r="4" fill="white" />
          <circle cx="64" cy="18" r="4" fill="white" />
          <g className="activity-medal">
            <circle cx="32" cy="58" r="10" fill="#fff3ad" />
            <path d="M27 58l4 4 7-9" strokeWidth="3" />
            <path d="M26 66l-2 9 8-4 8 4-2-9" fill="var(--bot-color)" />
          </g>
          <g className="activity-victory-sparks" stroke="var(--bot-color)">
            <path d="M-8 5v8M-12 9h8M72 5v8M68 9h8M32-13v8M28-9h8" />
          </g>
        </>
      )}
    </g>
  );
}
