import type { ToolName, BotStatus } from "@swarm/shared/types";
export const ICONS = {
  pointer: "M5 3l14 7-7 2-3 7-4-16Z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  play: "M8 5l11 7-11 7Z",
  pause: "M8 5v14M16 5v14",
  stop: "M6 6h12v12H6Z",
  arrow: "M5 12h14M14 7l5 5-5 5",
  back: "M19 12H5M10 7l-5 5 5 5",
  check: "M5 12l4 4L19 6",
  x: "M6 6l12 12M18 6 6 18",
  spark: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9Z",
  ask: "M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17v.1",
  alert: "M12 5v9M12 18v.1",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5ZM12 14v3",
  hand: "M8 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v9c0 5-3 7-7 7-2 0-3-1-5-3l-5-5q-1-2 1-3l4 3",
  bug: "M8 9h8v7a4 4 0 0 1-8 0ZM9 6l-2-2M15 6l2-2M4 11h4M16 11h4M4 17h4M16 17h4M12 9v10",
  retry: "M19 10a7 7 0 1 0-1 8M19 4v6h-6",
  mail: "M3 5h18v14H3ZM3 6l9 7 9-7",
  battery: "M3 7h16v10H3ZM21 10v4",
  dots: "M5 12h.1M12 12h.1M19 12h.1",
  moon: "M19 16A8 8 0 0 1 8 5a8 8 0 1 0 11 11Z",
  heart: "M12 20 4 12C-1 6 7 1 12 7c5-6 13-1 8 5Z",
  globe:
    "M3 12h18M12 3c-5 4-5 14 0 18M12 3c5 4 5 14 0 18M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
  keyboard: "M3 6h18v13H3ZM6 10h1M11 10h1M16 10h1M7 15h10",
  list: "M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1",
  scroll: "M8 3v18M4 7l4-4 4 4M16 3v18M12 17l4 4 4-4",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  clock: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
  note: "M4 3h16v12l-6 6H4ZM14 21v-6h6M8 8h8M8 12h5",
  plane: "M3 10 21 3l-7 18-3-8-8-3ZM11 13 21 3",
  grid: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
  sliders: "M4 7h16M4 17h16M8 4v6M16 14v6",
  volume: "M3 9h4l5-5v16l-5-5H3ZM16 8q6 4 0 8",
  mute: "M3 9h4l5-5v16l-5-5H3ZM16 9l6 6M22 9l-6 6",
  code: "M8 6l-6 6 6 6M16 6l6 6-6 6M14 3l-4 18",
  camera: "M3 7h4l2-3h6l2 3h4v14H3ZM12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  flag: "M5 21V3h14l-3 5 3 5H5",
  scan: "M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5",
  text: "M4 6h16M4 12h16M4 18h10",
  key: "M4 5h16v14H4ZM8 10v4h8",
} as const;
export type IconName = keyof typeof ICONS;
export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
export const TOOL_META: Record<ToolName, [IconName, string]> = {
  open: ["globe", "Opening page"],
  click: ["pointer", "Clicking"],
  type: ["keyboard", "Typing"],
  select: ["list", "Choosing"],
  press: ["key", "Pressing key"],
  scroll: ["scroll", "Scrolling"],
  back: ["back", "Going back"],
  wait: ["clock", "Waiting"],
  list_elements: ["list", "Reading page"],
  read_text: ["text", "Reading"],
  look: ["eye", "Looking closely"],
  screenshot: ["camera", "Capturing"],
  post_to_board: ["note", "Sharing a find"],
  read_board: ["grid", "Checking the board"],
  ask_user: ["ask", "Asking you"],
  wait_for_user: ["clock", "Waiting for you"],
  finish: ["flag", "Finishing up"],
  report_bug: ["bug", "Reporting a bug"],
  get_errors: ["alert", "Checking errors"],
  check_screen: ["scan", "Checking screen"],
  submit_plan: ["list", "Planning"],
  get_bot_results: ["note", "Collecting results"],
  submit_final: ["flag", "Merging results"],
};
export const STATUS_META: Record<BotStatus, [IconName, string]> = {
  pending: ["clock", "Waiting"],
  starting: ["spark", "Starting"],
  working: ["pointer", "Working"],
  thinking: ["dots", "Thinking"],
  waiting_user: ["ask", "Needs you"],
  paused: ["hand", "Paused"],
  finished: ["check", "Done"],
  failed: ["x", "Failed"],
  stopped: ["stop", "Stopped"],
  out_of_budget: ["battery", "Out of budget"],
};
