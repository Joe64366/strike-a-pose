"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMediaQuery } from "@/lib/useColorScheme";

/** Teaches the camera once; disappears the first time it's used. */
export function ControlsHint({ visible }: { visible: boolean }) {
  const touch = useMediaQuery("(pointer: coarse)");
  const parts = touch
    ? ["Drag the body to pose", "Drag around it to orbit"]
    : ["Drag the body to pose", "Drag around it to orbit", "Right-drag to pan"];

  return (
    <AnimatePresence>
      {visible && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.6 } }}
          exit={{ opacity: 0 }}
          className="text-[12px] font-medium tracking-[0.01em] text-label-2"
        >
          {parts.join("  ·  ")}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
