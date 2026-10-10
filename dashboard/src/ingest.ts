import type { SwarmEvent } from "@swarm/shared/events";
import { drawFrame } from "./components/FrameCanvas";
import { direct } from "./director/director";
import { useDashboard } from "./store";
// The transport/replay adapter should validate incoming JSON, then call this typed entry point.
export function consumeEvent(
  event: SwarmEvent,
  options: { reduced: boolean; speed: number },
) {
  if (event.type === "frame") {
    drawFrame(event.data);
    return;
  }
  if (
    useDashboard
      .getState()
      .state.events.some((previous) => previous.id === event.id)
  )
    return;
  direct(event, options.reduced, options.speed);
  useDashboard.getState().dispatch(event);
}
