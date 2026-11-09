"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { springSnappy } from "@/lib/motion";
import type { PoseEntry } from "@/lib/poses";

const DISMISS_AFTER_MS = 5000;

/** Deleting is instant and forgiving: no confirm dialog, just Undo. */
export function UndoToast({
  entry,
  onUndo,
  onDismiss,
}: {
  entry: PoseEntry | null;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!entry) return;
    const t = setTimeout(onDismiss, DISMISS_AFTER_MS);
    return () => clearTimeout(t);
  }, [entry, onDismiss]);

  return (
    <AnimatePresence mode="popLayout">
      {entry && (
        <motion.div
          key={entry.id}
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={springSnappy}
          role="status"
          className="material pointer-events-auto flex h-10 max-w-full items-center gap-3 rounded-full pr-1.5 pl-4 text-[13px]"
        >
          <span className="min-w-0 truncate text-label-2">
            Deleted <span className="font-medium text-label">“{entry.title}”</span>
          </span>
          <button
            type="button"
            onClick={onUndo}
            className="pressable h-7 shrink-0 rounded-full px-3 font-semibold text-accent hover:bg-accent-fill"
          >
            Undo
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
