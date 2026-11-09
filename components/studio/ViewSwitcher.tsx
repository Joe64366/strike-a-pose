"use client";

import { motion } from "motion/react";
import { springSnappy } from "@/lib/motion";
import { VIEW_ORDER, VIEW_PRESETS, type ViewPreset } from "@/lib/views";

/**
 * Segmented control for camera angles. `value` goes null once the user
 * orbits by hand, so no segment claims a view that isn't on screen.
 */
export function ViewSwitcher({
  value,
  onChange,
}: {
  value: ViewPreset | null;
  onChange: (preset: ViewPreset) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Camera angle"
      className="material pointer-events-auto flex h-9 items-center rounded-full p-[3px]"
    >
      {VIEW_ORDER.map((preset, i) => {
        const selected = value === preset;
        return (
          <button
            key={preset}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={VIEW_PRESETS[preset].name}
            data-tip={VIEW_PRESETS[preset].name}
            data-tip-kbd={String(i + 1)}
            onClick={() => onChange(preset)}
            className={`pressable relative h-full min-w-11 rounded-full px-3 text-[13px] font-medium ${
              selected ? "text-label" : "text-label-2 hover:text-label"
            }`}
          >
            {selected && (
              <motion.span
                layoutId="view-indicator"
                transition={springSnappy}
                className="absolute inset-0 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.06)] dark:bg-fill-strong"
              />
            )}
            <span className="relative">{VIEW_PRESETS[preset].label}</span>
          </button>
        );
      })}
    </div>
  );
}
