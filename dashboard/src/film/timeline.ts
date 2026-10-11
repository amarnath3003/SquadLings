import type { ActivityName } from "../characters/useBotActor";

export const DURATION = 52;
export const TASK = "Plan a weekend in Kochi for our team.";
export const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const ease = (n: number) => {
  const p = clamp(n);
  return p * p * (3 - 2 * p);
};
export const workers = [
  {
    role: "Places to stay",
    page: "Stay shortlist",
    lines: [
      "Fort Kochi · walkable",
      "Space for the whole team",
      "Three stays compared",
    ],
    x: 80,
    y: 150,
    report: 19,
    done: 25,
  },
  {
    role: "Things to do",
    page: "Weekend discoveries",
    lines: [
      "Art lanes & waterfront",
      "A sunset by the sea",
      "Rainy-day backup added",
    ],
    x: 1120,
    y: 150,
    report: 20.5,
    done: 29,
  },
  {
    role: "Food & coffee",
    page: "Good food, together",
    lines: [
      "Local cafés shortlisted",
      "Vegetarian options checked",
      "A shared dinner spot",
    ],
    x: 80,
    y: 540,
    report: 22,
    done: 26.5,
  },
  {
    role: "Getting around",
    page: "A simpler route",
    lines: [
      "Arrival → Fort Kochi",
      "Stops grouped by area",
      "Less travel. More time.",
    ],
    x: 1120,
    y: 540,
    report: 23,
    done: 30,
  },
  {
    role: "Bring it together",
    page: "The team itinerary",
    lines: [
      "Two days, one shared plan",
      "Time to explore & unwind",
      "Everyone on the same page",
    ],
    x: 600,
    y: 590,
    report: 24,
    done: 30.5,
  },
] as const;

export function sceneAt(t: number) {
  if (t < 6) return "task";
  if (t < 10) return "squad";
  if (t < 14) return "launch";
  if (t < 31) return "work";
  if (t < 36) return "review";
  if (t < 37) return "deliver";
  if (t < 42) return "results";
  if (t < 47) return "return";
  return "sleep";
}

export function activityAt(t: number, index: number): ActivityName {
  const worker = workers[index];
  if (t >= worker.done) return "finish";
  if (index === 1 && t >= 24 && t < 26) return "ask";
  if (t >= worker.report && t < worker.report + 1.6) return "found";
  if (t >= worker.report + 1.6) return index === 4 ? "output" : "type";
  return (["read", "scroll", "type", "read", "output"] as const)[
    (index + Math.floor(Math.max(0, t - 15) / 2.5)) % 5
  ];
}
