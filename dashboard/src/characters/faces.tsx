import type { Mood } from "@swarm/shared/types";
const S = {
  stroke: "#111",
  strokeWidth: 3.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  fill: "none",
} as const;
export const FACES: Record<Mood, React.ReactNode> = {
  calm: (
    <>
      <circle cx="22" cy="31" r="2.6" fill="#111" />
      <circle cx="42" cy="31" r="2.6" fill="#111" />
    </>
  ),
  curious: (
    <>
      <circle cx="22" cy="30" r="5" {...S} />
      <circle cx="42" cy="30" r="5" {...S} />
    </>
  ),
  focused: (
    <>
      <polyline points="17,25 25,30 17,35" {...S} />
      <polyline points="47,25 39,30 47,35" {...S} />
    </>
  ),
  bored: <path d="M17 27h10M17 33h10M37 27h10M37 33h10" {...S} />,
  suspicious: <path d="M16 28h11v5M37 28h11v5" {...S} />,
  found: <path d="M17 30h10M22 25v10M37 30h10M42 25v10" {...S} />,
  worried: <path d="M17 34L27 26M37 26L47 34" {...S} />,
  failed: <path d="M18 26l8 8M26 26l-8 8M38 26l8 8M46 26l-8 8" {...S} />,
  happy: (
    <>
      <polyline points="17,33 22,26 27,33" {...S} />
      <polyline points="37,33 42,26 47,33" {...S} />
    </>
  ),
  content: <path d="M17 33Q22 22 27 33M37 33Q42 22 47 33" {...S} />,
};
export const MOODS = Object.keys(FACES) as Mood[];
