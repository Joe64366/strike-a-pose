"use client";

import { X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ColorDot, CustomColorDot } from "@/components/ui/ColorSwatches";
import { Segmented, Switch } from "@/components/ui/Segmented";
import {
  BACKGROUNDS,
  BODY_COLORS,
  bodyHex,
  isHex,
  OUTLINE_COLORS,
  outlineHex,
  settingsStore,
  stageColor,
  useScheme,
  useSettings,
  type Appearance,
  type HexColor,
  type OutlineWeight,
} from "@/lib/settings";

export type SettingsAnchor = { rect: DOMRect; returnFocus: HTMLElement | null };

const MARGIN = 12;

/**
 * Preferences you rarely touch. A popover rather than a dimmed modal: it
 * grows out of the gear and leaves the stage fully visible, so background
 * and outline changes preview live behind it.
 */
export function SettingsPanel({ anchor, onClose }: { anchor: SettingsAnchor; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const settings = useSettings();
  const scheme = useScheme();

  // Below the gear when there's room, otherwise above it.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const { rect } = anchor;
    const h = node.offsetHeight;
    const below = rect.bottom + 8 + h <= window.innerHeight - MARGIN;
    const top = below ? rect.bottom + 8 : Math.max(MARGIN, rect.top - 8 - h);
    const left = Math.min(Math.max(MARGIN, rect.left), window.innerWidth - MARGIN - node.offsetWidth);
    node.style.top = `${top}px`;
    node.style.left = `${left}px`;
    node.style.transformOrigin = `${rect.left + rect.width / 2 - left}px ${below ? "0" : "100%"}`;
    node.querySelector<HTMLElement>("[aria-checked=true]")?.focus({ preventScroll: true });
  }, [anchor]);

  useEffect(() => {
    const close = () => {
      onClose();
      anchor.returnFocus?.focus({ preventScroll: true });
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.returnFocus?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  return createPortal(
    <motion.div
      ref={ref}
      role="dialog"
      aria-label="Settings"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14 } }}
      className="menu-surface fixed z-[80] max-h-[calc(100dvh-24px)] w-[320px] max-w-[calc(100vw-24px)] overflow-x-hidden overflow-y-auto rounded-[18px] p-4 text-label"
    >
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Settings</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="pressable -mr-1 flex size-7 items-center justify-center rounded-full text-label-2 hover:bg-fill hover:text-label"
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      <Section title="Theme">
        <Segmented<Appearance>
          label="Theme"
          value={settings.appearance}
          onChange={(appearance) => settingsStore.set({ appearance })}
          options={[
            { value: "system", label: "Automatic" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </Section>

      <Section title="Stage">
        <div className="flex flex-col gap-3.5">
          <ColorRow
            label="Background"
            value={settings.background}
            current={stageColor(settings.background, scheme)}
            options={BACKGROUNDS.map((b) => ({
              id: b.id,
              // "Studio" follows the theme: shown half light, half dark.
              name: "dark" in b ? `${b.name} (follows theme)` : b.name,
              shortName: b.name,
              hex: stageColor(b.id, scheme),
              fill: "dark" in b ? `linear-gradient(135deg, ${b.light} 0 50%, ${b.dark} 50% 100%)` : undefined,
            }))}
            onChange={(background) => settingsStore.set({ background })}
          />
          <Row label="Floor grid">
            <Switch label="Floor grid" on={settings.grid} onChange={(grid) => settingsStore.set({ grid })} />
          </Row>
        </div>
      </Section>

      <Section title="Mannequin">
        <div className="flex flex-col gap-3.5">
          <ColorRow
            label="Body"
            value={settings.bodyColor}
            current={bodyHex(settings.bodyColor)}
            options={BODY_COLORS}
            onChange={(bodyColor) => settingsStore.set({ bodyColor })}
          />
          <div>
            <p className="mb-1.5 text-[13px]">Outline</p>
            <Segmented<OutlineWeight>
              label="Outline weight"
              value={settings.outlineWeight}
              onChange={(outlineWeight) => settingsStore.set({ outlineWeight })}
              options={[
                { value: "off", label: "Off" },
                { value: "thin", label: "Thin" },
                { value: "regular", label: "Regular" },
                { value: "bold", label: "Bold" },
              ]}
            />
          </div>
          {/* Colour only matters while there's a line to colour. */}
          <div
            className={`transition-opacity duration-200 ${settings.outlineWeight === "off" ? "pointer-events-none opacity-35" : ""}`}
            aria-disabled={settings.outlineWeight === "off"}
          >
            <ColorRow
              label="Outline color"
              value={settings.outlineColor}
              current={outlineHex(settings.outlineColor)}
              options={OUTLINE_COLORS}
              onChange={(outlineColor) => settingsStore.set({ outlineColor })}
            />
          </div>
        </div>
      </Section>

      <Section title="Interface" last>
        <div className="flex flex-col gap-3">
          <DetailRow
            label="Toolbar"
            detail={
              settings.showToolbar
                ? "Tool buttons at the top right, and the hide button"
                : "Hidden. Shortcuts still work: press ? for the list"
            }
          >
            <Switch label="Toolbar" on={settings.showToolbar} onChange={(showToolbar) => settingsStore.set({ showToolbar })} />
          </DetailRow>
          <DetailRow
            label="Prompt bar"
            detail={settings.showPromptBar ? "Describe a pose at the bottom of the stage" : "Hidden. Press / to bring it up"}
          >
            <Switch label="Prompt bar" on={settings.showPromptBar} onChange={(showPromptBar) => settingsStore.set({ showPromptBar })} />
          </DetailRow>
          <DetailRow label="Pose ideas" detail="Suggestions above the prompt bar">
            <Switch label="Pose ideas" on={settings.promptIdeas} onChange={(promptIdeas) => settingsStore.set({ promptIdeas })} />
          </DetailRow>
        </div>
      </Section>
    </motion.div>,
    document.body,
  );
}

/** A setting with a line saying what it does (and, when off, how to reach what it hides). */
function DetailRow({ label, detail, children }: { label: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px]">{label}</p>
        <p className="text-[11.5px] leading-snug text-label-3">{detail}</p>
      </div>
      {children}
    </div>
  );
}

function Section({ title, last, children }: { title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <section className={last ? "" : "mb-5"}>
      <h3 className="mb-2 text-[12px] font-semibold text-label-3">{title}</h3>
      {children}
    </section>
  );
}

/**
 * A row of colour swatches ending in a custom colour, as in the lighting
 * panel. The chosen name shows beside the label (names are also tooltips).
 * Every row uses the same nine columns, so swatches line up from row to row.
 */
function ColorRow<T extends string>({
  label,
  value,
  current,
  options,
  onChange,
}: {
  label: string;
  value: T | HexColor;
  /** The colour in use (where the custom picker opens). */
  current: string;
  options: readonly { id: T; name: string; shortName?: string; hex: string; fill?: string }[];
  onChange: (id: T | HexColor) => void;
}) {
  const custom = isHex(value);
  const chosen = options.find((o) => o.id === value);
  return (
    <div>
      <p className="mb-2 flex items-baseline justify-between text-[13px]">
        {label}
        <span className="text-[12px] text-label-3">{custom ? "Custom" : (chosen?.shortName ?? chosen?.name)}</span>
      </p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-[repeat(9,26px)] justify-between gap-y-2.5">
        {options.map((o) => (
          <ColorDot key={o.id} hex={o.hex} fill={o.fill} name={o.name} on={o.id === value} onPick={() => onChange(o.id)} />
        ))}
        <CustomColorDot
          label={`Custom ${label.toLowerCase()}`}
          value={current}
          on={custom}
          onChange={(hex) => isHex(hex) && onChange(hex)}
        />
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px]">{label}</span>
      {children}
    </div>
  );
}
