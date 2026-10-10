import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CAST } from "@swarm/shared/cast";
import type { BotId, Mood } from "@swarm/shared/types";
import { BotCharacter } from "../characters/BotCharacter";
import { HABITS, type LifeCue } from "../characters/life";
import { Icon } from "../characters/icons";
import { sound } from "../effects/sound";

type Play = "hello" | "dance" | "spark" | "surprise" | "wake" | "pet" | "chat";
interface StageCue {
  play: Play;
  serial: number;
  target?: BotId;
  line?: number;
  text?: string;
  friend?: BotId;
}
const CONVERSATIONS: { from: BotId; to: BotId; line: string; reply: string }[] =
  [
    {
      from: "bot2",
      to: "bot1",
      line: "I found a shortcut!",
      reply: "Is it actually shorter?",
    },
    {
      from: "bot5",
      to: "bot3",
      line: "Cloud watching?",
      reply: "Already on it.",
    },
    {
      from: "bot4",
      to: "bot2",
      line: "Race you there.",
      reply: "Wait, where is there?",
    },
    { from: "bot1", to: "bot5", line: "Why so cheerful?", reply: "Why not?" },
    {
      from: "bot3",
      to: "bot4",
      line: "Remember to breathe.",
      reply: "Scheduling it now.",
    },
  ];
