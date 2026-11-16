"use client";

import { Check, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * Round colour swatches, shared by Lighting and Settings so every colour
 * choice looks and behaves the same: a row of named colours, then a custom
 * one that opens a colour picker (InlineColorPicker) beneath the row.
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
 * It toggles an InlineColorPicker that the row renders beneath itself (the
 * browser's own colour dialog is a different window on every browser and OS,
 * and on Windows a dated one).
 */
export function CustomColorDot({
  value,
  on,
  open,
  label,
  onToggle,
}: {
  value: string;
  on: boolean;
  open: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      data-tip="Custom color"
      onClick={onToggle}
      className="rounded-full outline-none"
    >
      <span
        className={`swatch flex ${DOT} items-center justify-center rounded-full ${on || open ? "swatch-on" : ""}`}
        style={{ background: on ? value : RAINBOW }}
      >
        {on ? <Tick light={isLightColor(value)} /> : <Plus size={13} strokeWidth={3} className="text-white drop-shadow" aria-hidden />}
      </span>
    </button>
  );
}

type Hsv = { h: number; s: number; v: number };

function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: h * 60, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`;
}

/** "#abc", "abc", "#aabbcc" or "aabbcc" to "#aabbcc"; anything else to null. */
function parseHex(text: string): string | null {
  const t = text.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(t)) return `#${t.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(t)) return `#${[...t].map((c) => c + c).join("").toLowerCase()}`;
  return null;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * A colour picker in the app's own style: a saturation/brightness field, a
 * hue slider and a hex box. Changes apply live (the stage previews behind
 * it). It opens inside the panel, below the swatch row, rather than in a
 * floating window, so it can't fight the panel's click-outside handling.
 */
export function InlineColorPicker({
  value,
  label,
  onChange,
  onClose,
}: {
  value: string;
  label: string;
  onChange: (hex: string) => void;
  onClose: () => void;
}) {
  // Hue and saturation can't be read back from the hex of a grey or black,
  // so they're kept here and only re-read when the colour changes from outside.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [draft, setDraft] = useState<string | null>(null);
  const lastEmitted = useRef(value.toLowerCase());
  const field = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.toLowerCase() === lastEmitted.current) return;
    lastEmitted.current = value.toLowerCase();
    setHsv(hexToHsv(value));
  }, [value]);

  const apply = (next: Hsv) => {
    setHsv(next);
    setDraft(null);
    const hex = hsvToHex(next);
    lastEmitted.current = hex;
    onChange(hex);
  };

  const fromPointer = (e: React.PointerEvent) => {
    const r = field.current!.getBoundingClientRect();
    apply({ ...hsv, s: clamp01((e.clientX - r.left) / r.width), v: 1 - clamp01((e.clientY - r.top) / r.height) });
  };

  const onFieldKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!d) return;
    e.preventDefault();
    apply({ ...hsv, s: clamp01(hsv.s + d[0]), v: clamp01(hsv.v + d[1]) });
  };

  const hex = hsvToHex(hsv);
  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <motion.div
      role="group"
      aria-label={label}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex flex-col gap-3 pb-1 pt-3">
        <div
          ref={field}
          role="slider"
          tabIndex={0}
          aria-label="Saturation and brightness"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.s * 100)}
          aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
          onKeyDown={onFieldKey}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            fromPointer(e);
          }}
          onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && fromPointer(e)}
          className="relative h-[120px] w-full cursor-crosshair touch-none rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
          style={{
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
            boxShadow: "inset 0 0 0 0.5px rgb(0 0 0 / 0.16)",
          }}
        >
          <span
            className="pointer-events-none absolute size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              background: hex,
              boxShadow: "0 0 0 0.5px rgb(0 0 0 / 0.3), 0 1px 4px rgb(0 0 0 / 0.35)",
            }}
          />
        </div>

        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={Math.round(hsv.h)}
          aria-label="Hue"
          onChange={(e) => apply({ ...hsv, h: Number(e.target.value) })}
          className="hue-range"
        />

        <div className="flex items-center gap-2.5">
          <span className="size-[26px] shrink-0 rounded-full" style={{ background: hex, boxShadow: "inset 0 0 0 0.5px rgb(0 0 0 / 0.16)" }} aria-hidden />
          <input
            type="text"
            aria-label="Hex color"
            spellCheck={false}
            autoComplete="off"
            maxLength={7}
            value={draft ?? hex.toUpperCase()}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setDraft(e.target.value);
              const parsed = parseHex(e.target.value);
              if (!parsed) return;
              setHsv(hexToHsv(parsed));
              lastEmitted.current = parsed;
              onChange(parsed);
            }}
            onBlur={() => setDraft(null)}
            className="h-8 min-w-0 flex-1 rounded-[8px] bg-fill px-2.5 font-mono text-[13px] uppercase tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
      </div>
    </motion.div>
  );
}
