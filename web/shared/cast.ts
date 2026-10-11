import type { BotId, Mood } from "./types";
// Exact live :root tokens from devday.openai.com, verified 2026-10-11 (IST).
// See docs/reference/brand-sources.md. Sky is a local sticker colour.
export const DEVDAY_COLORS = {
  purple: "#924FF7",
  green: "#04B84C",
  orange: "#FF8549",
  blue: "#006AFF",
} as const;

export const ORCHESTRATOR = {
  id: "master",
  name: "Onyx",
  color: "#262626",
  personality: "The calm conductor",
  line: "One thing at a time. All together.",
} as const;

export const CAST = [
  {
    id: "bot1",
    name: "Plum",
    color: DEVDAY_COLORS.purple,
    stickerColor: "#5B30A6",
    signature: "suspicious",
    personality: "The skeptic",
    line: "Trust, but double-check.",
  },
  {
    id: "bot2",
    name: "Lime",
    color: DEVDAY_COLORS.green,
    stickerColor: "#58A81A",
    signature: "found",
    personality: "The finder",
    line: "There’s always a little more to discover.",
  },
  {
    id: "bot3",
    name: "Tango",
    color: DEVDAY_COLORS.orange,
    stickerColor: "#DE5A26",
    signature: "bored",
    personality: "The patient one",
    line: "Good things take a little time.",
  },
  {
    id: "bot4",
    name: "Blu",
    color: DEVDAY_COLORS.blue,
    stickerColor: "#2E61C8",
    signature: "focused",
    personality: "The doer",
    line: "Less talking. More doing.",
  },
  {
    id: "bot5",
    name: "Sky",
    color: "#A6D8F5",
    stickerColor: "#A6D8F5",
    signature: "happy",
    personality: "The cheerful one",
    line: "A little optimism goes a long way.",
  },
] as const satisfies readonly {
  id: BotId;
  name: string;
  color: string;
  stickerColor: string;
  signature: Mood;
  personality: string;
  line: string;
}[];
export const castFor = (id: BotId) => CAST.find((bot) => bot.id === id)!;
export const CURSOR_GLIDE_MS = 350;
export const FRAME_FPS = 8;
