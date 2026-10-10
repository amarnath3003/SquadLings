import type { SwarmEvent } from "@swarm/shared/events";
import { drawFrame } from "./components/FrameCanvas";
import { direct } from "./director/director";
import { useDashboard } from "./store";
import { handleAudioEvent } from "./effects/audio/events";
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
  handleAudioEvent(event, {
    previous: useDashboard.getState().state,
    speed: options.speed,
  });
  direct(event, options.reduced, options.speed);
  useDashboard.getState().dispatch(event);
}
