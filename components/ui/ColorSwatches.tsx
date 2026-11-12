"use client";

import { Check, Plus } from "lucide-react";
import { motion } from "motion/react";

/**
 * Round colour swatches, shared by Lighting and Settings so every colour
 * choice looks and behaves the same: a row of named colours, then a custom
 * one that opens the system colour picker.
 */

const DOT = "size-[26px]";
const RAINBOW = "conic-gradient(from 0deg, #ff5f57, #febc2e, #28c840, #3fd5c8, #0a84ff, #bf5af2, #ff5f57)";

export function isLightColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150;
}

function Tick({ light, chip }: { light: boolean; chip?: boolean }) {
  return (
    <motion.span
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", bounce: 0.35, duration: 0.3 }}
      className={
        chip
          ? "flex size-[17px] items-center justify-center rounded-full bg-white text-[#1d1d1f] shadow-[0_1px_2px_rgb(0_0_0/0.3)]"
          : light
            ? "text-[#1d1d1f]"
            : "text-white"
      }
    >
      <Check size={chip ? 11 : 12} strokeWidth={3} aria-hidden />
    </motion.span>
  );
}

/** A named colour. `fill` overrides the swatch's paint (e.g. a light/dark split). */
export function ColorDot({
  hex,
  name,
  on,
  onPick,
  fill,
}: {
  hex: string;
  name: string;
  on: boolean;
  onPick: () => void;
  fill?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={name}
      data-tip={name}
      onClick={onPick}
      className="rounded-full outline-none"
    >
      <span className={`swatch flex ${DOT} items-center justify-center rounded-full ${on ? "swatch-on" : ""}`} style={{ background: fill ?? hex }}>
        {on && <Tick light={isLightColor(hex)} chip={!!fill} />}
      </span>
    </button>
  );
}

/**
 * Any colour: a rainbow "+" until chosen, then the chosen colour itself.
 * The picker opens on `value` (the colour in use), so it starts from there.
 */
export function CustomColorDot({
  value,
  on,
  label,
  onChange,
}: {
  value: string;
  on: boolean;
  label: string;
  onChange: (hex: string) => void;
}) {
  return (
    <label
      data-tip="Custom color"
      className={`swatch swatch-picker relative flex ${DOT} cursor-pointer items-center justify-center rounded-full ${on ? "swatch-on" : ""}`}
      style={{ background: on ? value : RAINBOW }}
    >
      {on ? <Tick light={isLightColor(value)} /> : <Plus size={13} strokeWidth={3} className="text-white drop-shadow" aria-hidden />}
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Sized to the dot exactly: the browser's colour input is ~50px wide by default
        // and would stick out past the panel's edge (a stray horizontal scrollbar).
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </label>
  );
}