const REPLIES: Record<Play, string> = {
  hello: "A hello, five different ways.",
  dance: "Everyone has their own rhythm.",
  spark: "One little spark. Five big reactions.",
  surprise: "You have their attention!",
  wake: "A stretch, a blink, and back to it.",
  pet: "A little affection goes a long way.",
  chat: "Just hanging out together.",
};
function StageBot({
  index,
  selected,
  onMeet,
  reduced,
  resting,
  cue,
  awake,
}: {
  index: number;
  selected: boolean;
  onMeet: () => void;
  reduced: boolean;
  resting: boolean;
  cue?: StageCue;
  awake: boolean;
}) {
  const cast = CAST[index],
    habit = HABITS[cast.id];
  const [reaction, setReaction] = useState<{
    text: string;
    mood: Mood;
    cue: LifeCue;
  }>();
  useEffect(() => {
    setReaction(undefined);
    if (!cue || resting || !awake) return;
    if (cue.target && cue.target !== cast.id) return;
    const play = cue.play;
    const delay =
      reduced || cue.target ? 0 : index * (play === "spark" ? 480 : 140);
    const timer = setTimeout(() => {
      const gesture =
        play === "dance"
          ? "dance"
          : play === "surprise"
            ? "startle"
            : play === "wake"
              ? "stretch"
              : play === "pet"
                ? "love"
                : play === "chat"
                  ? habit.gestures[(cue.line ?? 0) % habit.gestures.length]
                  : play === "spark"
                    ? "bounce"
                    : "wave";
      const text =
        cue.text ??
        (play === "hello"
          ? habit.hello
          : play === "dance"
            ? habit.dance
            : play === "spark"
              ? habit.spark
              : play === "surprise"
                ? [
                    "I knew it.",
                    "What was that?!",
                    "Oh. Goodness.",
                    "On alert!",
                    "You got me!",
                  ][index]
                : play === "wake"
                  ? [
                      "Eyes open.",
                      "A new adventure?",
                      "Five more minutes?",
                      "Ready.",
                      "Good morning, world!",
                    ][index]
                  : play === "pet"
                    ? [
                        "…okay, that was nice.",
                        "Again? Again!",
                        "That’s the spot.",
                        "Morale restored.",
                        "Sending it right back ♡",
                      ][index]
                    : habit.lines[(cue.line ?? 0) % habit.lines.length]);
      setReaction({
        text,
        mood:
          play === "surprise"
            ? "curious"
            : play === "chat"
              ? cast.signature
              : play === "spark"
                ? "found"
                : "happy",
        cue: { gesture, serial: cue.serial },
      });
      if (play !== "chat")
        sound(cast.id, play === "spark" ? "found" : "click", 1);
    }, delay);
    const clear = setTimeout(
      () => setReaction(undefined),
      delay + (play === "dance" ? 5300 : 2700),
    );
    return () => {
      clearTimeout(timer);
      clearTimeout(clear);
    };
  }, [cue, resting, awake, reduced, cast.id, cast.signature, habit, index]);
  return (
    <button
      className={`stage-character ${selected ? "selected" : ""}`}
      onClick={onMeet}
      aria-label={`Meet ${cast.name}`}
      aria-pressed={selected}
      style={{ "--character-color": cast.color } as CSSProperties}
    >
      <AnimatePresence>
        {reaction && (
          <motion.span
            key={reaction.cue.serial}
            className="stage-thought"
            initial={{
              opacity: 0,
              y: reduced ? 0 : 5,
              scale: reduced ? 1 : 0.94,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {reaction.text}
          </motion.span>
        )}
      </AnimatePresence>
      <motion.div
        className="stage-art"
        drag={!reduced && !resting}
        dragConstraints={{ left: -20, right: 20, top: -35, bottom: 4 }}
        dragElastic={0.12}
        dragSnapToOrigin
        whileDrag={{ scale: 1.08, cursor: "grabbing" }}
        onDragStart={() => setReaction(undefined)}
      >
        <BotCharacter
          id={cast.id}
          mood={reaction?.mood ?? cast.signature}
          size={128}
          reduced={reduced}
          resting={resting}
          cue={reaction?.cue}
          paused={!awake}
          attention={
            reaction && cue?.friend
              ? CAST.findIndex((c) => c.id === cue.friend) < index
                ? -1
                : 1
              : undefined
          }
          seed="living-room"
        />
      </motion.div>
      <strong>{cast.name}</strong>
      <span>{resting ? "Dreaming a little" : cast.personality}</span>
      <div className="stage-indicator" />
    </button>
  );
}
export function LivingStage({
  selected,
  onSelect,
  reduced,
}: {
  selected: BotId;
  onSelect: (id: BotId) => void;
  reduced: boolean;
}) {
  const [cue, setCue] = useState<StageCue>(),
    [resting, setResting] = useState(false),
    [awake, setAwake] = useState(!document.hidden);
  const [announcement, setAnnouncement] = useState(""),
    [ambient, setAmbient] = useState(true);
  const stage = useRef<HTMLElement>(null),
    serial = useRef(0),
    lastInteraction = useRef(-Infinity);
  useEffect(() => {
    let inView = true;
    const update = () => setAwake(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    if (stage.current) observer.observe(stage.current);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    if (!awake || !ambient || resting || reduced) return;
    let turn = 0;
    let replyTimer: ReturnType<typeof setTimeout>;
    const timer = setInterval(() => {
      if (performance.now() - lastInteraction.current < 7000) return;
      const conversation = CONVERSATIONS[turn % CONVERSATIONS.length];
      const token = ++serial.current;
      setCue({
        play: "chat",
        target: conversation.from,
        friend: conversation.to,
        text: conversation.line,
        line: turn,
        serial: token,
      });
      replyTimer = setTimeout(() => {
        if (serial.current !== token) return;
        setCue({
          play: "chat",
          target: conversation.to,
          friend: conversation.from,
          text: conversation.reply,
          line: turn,
          serial: ++serial.current,
        });
      }, 2100);
      turn++;
    }, 6200);
    return () => {
      clearInterval(timer);
      clearTimeout(replyTimer);
    };
  }, [awake, ambient, resting, reduced]);
  const play = (action: Play, target?: BotId) => {
    lastInteraction.current = performance.now();
    setResting(false);
    setCue({ play: action, serial: ++serial.current, target });
    setAnnouncement(
      target
        ? `${CAST.find((c) => c.id === target)!.name}: ${REPLIES[action]}`
        : REPLIES[action],
    );
  };
  return (
    <section
      ref={stage}
      className={`living-room ${resting ? "night-time" : ""} ${reduced ? "quiet-room" : ""}`}
      aria-label="Meet all five characters"
    >
      <div className="room-header">
        <span>
          <i className={awake && !resting ? "awake-dot" : ""} />
          {resting ? "A LITTLE QUIET TIME" : "THE SQUAD IS HANGING OUT"}
        </span>
        <button
          className="room-ambient"
          aria-pressed={ambient}
          onClick={() => setAmbient(!ambient)}
          title="Toggle spontaneous character chatter"
        >
          Chatter {ambient ? "on" : "off"}
          <Icon name={ambient ? "volume" : "mute"} size={12} />
        </button>
      </div>
      <div
        className="character-stage living-stage"
        data-stage-mode={resting ? "resting" : (cue?.play ?? "idle")}
      >
        <div className="stage-grid" />
        <div className="room-horizon" />
        <div className="room-orbit orbit-one" />
        <div className="room-orbit orbit-two" />
        {!reduced && awake && (
          <div className="room-motes" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <i
                key={i}
                style={
                  {
                    left: `${8 + i * 12}%`,
                    "--mote": i,
                    background: CAST[i % 5].color,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        )}
        <div className="room-roster">
          {CAST.map((cast, index) => (
            <StageBot
              key={cast.id}
              index={index}
              selected={selected === cast.id}
              onMeet={() => {
                onSelect(cast.id);
                play("pet", cast.id);
              }}
              reduced={reduced}
              resting={resting}
              cue={cue}
              awake={awake}
            />
          ))}
        </div>
        {cue?.play === "spark" && !reduced && !resting && awake && (
          <motion.div
            key={cue.serial}
            className="passing-spark"
            aria-hidden="true"
            initial={{ left: "10%", y: 0, opacity: 0 }}
            animate={{
              left: ["10%", "30%", "50%", "70%", "90%"],
              y: [0, -28, 0, -28, 0],
              opacity: [0, 1, 1, 1, 0],
              rotate: [0, 90, 180, 270, 360],
            }}
            transition={{ duration: 2.4, ease: "easeInOut" }}
          >
            <Icon name="spark" size={22} />
          </motion.div>
        )}
        <span className="stage-caption">
          {resting
            ? "EVEN BIG IDEAS NEED A LITTLE REST."
            : "MOVE CLOSER. THEY NOTICE YOU."}
        </span>
        <span className="stage-corner">
          {resting ? "z z z" : "● 5 LITTLE LIVES"}
        </span>
      </div>
      <div className="room-controls">
        <div className="room-play-buttons">
          <button onClick={() => play("hello")}>
            <Icon name="heart" size={15} />
            Say hello
          </button>
          <button onClick={() => play("dance")}>
            <Icon name="spark" size={15} />
            Dance break
          </button>
          <button onClick={() => play("spark")}>
            <Icon name="arrow" size={15} />
            Pass a spark
          </button>
          <button onClick={() => play("surprise")}>
            <Icon name="eye" size={15} />
            Surprise them
          </button>
          <button
            aria-pressed={resting}
            onClick={() => {
              if (resting) play("wake");
              else {
                setResting(true);
                setCue(undefined);
                setAnnouncement("The squad is taking a little nap.");
              }
            }}
          >
            <Icon name={resting ? "spark" : "moon"} size={15} />
            {resting ? "Wake up" : "Nap time"}
          </button>
        </div>
        <p>
          {resting
            ? "Shh. Recharging the imagination."
            : "Click to connect · drag to play · move your cursor to say hi"}
        </p>
      </div>
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </section>
  );
}
