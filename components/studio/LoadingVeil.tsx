"use client";

import { useProgress } from "@react-three/drei";
import { AnimatePresence, motion } from "motion/react";
/** Covers the stage until the mannequin has mounted, then dissolves. */
export function LoadingVeil({ loaded }: { loaded: boolean }) {
  const { progress } = useProgress();

  return (
    <AnimatePresence>
      {!loaded && (
        <motion.div
          initial={false}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-stage"
          role="progressbar"
          aria-label="Loading mannequin"
          aria-valuenow={Math.round(progress)}
        >
          <div className="h-1 w-32 overflow-hidden rounded-full bg-fill-strong">
            <motion.div
              className="h-full rounded-full bg-label-2"
              initial={{ width: "8%" }}
              animate={{ width: `${Math.max(8, progress)}%` }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
