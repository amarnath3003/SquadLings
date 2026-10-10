import { memo } from "react";
import { motion } from "motion/react";
import { Icon } from "./icons";
// Official DevDay favicon, kept byte-for-byte as fetched. See the asset/source notes.
export const MasterLogo = memo(function MasterLogo({
  state = "idle",
  reduced = false,
  size = 48,
  tick = 0,
  shared = false,
  ringColor = "var(--ink)",
}: {
  state?: string;
  reduced?: boolean;
  size?: number;
  tick?: number;
  shared?: boolean;
  ringColor?: string;
}) {
  const spinning = ["planning", "merging"].includes(state);
  return (
    <motion.div
      layoutId={shared ? "master-logo" : undefined}
      className={`master-logo master-${state}`}
      style={{ width: size, height: size }}
    >
      {!reduced &&
        (["classifying", "needs you"].includes(state) || tick > 0) && (
          <motion.i
            key={`${state}-${tick}`}
            className="master-ring"
            style={{ borderColor: ringColor }}
            initial={{ opacity: 0.4, scale: 1 }}
            animate={{ opacity: 0, scale: 1.55 }}
            transition={{
              duration: 1,
              repeat: ["classifying", "needs you"].includes(state)
                ? Infinity
                : 0,
            }}
          />
        )}
      <motion.img
        src="/openai-devday-icon.svg"
        width={size}
        height={size}
        alt={`Master: ${state}`}
        animate={{
          rotate: reduced ? 0 : spinning ? [0, 360] : tick * 60,
          scale: reduced ? 1 : state === "idle" ? [1, 1.025, 1] : 1,
          opacity: state === "idle" || state === "failed" ? 0.55 : 1,
        }}
        transition={
          spinning
            ? {
                duration: state === "merging" ? 0.8 : 1.2,
                repeat: Infinity,
                ease: "linear",
              }
            : {
                duration: state === "idle" ? 4 : 0.3,
                repeat: state === "idle" ? Infinity : 0,
              }
        }
      />
      {state === "needs you" && (
        <span className="master-ask">
          <Icon name="ask" size={14} />
        </span>
      )}
    </motion.div>
  );
});
