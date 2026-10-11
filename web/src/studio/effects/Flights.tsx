import { useEffect } from "react";
import { create } from "zustand";
import { motion } from "motion/react";
import { arc } from "../director/geometry";
import type { Point } from "../mood/attention";
import type { BotId } from "@swarm/shared/types";
import { Icon, type IconName } from "../characters/icons";
import { BotCharacter } from "../characters/BotCharacter";
import { castFor } from "@swarm/shared/cast";

interface Flight {
  id: string;
  botId: BotId;
  from: Point;
  to: Point;
  color: string;
  icon?: IconName;
  kind?: "report" | "board" | "plane" | "character";
  duration?: number;
  delay?: number;
  count?: number;
  onLand?: () => void;
}
const useFlights = create<{
  items: Flight[];
  add: (f: Flight) => void;
  remove: (id: string) => void;
  clear: () => void;
}>((set) => ({
  items: [],
  add: (flight) =>
    set((state) => {
      const previous = state.items.find(
        (f) => f.botId === flight.botId && f.kind === flight.kind,
      );
      const rest = state.items.filter((f) => f !== previous);
      return {
        items: [
          ...rest,
          { ...flight, count: (previous?.count ?? 0) + 1 },
        ].slice(-6),
      };
    }),
  remove: (id) =>
    set((state) => ({ items: state.items.filter((f) => f.id !== id) })),
  clear: () => set({ items: [] }),
}));
export const fly = (flight: Flight) => useFlights.getState().add(flight);
export const clearFlights = () => useFlights.getState().clear();
export function Flights({
  reduced,
  speed,
}: {
  reduced: boolean;
  speed: number;
}) {
  const items = useFlights((state) => state.items);
  useEffect(() => {
    if (reduced && items.length) {
      items.forEach((f) => f.onLand?.());
      clearFlights();
    }
  }, [reduced, items]);
  return (
    <div className="flights-layer" aria-hidden="true">
      {!reduced &&
        items.map((flight) => {
          const character = flight.kind === "character";
          const offset = character ? 22 : 11;
          const points = arc(
            { x: flight.from.x - offset, y: flight.from.y - offset },
            { x: flight.to.x - offset, y: flight.to.y - offset },
          );
          return (
            <motion.div
              key={flight.id}
              className={`flight ${character ? "character-flight" : ""}`}
              style={{ background: character ? "transparent" : flight.color }}
              initial={{ x: points[0].x, y: points[0].y, opacity: 1, scale: 1 }}
              animate={{
                x: points.map((p) => p.x),
                y: points.map((p) => p.y),
                scale: [1, character ? 0.85 : 0.6],
              }}
              transition={{
                duration: (flight.duration ?? 600) / 1000 / speed,
                delay: (flight.delay ?? 0) / 1000 / speed,
                ease: "easeInOut",
              }}
              onAnimationComplete={() => {
                useFlights.getState().remove(flight.id);
                flight.onLand?.();
              }}
            >
              {character ? (
                <BotCharacter
                  id={flight.botId}
                  mood={castFor(flight.botId).signature}
                  size={44}
                  reduced
                />
              ) : (
                <Icon name={flight.icon ?? "spark"} size={14} />
              )}
              {(flight.count ?? 0) > 1 && (
                <small className="flight-count">×{flight.count}</small>
              )}
            </motion.div>
          );
        })}
    </div>
  );
}
