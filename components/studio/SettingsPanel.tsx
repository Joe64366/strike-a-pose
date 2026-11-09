"use client";

import { Check, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Segmented, Switch } from "@/components/ui/Segmented";
import {
  BACKGROUNDS,
  settingsStore,
  stagePalette,
  useScheme,
  useSettings,
  type Appearance,
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
      className="menu-surface fixed z-[80] w-[320px] max-w-[calc(100vw-24px)] rounded-[18px] p-4 text-label"
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

      <Section title="Background">
        <div role="radiogroup" aria-label="Background" className="grid grid-cols-4 gap-x-1 gap-y-3">
          {BACKGROUNDS.map((b) => {
            const on = settings.background === b.id;
            const adaptive = "dark" in b;
            const swatch = adaptive
              ? `linear-gradient(135deg, ${b.light} 0 50%, ${b.dark} 50% 100%)`
              : b.light;
            const darkSwatch = stagePalette(b.id, scheme).dark;
            return (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => settingsStore.set({ background: b.id })}
                className="group flex flex-col items-center gap-1.5 rounded-[10px] py-1 outline-none"
              >
                <span
                  className={`swatch relative flex size-10 items-center justify-center rounded-full ${on ? "swatch-on" : ""}`}
                  style={{ background: swatch }}
                >
                  {on && (
                    <motion.span
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", bounce: 0.35, duration: 0.3 }}
                      className={
                        adaptive
                          ? "flex size-6 items-center justify-center rounded-full bg-white text-[#1d1d1f] shadow-[0_1px_3px_rgb(0_0_0/0.3)]"
                          : darkSwatch
                            ? "text-white"
                            : "text-[#1d1d1f]"
                      }
                    >
                      <Check size={adaptive ? 14 : 16} strokeWidth={2.75} aria-hidden />
                    </motion.span>
                  )}
                </span>
                <span className={`text-[11px] ${on ? "font-semibold text-label" : "text-label-2"}`}>
                  {b.name}
                  {adaptive && <span className="sr-only"> (follows theme)</span>}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Stage" last>
        <div className="flex flex-col gap-3">
          <Row label="Floor grid">
            <Switch label="Floor grid" on={settings.grid} onChange={(grid) => settingsStore.set({ grid })} />
          </Row>
          <div>
            <p className="mb-1.5 text-[13px]">Outline weight</p>
            <Segmented<OutlineWeight>
              label="Outline weight"
              value={settings.outlineWeight}
              onChange={(outlineWeight) => settingsStore.set({ outlineWeight })}
              options={[
                { value: "thin", label: "Thin" },
                { value: "regular", label: "Regular" },
                { value: "bold", label: "Bold" },
              ]}
            />
          </div>
        </div>
      </Section>
    </motion.div>,
    document.body,
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px]">{label}</span>
      {children}
    </div>
  );
}
