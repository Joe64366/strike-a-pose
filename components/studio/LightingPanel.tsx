"use client";

import { Check, FlipHorizontal2, Plus, RotateCcw, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { springSnappy } from "@/lib/motion";
import {
  describeDirection,
  fromPreset,
  LIGHT_COLORS,
  LIGHT_IDS,
  LIGHT_INFO,
  lightingStore,
  lightingUi,
  MAX_INTENSITY,
  PRESET_IDS,
  PRESETS,
  useLighting,
  useLightingUi,
  type Shading,
} from "@/lib/lighting";
import { bodyHex, useSettings } from "@/lib/settings";
import { Segmented, Switch } from "@/components/ui/Segmented";
import { BallThumb, LightBall } from "./LightBall";

/**
 * Lighting, in the order an artist thinks about it: pick a look (presets),
 * then shape it light by light (direction, strength, colour, shadow), then
 * the room (ambient) and how to read it (value-study shading). Every change
 * previews live on the figure; the lights themselves can be dragged in the
 * scene while this panel is open.
 */
export function LightingPanel({ className = "", onClose }: { className?: string; onClose: () => void }) {
  const lighting = useLighting();
  const selected = useLightingUi((s) => s.selected);
  const view = useLightingUi((s) => s.view);
  const body = bodyHex(useSettings().bodyColor);
  const spec = lighting.lights[selected];
  const presetName = lighting.preset ? PRESETS[lighting.preset].name : "Custom";
  const thumbs = useMemo(
    () => PRESET_IDS.map((id) => ({ id, lighting: fromPreset(id, lighting.shading) })),
    [lighting.shading],
  );
  const set = (patch: Parameters<typeof lightingStore.setLight>[1]) => lightingStore.setLight(selected, patch);
  const customColor = !LIGHT_COLORS.some((c) => c.hex === spec.color);

  return (
    <motion.section
      key="lighting"
      initial={{ opacity: 0, x: 16, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 16, scale: 0.98 }}
      style={{ transformOrigin: "right top" }}
      className={`material-thick pointer-events-auto max-h-[calc(100dvh-180px)] overflow-y-auto rounded-[20px] p-4 ${className}`}
      aria-label="Lighting"
    >
      <header className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] leading-5 font-semibold tracking-[-0.01em]">Lighting</h2>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={presetName}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={springSnappy}
              className="text-[12px] text-label-3"
            >
              {presetName}
            </motion.p>
          </AnimatePresence>
        </div>
        <button
          type="button"
          onClick={() => lightingStore.mirror()}
          aria-label="Mirror lighting"
          data-tip="Light the other side"
          className="pressable -mt-1 flex size-7 items-center justify-center rounded-full text-label-2 hover:bg-fill hover:text-label"
        >
          <FlipHorizontal2 size={15} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close lighting"
          data-tip="Done"
          data-tip-kbd="L"
          className="pressable -mt-1 -mr-1 flex size-7 items-center justify-center rounded-full text-label-2 hover:bg-fill hover:text-label"
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      {/* Looks */}
      <div role="radiogroup" aria-label="Lighting presets" className="-mx-1 grid grid-cols-5 gap-y-2">
        {thumbs.map(({ id, lighting: l }) => {
          const on = lighting.preset === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              data-tip={PRESETS[id].tip}
              onClick={() => lightingStore.applyPreset(id)}
              className="group flex flex-col items-center gap-1 rounded-[10px] py-1 outline-none"
            >
              <span
                className={`rounded-full p-[2px] transition-shadow duration-200 ${
                  on ? "shadow-[0_0_0_2px_var(--accent)]" : "group-hover:shadow-[0_0_0_2px_var(--fill-strong)] group-focus-visible:shadow-[0_0_0_2px_var(--accent)]"
                }`}
              >
                <BallThumb size={38} lighting={l} body={body} />
              </span>
              <span className={`text-[10.5px] leading-none ${on ? "font-semibold text-label" : "text-label-2"}`}>
                {PRESETS[id].name}
              </span>
            </button>
          );
        })}
      </div>

      <div className="my-4 h-px bg-fill-strong" />

      {/* Which light */}
      <div role="radiogroup" aria-label="Light" className="flex h-9 rounded-[10px] bg-fill p-[2px]">
        {LIGHT_IDS.map((id) => {
          const l = lighting.lights[id];
          const on = id === selected;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => lightingUi.set({ selected: id })}
              className={`pressable relative flex flex-1 items-center justify-center gap-1.5 rounded-[8px] text-[12.5px] font-medium ${
                on ? "text-label" : "text-label-2 hover:text-label"
              }`}
            >
              {on && (
                <motion.span
                  layoutId="light-tab"
                  transition={springSnappy}
                  className="absolute inset-0 rounded-[8px] bg-white shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.06)] dark:bg-[rgb(99_99_102)]"
                />
              )}
              <span
                aria-hidden
                className="relative size-2.5 rounded-full"
                style={
                  l.on
                    ? { background: l.color, boxShadow: "inset 0 0 0 0.5px rgb(0 0 0 / 0.3)" }
                    : { boxShadow: "inset 0 0 0 1.5px var(--label-3)" }
                }
              />
              <span className={`relative ${l.on ? "" : "opacity-55"}`}>{LIGHT_INFO[id].name}</span>
            </button>
          );
        })}
      </div>

      {/* The selected light */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">{LIGHT_INFO[selected].name} light</p>
          <p className="text-[11px] leading-snug text-label-3">{LIGHT_INFO[selected].role}</p>
        </div>
        <Switch label={`${LIGHT_INFO[selected].name} light`} on={spec.on} onChange={(on) => set({ on })} />
      </div>

      <div className={`transition-opacity duration-200 ${spec.on ? "" : "opacity-45"}`}>
        <div className="mt-2">
          <LightBall size={132} lighting={lighting} view={view} body={body} selected={selected} />
          <p className="mt-1 text-center text-[12px] font-medium text-label-2 tabular-nums">
            {describeDirection(spec.azimuth, spec.elevation)}
          </p>
          <p className="text-center text-[11px] text-label-3">Drag past the edge to light from behind</p>
        </div>

        <div className="mt-3.5 flex flex-col gap-3.5">
          <PercentSlider
            label="Intensity"
            value={spec.intensity}
            max={MAX_INTENSITY}
            ends={["Off", "Bright"]}
            onChange={(intensity) => set({ intensity, on: intensity > 0 ? true : spec.on })}
          />

          <div>
            <p className="mb-2 flex items-baseline justify-between text-[13px] font-medium">
              Color
              <span className="text-[12px] font-normal text-label-3">
                {LIGHT_COLORS.find((c) => c.hex === spec.color)?.name ?? "Custom"}
              </span>
            </p>
            <div role="radiogroup" aria-label="Light color" className="flex flex-wrap gap-[7px]">
              {LIGHT_COLORS.map((c) => (
                <ColorDot key={c.hex} hex={c.hex} name={c.name} on={spec.color === c.hex} onPick={() => set({ color: c.hex })} />
              ))}
              <label
                data-tip="Any color"
                className={`swatch relative flex size-[26px] cursor-pointer items-center justify-center rounded-full ${customColor ? "swatch-on" : ""}`}
                style={{
                  background: customColor
                    ? spec.color
                    : "conic-gradient(from 0deg, #ff5f57, #febc2e, #28c840, #3fd5c8, #0a84ff, #bf5af2, #ff5f57)",
                }}
              >
                {!customColor && <Plus size={13} strokeWidth={3} className="text-white drop-shadow" aria-hidden />}
                <input
                  type="color"
                  aria-label="Custom light color"
                  value={spec.color}
                  onChange={(e) => set({ color: e.target.value })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium">Cast shadows</p>
                <p className="text-[11px] text-label-3">On the floor and across the body</p>
              </div>
              <Switch label="Cast shadows" on={spec.shadows} onChange={(shadows) => set({ shadows })} />
            </div>
            <AnimatePresence initial={false}>
              {spec.shadows && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3">
                    <PercentSlider
                      label="Shadow softness"
                      value={spec.softness}
                      max={1}
                      ends={["Crisp", "Soft"]}
                      onChange={(softness) => set({ softness })}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="my-4 h-px bg-fill-strong" />

      {/* The room, and how to read it */}
      <div className="flex flex-col gap-3.5">
        <PercentSlider
          label="Ambient light"
          value={lighting.ambient}
          max={1}
          ends={["Dark shadows", "Soft shadows"]}
          onChange={(ambient) => lightingStore.set({ ambient })}
        />
        <div>
          <p className="mb-1.5 text-[13px] font-medium">Shading</p>
          <Segmented<Shading>
            label="Shading"
            value={lighting.shading}
            onChange={(shading) => lightingStore.set({ shading })}
            options={[
              { value: "smooth", label: "Smooth" },
              { value: "two", label: "2 tones" },
              { value: "three", label: "3 tones" },
            ]}
          />
          <p className="mt-1.5 text-[11px] leading-snug text-label-3">
            {lighting.shading === "smooth"
              ? "Tones lets you see the shapes of light and shadow, as in a value study."
              : lighting.shading === "two"
                ? "Light and shadow only: the big shapes to block in first."
                : "Light, half-tone and shadow."}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => lightingStore.reset()}
        disabled={lighting.preset === "studio"}
        className="pressable mt-4 flex h-8 w-full items-center justify-center gap-1.5 rounded-[9px] bg-fill text-[13px] font-medium enabled:hover:bg-fill-strong disabled:opacity-40"
      >
        <RotateCcw size={14} aria-hidden />
        Reset to Studio
      </button>
      <p className="mt-3 hidden text-center text-[11px] text-label-3 md:block">Drag the lights in the scene to move them</p>
    </motion.section>
  );
}

