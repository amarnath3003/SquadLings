import { CAST } from "@swarm/shared/cast";
import { useDashboard } from "../store";
export function Timeline() {
  const events = useDashboard((state) => state.state.events);
  return (
    <section className="timeline">
      <div className="section-label">
        <span>THE LITTLE THINGS, AS THEY HAPPEN</span>
        <span>{events.length} events</span>
      </div>
      {events.length ? (
        <div className="timeline-events">
          {events
            .slice(-8)
            .reverse()
            .map((event) => (
              <div key={event.id}>
                <span>{((event.ts - 1000) / 1000).toFixed(1)}s</span>
                <strong>
                  {event.botId
                    ? CAST.find((bot) => bot.id === event.botId)?.name
                    : "Master"}
                </strong>
                <code>{event.type}</code>
              </div>
            ))}
        </div>
      ) : (
        <p className="muted">
          Events will show up here when the squad gets going.
        </p>
      )}
    </section>
  );
}
