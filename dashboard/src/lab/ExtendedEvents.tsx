import { useState } from "react";
import type { BotId, BotStatus } from "@swarm/shared/types";
import { useDashboard } from "../store";
import { STATUS_META } from "../characters/icons";
import type { LabController } from "./CharacterLab";
export function ExtendedEvents({
  id,
  lab,
  ensure,
}: {
  id: BotId;
  lab: LabController;
  ensure: () => void;
}) {
  const [preset, setPreset] = useState("block");
  const emit = () => {
    ensure();
    const now = useDashboard.getState().state.now,
      fire = lab.fire;
    switch (preset) {
      case "block":
        fire(
          "safety.blocked",
          { botId: id, code: "LAB_BLOCK", reason: "Simulated safety block." },
          id,
        );
        break;
      case "gate":
        fire(
          "gate.checked",
          {
            botId: id,
            action: "Example click",
            level: "confirm",
            via: "lab",
            ms: 0,
          },
          id,
        );
        break;
      case "loading":
        fire("page.loading", { botId: id, loading: true }, id);
        break;
      case "loaded":
        fire("page.loading", { botId: id, loading: false }, id);
        break;
      case "dialog":
        fire(
          "page.dialog",
          { botId: id, kind: "alert", message: "Simulated page dialog." },
          id,
        );
        break;
      case "login":
        fire(
          "approval.requested",
          {
            approval: {
              id: `login-${now}`,
              runId: "lab-manual",
              botId: id,
              kind: "login",
              title: "Example sign-in request",
              detail:
                "No browser is connected. This only previews the login reaction.",
              status: "pending",
              createdAt: now,
              expiresAt: now + 300000,
            },
          },
          id,
        );
        break;
      case "takeover":
        fire("takeover.started", { botId: id }, id);
        break;
      case "resume":
        fire("takeover.ended", { botId: id, durationMs: 1000 }, id);
        break;
      case "mail":
        fire("board.delivered", { botId: id, noteIds: ["example-note"] }, id);
        break;
      case "bug":
        fire(
          "qa.bug",
          {
            bug: {
              id: `bug-${now}`,
              runId: "lab-manual",
              botId: id,
              persona: "Lab",
              title: "Example layout issue",
              category: "layout",
              severity: 2,
              steps: ["Inspect this simulated page"],
              expected: "Example content fits",
              actual: "Example content overlaps",
              url: "https://lab.example",
              screenshot: "",
              createdAt: now,
            },
          },
          id,
        );
        break;
      case "failed":
        fire(
          "bot.error",
          {
            botId: id,
            message: "Simulated terminal failure.",
            retryable: false,
          },
          id,
        );
        break;
    }
  };
  return (
    <details className="extended-events">
      <summary>More reactions & states</summary>
      <label className="field-label" htmlFor="event-preset">
        Event preset
      </label>
      <select
        id="event-preset"
        value={preset}
        onChange={(event) => setPreset(event.target.value)}
      >
        {[
          ["block", "Safety block"],
          ["gate", "Confirm gate"],
          ["loading", "Start page loading"],
          ["loaded", "End page loading"],
          ["dialog", "Page dialog"],
          ["login", "Login request"],
          ["takeover", "Pause preview"],
          ["resume", "Resume preview"],
          ["mail", "Receive note"],
          ["bug", "Report bug"],
          ["failed", "Terminal failure"],
        ].map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button className="outline-button" data-audio="off" onClick={emit}>
        Send example event
      </button>
      <label className="field-label" htmlFor="status-preset">
        Status preview
      </label>
      <select
        id="status-preset"
        defaultValue=""
        onChange={(event) => {
          if (!event.target.value) return;
          ensure();
          lab.fire(
            "bot.status",
            { botId: id, status: event.target.value as BotStatus },
            id,
          );
        }}
      >
        <option value="" disabled>
          Choose a status
        </option>
        {Object.entries(STATUS_META).map(([key, [, label]]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </details>
  );
}
