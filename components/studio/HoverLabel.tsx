"use client";

import { AnimatePresence, motion } from "motion/react";
import { JOINT_BY_ID } from "@/lib/joints";
import { usePoseStore } from "@/lib/poseStore";

/** Names the body part under the pointer, so you know what a drag will move. */
export function HoverLabel() {
  const hovered = usePoseStore((s) => s.hovered);
  const at = usePoseStore((s) => s.hoverAt);
  const dragging = usePoseStore((s) => s.dragging);
  const show = hovered && at && !dragging;

  return (
    <div
      className="pointer-events-none fixed top-0 left-0 z-40"
      style={at ? { transform: `translate(${at.x + 14}px, ${at.y + 18}px)` } : undefined}
    >
      <AnimatePresence>
        {show && (
          <motion.div
            key={hovered}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.12 }}
            style={{ transformOrigin: "left top" }}
            className="tooltip absolute rounded-[8px] px-2 py-[3px] text-[12px] font-medium whitespace-nowrap"
          >
            {JOINT_BY_ID[hovered].label}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
