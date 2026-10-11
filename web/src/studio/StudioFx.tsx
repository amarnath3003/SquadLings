import { useEffect, useState } from "react";
import { EffectsCanvas } from "./effects/EffectsCanvas";
import { Flights } from "./effects/Flights";
import { installStudioAdapter } from "./adapter";
import "../styles/characters-live.css";

// The studio's page-wide layers: sparkles / confetti / smoke (EffectsCanvas) and the flights (characters
// flying out of Onyx, notes to the board, reports to the Master). Mount once, anywhere (they are fixed,
// full-screen and click-through). Importing this module also starts the event adapter.
installStudioAdapter();

// As in the studio: CSS loops pause while the tab is hidden (html[data-hidden="true"]).
const markHidden = () => (document.documentElement.dataset.hidden = String(document.hidden));
markHidden();
document.addEventListener("visibilitychange", markHidden);

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return reduced;
}

const noCount = () => {};

export function StudioFx() {
  const reduced = useReducedMotion();
  return (
    <>
      <EffectsCanvas reduced={reduced} onCount={noCount} />
      <Flights reduced={reduced} speed={1} />
    </>
  );
}
