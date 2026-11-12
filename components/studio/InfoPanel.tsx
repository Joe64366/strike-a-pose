"use client";

import { Camera, FlipHorizontal2, Lightbulb, MessageSquareText, MousePointer2, Sun, Timer, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { AnchoredPopover, type PopoverAnchor } from "@/components/ui/AnchoredPopover";
import { Segmented } from "@/components/ui/Segmented";
import { springSnappy } from "@/lib/motion";

type Tab = "keys" | "tips";

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

/** Shortcuts and tips: everything worth knowing that the interface can't say on its own. */
export function InfoPanel({ anchor, onClose }: { anchor: PopoverAnchor; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("keys");
  const [mod] = useState(() => (isMac() ? "⌘" : "Ctrl"));

  const groups: { title: string; rows: [string, string[]][] }[] = [
    {
      title: "General",
      rows: [
        ["Describe a pose", ["/"]],
        ["Show or hide the interface", ["H"]],
        ["Deselect or close", ["Esc"]],
        ["Undo", [mod, "Z"]],
        ["Redo", [mod, "Shift", "Z"]],
        ["Shortcuts and tips", ["?"]],
      ],
    },
    {
      title: "View",
      rows: [
        ["Front, ¾, side, back", ["1", "2", "3", "4"]],
        ["Saved camera angles", ["C"]],
        ["Mirror view", ["M"]],
        ["Fish-eye lens", ["P"]],
      ],
    },
    {
      title: "Look",
      rows: [
        ["Lighting", ["L"]],
        ["Outline on or off", ["O"]],
      ],
    },
    {
      title: "Drawing timer",
      rows: [
        ["Timer", ["T"]],
        ["Pause or resume", ["Space"]],
        ["Next pose", ["→"]],
      ],
    },
  ];

  const mouse: [string, string][] = [
    ["Drag a body part", "Pose it"],
    ["Shift-drag a body part", "Twist it"],
    ["Click the hips, drag the ring", "Move the figure (Shift lifts it)"],
    ["Drag around the figure", "Orbit"],
    ["Right-drag", "Pan"],
    ["Scroll", "Zoom"],
  ];

  return (
    <AnchoredPopover anchor={anchor} onClose={onClose} label="Shortcuts and tips" width={352}>
      <header className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Shortcuts &amp; Tips</h2>
            <p className="text-[12px] text-label-3">Get around the studio faster</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="pressable -mt-0.5 -mr-1 flex size-7 items-center justify-center rounded-full text-label-2 hover:bg-fill hover:text-label"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="mt-3">
          <Segmented<Tab>
            label="Section"
            value={tab}
            onChange={setTab}
            options={[
              { value: "keys", label: "Shortcuts" },
              { value: "tips", label: "Tips" },
            ]}
          />
        </div>
      </header>

      <div className="scroll-fade min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            transition={springSnappy}
          >
            {tab === "keys" ? (
              <>
                {groups.map((g) => (
                  <Section key={g.title} title={g.title}>
                    {g.rows.map(([what, keys]) => (
                      <Row key={what} label={what}>
                        <span className="flex items-center gap-1">
                          {keys.map((k) => (
                            <kbd key={k} className="keycap">
                              {k}
                            </kbd>
                          ))}
                        </span>
                      </Row>
                    ))}
                  </Section>
                ))}
                <Section title="Mouse">
                  {mouse.map(([how, what]) => (
                    <Row key={how} label={how}>
                      <span className="text-right text-[12px] text-label-2">{what}</span>
                    </Row>
                  ))}
                </Section>
              </>
            ) : (
              <ul className="flex flex-col gap-1 pt-1">
                <Tip icon={<MessageSquareText size={15} />} title="Describe it in plain words">
                  &ldquo;Crying on her knees&rdquo;, &ldquo;pointing at the sky&rdquo;. Type again to refine the same pose:
                  &ldquo;lower the left arm&rdquo;.
                </Tip>
                <Tip icon={<MousePointer2 size={15} />} title="Fine-tune by hand">
                  Drag any body part; Shift-drag twists it. The inspector shows exact angles, and Mirror copies one
                  side to the other.
                </Tip>
                <Tip icon={<Sun size={15} />} title="Every pose keeps its own look">
                  Lighting, the fish-eye lens and saved camera angles stay with each pose. A new pose starts fresh.
                </Tip>
                <Tip icon={<Lightbulb size={15} />} title="Study values and shapes">
                  In Lighting, try 2 or 3 tones, Grayscale, or Silhouette to check the pose reads as a clear shape.
                </Tip>
                <Tip icon={<FlipHorizontal2 size={15} className="rotate-90" />} title="Check your drawing">
                  Mirror view (M) flips the stage, as you would flip a canvas. Hide the interface (H) for a clean
                  reference.
                </Tip>
                <Tip icon={<Camera size={15} />} title="Keep the angle you’re drawing from">
                  Save camera angles (C) and glide back after orbiting away.
                </Tip>
                <Tip icon={<Timer size={15} />} title="Gesture practice">
                  The drawing timer (T) shows a new pose every interval, from the AI or your saved poses.
                </Tip>
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </AnchoredPopover>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-2">
      <h3 className="pb-1 text-[12px] font-semibold text-label-3">{title}</h3>
      <div className="mb-2 overflow-hidden rounded-[12px] bg-fill">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 border-b border-[var(--material-stroke)] px-3 py-1.5 last:border-b-0">
      <span className="text-[13px]">{label}</span>
      {children}
    </div>
  );
}

function Tip({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 rounded-[12px] px-1 py-2">
      <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-accent-fill text-accent">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-label-2">{children}</p>
      </div>
    </li>
  );
}
