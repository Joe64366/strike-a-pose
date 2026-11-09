"use client";

import { Scan, ScanEye } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { springSnappy } from "@/lib/motion";

const LINGER_MS = 900;

/**
 * Bottom-right corner control for "just the pose".
 *
 * Normally a small glass button. With the interface hidden it vanishes too;
 * pointing at (or tapping) the corner brings it back so you can return.
 */
export function FocusToggle({ focus, onChange }: { focus: boolean; onChange: (focus: boolean) => void }) {
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A one-time reminder of the way back, right after hiding.
  useEffect(() => {
    if (!focus) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHint(true);
    const t = setTimeout(() => setHint(false), 2600);
    return () => {
      clearTimeout(t);
      setHint(false);
      setRevealed(false);
    };
  }, [focus]);

  const reveal = () => {
    clearTimeout(hideTimer.current);
    setRevealed(true);
  };
  const conceal = () => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setRevealed(false), LINGER_MS);
  };

  const visible = !focus || revealed;

  return (
    <>
      {/* Generous corner hot zone: only active while the interface is hidden. */}
      <div
        className={`fixed right-0 bottom-0 z-40 size-28 ${focus ? "" : "pointer-events-none"}`}
        onPointerEnter={focus ? reveal : undefined}
        onPointerLeave={focus ? conceal : undefined}
        onPointerDown={focus ? reveal : undefined}
      >
        <motion.button
          type="button"
          onClick={() => onChange(!focus)}
          onFocus={reveal}
          onBlur={focus ? conceal : undefined}
          aria-label={focus ? "Show interface" : "Hide interface"}
          aria-pressed={focus}
          data-tip={focus ? "Show interface" : "Hide interface"}
          data-tip-kbd={focus ? "Esc" : "H"}
          data-tip-side="left"
          initial={false}
          animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.85 }}
          transition={springSnappy}
          style={{ transformOrigin: "bottom right" }}
          className={`material pressable pointer-events-auto absolute right-3 bottom-[88px] flex size-10 items-center justify-center rounded-full text-label-2 hover:text-label sm:bottom-5 ${
            focus ? "max-sm:bottom-3" : ""
          }`}
        >
          {focus ? <ScanEye size={18} aria-hidden /> : <Scan size={18} aria-hidden />}
        </motion.button>
      </div>

      <AnimatePresence>
        {hint && (
          <motion.div
            key="focus-hint"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={springSnappy}
            role="status"
            className="tooltip pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full px-3.5 py-1.5 text-[12px] font-medium whitespace-nowrap"
          >
            Press <kbd className="tooltip-kbd">Esc</kbd> or point at the corner to bring the interface back
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
