import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { animate, motion } from "motion/react";
import type { BotId, Mood } from "@swarm/shared/types";
import { castFor } from "@swarm/shared/cast";
import { FACES } from "./faces";
import { PERSONALITY, hash } from "./personality";
import { useBotActor, type Actor } from "./useBotActor";
import { useCharacterLife } from "./useCharacterLife";
import type { LifeCue } from "./life";
import { Icon } from "./icons";
import { EMOTES, type Bubble } from "../mood/emotes";
import { playUi, playVoice, useAudio } from "../effects/sound";
export interface CharacterProps {
  id: BotId;
  mood: Mood;
  size?: number;
  reduced?: boolean;
  speed?: number;
  pointer?: boolean;
  actor?: Actor;
  bubble?: Bubble;
  label?: string;
  seed?: string;
  interactive?: boolean;
  paused?: boolean;
  resting?: boolean;
  cue?: LifeCue;
  attention?: -1 | 1;
  edge?: "left" | "top" | "right";
}
function IndependentCharacter(props: CharacterProps) {
  const actor = useBotActor(
    props.id,
    props.mood,
    props.reduced ?? false,
    props.speed ?? 1,
    props.seed ?? "launch",
  );
  return <CharacterRig {...props} actor={actor} />;
}
export const BotCharacter = memo(function BotCharacter(props: CharacterProps) {
  return props.actor ? (
    <CharacterRig {...props} actor={props.actor} />
  ) : (
    <IndependentCharacter {...props} />
  );
});
function CharacterRig({
  id,
  mood,
  size = 80,
  reduced = false,
  speed = 1,
  pointer = false,
  actor,
  bubble,
  label,
  seed = "launch",
  interactive = false,
  paused = false,
  resting = false,
  cue,
  edge,
  attention,
}: CharacterProps & { actor: Actor }) {
  const cast = castFor(id),
    dna = PERSONALITY[id];
  const speaking = useAudio((s) => s.speaking?.id === id);
  const [displayMood, setDisplayMood] = useState(mood),
    [booped, setBooped] = useState(0);
  const root = useRef<HTMLDivElement>(null),
    lastBoop = useRef(-Infinity);
  const life = useCharacterLife({
    id,
    mood,
    reduced,
    paused,
    resting,
    speed,
    seed,
    root,
    trackPointer: !pointer && size >= 64,
  });
  const { perform, gazeX, gazeY } = life;
  useEffect(() => {
    if (!life.active || resting || attention === undefined) return;
    gazeX.set(attention * 3);
    gazeY.set(-0.5);
  }, [attention, life.active, resting, gazeX, gazeY]);
  useEffect(() => {
    if (cue) perform(cue.gesture);
  }, [cue, perform]);
  useEffect(() => {
    if (reduced || paused) {
      setDisplayMood(mood);
      return;
    }
    actor.blink.stop();
    actor.blink.set(1);
    const playback = animate(actor.blink, [1, 0.1, 1], {
      duration: 0.14 / speed,
    });
    const timer = setTimeout(() => setDisplayMood(mood), 70 / speed);
    return () => {
      clearTimeout(timer);
      playback.stop();
    };
  }, [mood, reduced, paused, speed, actor]);
  useEffect(() => {
    if (!booped) return;
    const timer = setTimeout(() => setBooped(0), 1100);
    return () => clearTimeout(timer);
  }, [booped]);
  // Local affection does not overwrite an agent's error, approval, or task mood.
  const shownMood = booped && !pointer ? "happy" : displayMood;
  const living = life.active && mood !== "failed";
  return (
    <div
      ref={root}
      className={`character ${pointer ? "character-pointer" : ""} ${living ? "life-active" : ""} ${resting ? "is-resting" : ""}`}
      style={
        {
          width: size,
          height: size,
          "--float": `${resting ? 1 : dna.float * (mood === "focused" ? 0.3 : 1)}px`,
          "--period": `${(resting ? 5.5 : dna.period) / Math.min(speed, 2)}s`,
          "--delay": `${-(hash(seed + id) % 3000) / 1000}s`,
          "--bot-color": cast.color,
        } as CSSProperties
      }
      data-character={id}
      data-speaking={speaking || undefined}
      data-life={
        reduced
          ? "reduced"
          : paused
            ? "paused"
            : !life.active
              ? "offscreen"
              : resting
                ? "resting"
                : "awake"
      }
    >
      {pointer && (
        <svg
          className="pointer-tip"
          width="18"
          height="18"
          viewBox="-2 -2 20 20"
        >
          <path
            d="M0 0 L14 5 L5 14 Z"
            fill={cast.color}
            stroke="white"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <div
        className="character-seat"
        style={{ left: pointer ? 10 : 0, top: pointer ? 10 : 0 }}
      >
        {speaking && (
          <span
            className={`speaking-halo ${reduced ? "speaking-still" : ""}`}
            aria-hidden="true"
          />
        )}
        <svg
          viewBox="0 0 64 68"
          width={size}
          height={(size * 68) / 64}
          role="img"
          aria-label={`${cast.name}, ${resting ? "resting" : booped && !pointer ? "happy" : mood}`}
        >
          <ellipse
            className="life-shadow"
            cx="32"
            cy="64"
            rx="20"
            ry="2.8"
            fill="#111"
            opacity=".11"
          />
          <motion.g
            style={{
              y: actor.hopY,
              rotate: actor.tilt,
              scaleX: actor.scaleX,
              scaleY: actor.scaleY,
              transformBox: "view-box",
              originX: "32px",
              originY: "60px",
            }}
          >
            <motion.g
              style={{
                x: life.x,
                y: life.y,
                rotate: life.tilt,
                scaleX: life.sx,
                scaleY: life.sy,
                transformBox: "view-box",
                originX: "32px",
                originY: "57px",
              }}
            >
              <g className={living ? "idle-float" : ""}>
                <g className="life-breath">
                  <circle cx="32" cy="32" r="32" fill="white" />
                  <circle cx="32" cy="32" r="30" fill={cast.color} />
                  <path
                    d="M12 24A22 22 0 0 1 34 10"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    opacity=".2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M17 53A25 25 0 0 0 53 40"
                    fill="none"
                    stroke="#111"
                    strokeWidth="1.3"
                    opacity=".07"
                    strokeLinecap="round"
                  />
                  <motion.g style={{ x: actor.eyeX, y: actor.eyeY }}>
                    <motion.g
                      data-gaze
                      style={{ x: life.gazeX, y: life.gazeY }}
                    >
                      <motion.g
                        style={{
                          scaleY: actor.blink,
                          transformBox: "view-box",
                          originX: "32px",
                          originY: "30px",
                        }}
                      >
                        <motion.g
                          data-blink
                          style={{
                            scaleY: life.blink,
                            transformBox: "view-box",
                            originX: "32px",
                            originY: "30px",
                          }}
                        >
                          {resting ? (
                            <path
                              d="M17 31q5 4 10 0M37 31q5 4 10 0"
                              fill="none"
                              stroke="#111"
                              strokeWidth="3.5"
                              strokeLinecap="round"
                            />
                          ) : (
                            FACES[shownMood]
                          )}
                        </motion.g>
                      </motion.g>
                      {booped > 0 && !pointer && (
                        <g fill="#fff" opacity=".35">
                          <ellipse cx="16" cy="39" rx="4" ry="2" />
                          <ellipse cx="48" cy="39" rx="4" ry="2" />
                        </g>
                      )}
                    </motion.g>
                  </motion.g>
                </g>
              </g>
            </motion.g>
          </motion.g>
        </svg>
        {resting && (
          <span className="sleep-notes" aria-hidden="true">
            <i>z</i>
            <i>z</i>
            <i>z</i>
          </span>
        )}
        {booped > 0 && !reduced && (
          <span key={booped} className="affection-burst" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} style={{ "--petal": i } as CSSProperties}>
                ♡
              </i>
            ))}
          </span>
        )}
        {interactive && !paused && (
          <button
            className="boop-target"
            data-audio="off"
            aria-label={`Boop ${cast.name}`}
            title={`${cast.name} · Press and release for a little love`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              life.press(true);
            }}
            onPointerUp={() => life.press(false)}
            onPointerCancel={() => life.press(false)}
            onBlur={() => life.press(false)}
            onClick={(e) => {
              e.stopPropagation();
              if (performance.now() - lastBoop.current < 650) return;
              lastBoop.current = performance.now();
              setBooped(performance.now());
              perform("love");
              playUi("boop", {
                botId: id,
                scope: pointer ? "workflow" : "preview",
              });
              playVoice(id, "affection", {
                scope: pointer ? "workflow" : "preview",
              });
            }}
          />
        )}
        {(bubble || booped > 0) && (
          <motion.div
            key={booped ? "heart" : bubble?.name}
            className={`speech-bubble ${edge ? `bubble-${edge}` : ""}`}
            initial={{ scale: reduced ? 1 : 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.16 / speed }}
            style={{ borderColor: cast.color }}
          >
            <Icon
              name={booped ? "heart" : EMOTES[bubble!.name].icon}
              size={17}
            />
          </motion.div>
        )}
        {label && (
          <span className="name-pill" style={{ borderColor: cast.color }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
