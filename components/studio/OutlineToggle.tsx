"use client";

import { motion } from "motion/react";
import { springSnappy } from "@/lib/motion";

/** Toggles the cel-shaded contour around the mannequin. */
export function OutlineToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const stroke = {
    initial: false as const,
    animate: { strokeWidth: on ? 2.1 : 1.2, opacity: on ? 1 : 0.5 },
    transition: springSnappy,
  };

  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label="Outline"
      data-tip={on ? "Hide outline" : "Show outline"}
      data-tip-kbd="O"
      className={`material pressable pointer-events-auto flex size-9 items-center justify-center rounded-full ${
        on ? "text-label" : "text-label-3 hover:text-label-2"
      }`}
    >
      {/* A little figure whose contour thickens when the outline is on:
          the icon shows what the toggle does. */}
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden>
        <motion.circle cx="10" cy="5.2" r="2.6" fill="currentColor" fillOpacity={0.16} {...stroke} />
        <motion.path
          d="M5.6 17.6v-4.9a4.4 4.4 0 0 1 8.8 0v4.9"
          fill="currentColor"
          fillOpacity={0.16}
          strokeLinecap="round"
          strokeLinejoin="round"
          {...stroke}
        />
      </svg>
    </button>
  );
}
