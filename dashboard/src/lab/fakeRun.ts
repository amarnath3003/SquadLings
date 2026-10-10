import { CAST, CURSOR_GLIDE_MS } from "@swarm/shared/cast";
import type { EventData, EventType, SwarmEvent } from "@swarm/shared/events";
import type { Approval, BotId, ToolName } from "@swarm/shared/types";
import { hash, mulberry32 } from "../characters/personality";
export const ROLES = {
  trip_planner: ["Flights", "Hotels", "Activities", "Transport", "Budget"],
  qa_swarm: [
    "First-timer",
    "Keyboard-only",
    "Mobile",
    "Breaker",
    "Role checker",
  ],
  auto: [
    "Master decides",
    "Master decides",
    "Master decides",
    "Master decides",
    "Master decides",
  ],
};
export type TemplateId = keyof typeof ROLES;
function eventId(ts: number, seed: number, seq: number) {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const encode = (n: number, length: number) => {
    let s = "";
    for (let i = 0; i < length; i++) {
      s = alphabet[n % 32] + s;
      n = Math.floor(n / 32);
    }
    return s;
  };
  return encode(ts, 10) + encode(seed, 8) + encode(seq, 8);
}
export function makeEvent<T extends EventType>(
  type: T,
  data: EventData[T],
  ts: number,
  seq: number,
  botId?: BotId,
  runId = "lab-manual",
): SwarmEvent {
  const source =
    type.startsWith("cursor.") || type.startsWith("page.")
      ? "browser"
      : type.startsWith("board.")
        ? "board"
        : type.startsWith("approval.") || type.startsWith("safety.")
          ? "safety"
          : type.startsWith("master.")
            ? "master"
            : botId
              ? "bot"
              : "orchestrator";
  return {
    id: eventId(ts, hash(runId), seq),
    runId,
    seq,
    ts,
    source,
    botId,
    type,
    data,
  } as SwarmEvent;
}
export function fakeRun(
  seed: string,
  botCount: number,
  template: TemplateId = "trip_planner",
  mobile = false,
  assignments = botCount,
): SwarmEvent[] {
  if (
    !Number.isInteger(botCount) ||
    botCount < 1 ||
    botCount > 5 ||
    !Number.isInteger(assignments) ||
    assignments < 1 ||
    assignments > botCount
  )
    throw new Error("Squad size must be 1–5, with at least one assigned bot.");
  const random = mulberry32(hash(seed)),
    items: SwarmEvent[] = [],
    runId = `lab-${seed}`;
  let seq = 0;
  const add = <T extends EventType>(
    ts: number,
    type: T,
    data: EventData[T],
    botId?: BotId,
  ) => items.push(makeEvent(type, data, ts, ++seq, botId, runId));
  add(1000, "run.created", {
    request: "A little teamwork goes a long way.",
    templateId: template,
    options: { maxBots: botCount },
  });
  add(1100, "run.status", { status: "classifying" });
  add(1700, "run.template_selected", { templateId: template, confidence: 1 });
  add(1800, "run.status", { status: "planning" });
  add(1800, "master.status", { status: "planning" });
  add(2300, "master.text", {
    text: "Giving everyone a little piece of the puzzle.",
  });
  add(2800, "plan.ready", {
    plan: {
      title: "A little teamwork goes a long way.",
      assumptions: ["This is a simulated Character Lab run."],
      assignments: CAST.slice(0, assignments).map((_, i) => ({
        roleId: `role${i}`,
        goal: `Explore the ${ROLES[template][i].toLowerCase()} example`,
        successCriteria: ["Share an example finding"],
      })),
    },
  });
  for (let i = 0; i < assignments; i++) {
    const bot = CAST[i],
      id = bot.id,
      start = 3100 + i * 300,
      phone = mobile && i === 2;
    const w = phone ? 390 : 1280,
      h = phone ? 844 : 800;
    add(
      start,
      "bot.spawned",
      {
        botId: id,
        name: bot.name,
        color: bot.color,
        roleId: `role${i}`,
        roleName: ROLES[template][i],
        goal: "Explore this simulated page.",
        viewport: { width: w, height: h },
        device: phone ? "mobile" : "desktop",
      },
      id,
    );
    add(start + 800, "bot.status", { botId: id, status: "thinking" }, id);
    add(
      start + 900,
      "page.navigated",
      {
        botId: id,
        url: `https://lab.example/${ROLES[template][i].toLowerCase()}`,
        title: "Simulated browser",
      },
      id,
    );
    for (let step = 0; step < 4; step++) {
      const time = start + 1400 + step * 3000,
        tool: ToolName =
          step === 0
            ? "list_elements"
            : step === 2
              ? "type"
              : step === 3
                ? "scroll"
                : "click";
      const x = Math.round(w * (0.16 + random() * 0.65)),
        y = Math.round(h * (0.2 + random() * 0.55)),
        callId = `${id}-${step}`;
      add(time, "tool.called", { botId: id, callId, tool, args: {} }, id);
      add(
        time + 100,
        "bot.caption",
        {
          botId: id,
          text:
            step === 0
              ? "Getting a feel for the page."
              : step === 1
                ? "That one looks promising."
                : step === 2
                  ? "Adding a little detail."
                  : "Taking a closer look.",
        },
        id,
      );
      add(
        time + 200,
        "cursor.move",
        {
          botId: id,
          x,
          y,
          box: { x: x - 45, y: y - 16, width: 90, height: 32 },
          durationMs: CURSOR_GLIDE_MS,
        },
        id,
      );
      if (tool === "click")
        add(
          time + 200 + CURSOR_GLIDE_MS,
          "cursor.click",
          { botId: id, x, y },
          id,
        );
      if (tool === "type")
        add(
          time + 600,
          "cursor.type",
          { botId: id, x, y, length: 8, masked: true },
          id,
        );
      if (tool === "scroll")
        add(time + 600, "cursor.scroll", { botId: id, dy: 240 }, id);
      add(
        time + 1600,
        "tool.result",
        { callId, ok: true, summary: "Example step complete.", ms: 1600 },
        id,
      );
      add(time + 1700, "bot.status", { botId: id, status: "thinking" }, id);
    }
    const noteTime = start + 7800;
    add(
      noteTime,
      "board.posted",
      {
        note: {
          id: `note-${id}`,
          seq: i + 1,
          runId,
          from: id,
          to: "all",
          type: "tip",
          title: `${bot.name} found an example worth sharing`,
          data: { simulated: true },
          createdAt: noteTime,
        },
      },
      id,
    );
    if (i > 0)
      add(
        noteTime + 1000,
        "board.delivered",
        { botId: id, noteIds: ["note-bot1"] },
        id,
      );
    if (i === 0) {
      add(start + 4300, "page.loading", { botId: id, loading: true }, id);
      add(start + 5600, "page.loading", { botId: id, loading: false }, id);
    }
    if (i === 1) {
      const approval: Approval = {
        id: "lab-approval",
        runId,
        botId: id,
        kind: "confirm",
        title: "Try this example option?",
        detail: "This is a simulated approval. No website will be changed.",
        status: "pending",
        createdAt: start + 12000,
        expiresAt: start + 312000,
      };
      add(start + 12000, "approval.requested", { approval }, id);
      add(
        start + 14900,
        "approval.resolved",
        { approvalId: approval.id, status: "approved", by: "lab-script" },
        id,
      );
    }
    if (i === 2) {
      add(
        start + 12000,
        "bot.error",
        {
          botId: id,
          message: "Example page timed out. Trying again.",
          retryable: true,
        },
        id,
      );
      add(
        start + 13500,
        "tool.called",
        { botId: id, callId: "retry", tool: "open", args: {} },
        id,
      );
      add(
        start + 14600,
        "tool.result",
        {
          callId: "retry",
          ok: true,
          summary: "Example page recovered.",
          ms: 1100,
        },
        id,
      );
    }
    add(
      start + 17000,
      "bot.result",
      {
        botId: id,
        result: { simulated: true },
        summary: `${bot.name}’s example report is ready.`,
      },
      id,
    );
  }
  add(4700, "run.status", { status: "running" });
  add(4700, "master.status", { status: "monitoring" });
  const end = 22000 + botCount * 300;
  add(end, "run.status", { status: "merging" });
  add(end, "master.status", { status: "merging" });
  add(end + 1600, "run.result", {
    result: {
      runId,
      templateId: template,
      title: "Better together.",
      result: { simulated: true },
      markdown: "The simulated squad has finished its example run.",
      gaps: [],
    },
  });
  add(end + 1700, "run.ended", {
    status: "completed",
    durationMs: end + 700,
    costUSD: 0,
  });
  return items
    .sort((a, b) => a.ts - b.ts || a.seq - b.seq)
    .map((e, i) => ({ ...e, seq: i + 1 }));
}