function ColorDot({ hex, name, on, onPick }: { hex: string; name: string; on: boolean; onPick: () => void }) {
  const n = parseInt(hex.slice(1), 16);
  const light = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150;
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
      <span
        className={`swatch flex size-[26px] items-center justify-center rounded-full ${on ? "swatch-on" : ""}`}
        style={{ background: hex }}
      >
        {on && (
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0.35, duration: 0.3 }}
            className={light ? "text-[#1d1d1f]" : "text-white"}
          >
            <Check size={12} strokeWidth={3} aria-hidden />
          </motion.span>
        )}
      </span>
    </button>
  );
}

/** 0–max as a percentage, with the accent fill growing from the left. Double-click resets to a sensible middle. */
function PercentSlider({
  label,
  value,
  max,
  ends,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  ends: [string, string];
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between">
        <label className="text-[13px] font-medium">{label}</label>
        <output className="text-[13px] text-label-2 tabular-nums">{pct}%</output>
      </div>
      <input
        type="range"
        className="joint-slider"
        min={0}
        max={Math.round(max * 100)}
        step={1}
        value={pct}
        aria-label={label}
        aria-valuetext={`${pct}%`}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={{ "--fill-from": "0%", "--fill-to": `${(value / max) * 100}%` } as React.CSSProperties}
      />
      <div className="flex justify-between text-[11px] text-label-3">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  );
}
