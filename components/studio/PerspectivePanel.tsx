"use client";

import { X } from "lucide-react";
import { motion } from "motion/react";
import { CURVE_MAX, CURVE_MIN, perspective, usePerspective } from "@/lib/perspective";
import { Segmented, Switch } from "@/components/ui/Segmented";

/**
 * The fish-eye lens menu: switch the lens on or off, and set how strongly it
 * curves and the guide lines that show the space bending. Opening it doesn't
 * turn the lens on; closing it leaves the lens as it is. The lens never moves
 * the camera.
 */
export function PerspectivePanel({
  className = "",
  on,
  onToggle,
  onClose,
}: {
  className?: string;
  /** The lens is on. */
  on: boolean;
  onToggle: (on: boolean) => void;
  onClose: () => void;
}) {
  const p = usePerspective();

  return (
    <motion.section
      initial={{ opacity: 0, x: 16, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 16, scale: 0.98 }}
      style={{ transformOrigin: "right top" }}
      className={`material-thick pointer-events-auto max-h-[calc(100dvh-180px)] overflow-x-hidden overflow-y-auto rounded-[20px] p-4 ${className}`}
      aria-label="Fish-eye lens"
    >
      <header className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] leading-5 font-semibold tracking-[-0.01em]">Fish-eye lens</h2>
          <p className="text-[12px] text-label-3">Curvilinear perspective: straight lines bend</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close fish-eye menu"
          data-tip="Done"
          data-tip-kbd="P"
          className="pressable -mt-1 -mr-1 flex size-7 items-center justify-center rounded-full text-label-2 hover:bg-fill hover:text-label"
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      {/* The lens itself */}
      <div className="flex items-center justify-between gap-3 rounded-[12px] bg-fill px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">{on ? "Fish-eye is on" : "Fish-eye is off"}</p>
          <p className="text-[11px] leading-snug text-label-3">
            {on ? "Pose and light the figure as usual" : "Turn it on to see the figure through the lens"}
          </p>
        </div>
        <Switch label="Fish-eye lens" on={on} onChange={onToggle} />
      </div>

      <div className={`mt-4 flex flex-col gap-4 transition-opacity duration-200 ${on ? "" : "opacity-60"}`}>
        <Slider
          label="Curvature"
          value={p.curvature}
          min={CURVE_MIN}
          max={CURVE_MAX}
          step={1}
          format={(v) => `${Math.round(v * 2)}° view`}
          ends={["Gentle", "Extreme"]}
          onChange={(curvature) => perspective.set({ curvature })}
        />

        <div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium">Guides</p>
              <p className="text-[11px] text-label-3">Lines that show the space bending</p>
            </div>
            <Switch label="Guides" on={p.guides} onChange={(guides) => perspective.set({ guides })} />
          </div>
          {p.guides && (
            <div className="mt-2">
              <Segmented<string>
                label="Guide lines"
                value={p.dense ? "more" : "few"}
                onChange={(v) => perspective.set({ dense: v === "more" })}
                options={[
                  { value: "few", label: "Fewer lines" },
                  { value: "more", label: "More lines" },
                ]}
              />
            </div>
          )}
        </div>

        <p className="text-[11px] leading-snug text-label-3">
          {on
            ? "Same camera, wider lens: turning it off keeps this exact view."
            : "Turning it on keeps your view: only the lens changes."}
        </p>
      </div>
    </motion.section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  ends,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  ends?: [string, string];
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between">
        <label className="text-[13px] font-medium">{label}</label>
        <output className="text-[13px] text-label-2 tabular-nums">{format(value)}</output>
      </div>
      <input
        type="range"
        className="joint-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--fill-from": "0%", "--fill-to": `${pct}%` } as React.CSSProperties}
      />
      {ends && (
        <div className="flex justify-between text-[11px] text-label-3">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </div>
  );
}
