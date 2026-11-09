"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { springSnappy } from "@/lib/motion";

/** Apple-style segmented control: a white "lozenge" glides to the choice. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex h-8 rounded-[9px] bg-fill p-[2px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`pressable relative flex-1 rounded-[7px] text-[12px] font-medium ${on ? "text-label" : "text-label-2 hover:text-label"}`}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={springSnappy}
                className="absolute inset-0 rounded-[7px] bg-white shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.06)] dark:bg-[rgb(99_99_102)]"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** iOS-style switch. The knob springs across; the track takes the accent. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ${on ? "bg-accent" : "bg-fill-strong"}`}
    >
      <motion.span
        initial={false}
        animate={{ x: on ? 16 : 0 }}
        transition={{ type: "spring", bounce: 0.15, duration: 0.3 }}
        className="absolute top-[2px] left-[2px] size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)]"
      />
    </button>
  );
}
