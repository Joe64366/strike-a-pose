"use client";

import { Minus, Play, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Segmented, Switch } from "@/components/ui/Segmented";
import {
  COUNTS,
  DURATIONS,
  formatDuration,
  MAX_SECONDS,
  MIN_SECONDS,
  timerSettings,
  useTimerSettings,
  type PoseSource,
  type TimerMode,
} from "@/lib/drawingTimer";
import { springSnappy } from "@/lib/motion";

export type TimerAnchor = { rect: DOMRect; returnFocus: HTMLElement | null };

const MARGIN = 12;

/** Finer steps for short times, coarser for long ones. */
function step(seconds: number, dir: 1 | -1) {
  const size = seconds < 120 || (dir < 0 && seconds <= 120) ? 15 : seconds < 600 || (dir < 0 && seconds <= 600) ? 30 : 60;
  const next = dir > 0 ? Math.floor(seconds / size) * size + size : Math.ceil(seconds / size) * size - size;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, next));
}

/**
 * Setting up a drawing timer. A popover from the timer button: choose a
 * plain countdown or a pose session, how long per pose, how many, and where
 * new poses come from. Choices are remembered for next time.
 */
export function TimerPanel({
  anchor,
  savedCount,
  onStart,
  onClose,
}: {
  anchor: TimerAnchor;
  /** Saved poses available for "My poses". */
  savedCount: number;
  onStart: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const s = useTimerSettings();
  const session = s.mode === "session";
  const noSaved = s.source === "saved" && savedCount === 0;
  const totalSeconds = session && s.count ? s.seconds * s.count : s.seconds;

  // Below the button when there's room, otherwise above; right-aligned to it.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const { rect } = anchor;
    const h = node.offsetHeight;
    const below = rect.bottom + 8 + h <= window.innerHeight - MARGIN;
    const top = below ? rect.bottom + 8 : Math.max(MARGIN, rect.top - 8 - h);
    const left = Math.min(Math.max(MARGIN, rect.right - node.offsetWidth), window.innerWidth - MARGIN - node.offsetWidth);
    node.style.top = `${top}px`;
    node.style.left = `${left}px`;
    node.style.transformOrigin = `${rect.left + rect.width / 2 - left}px ${below ? "0" : "100%"}`;
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.returnFocus?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        anchor.returnFocus?.focus({ preventScroll: true });
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
      aria-label="Drawing timer"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14 } }}
      className="menu-surface fixed z-[80] max-h-[calc(100dvh-24px)] w-[320px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-[18px] p-4 text-label"
    >
      <header className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Drawing timer</h2>
          <p className="text-[12px] text-label-3">For gesture and timed practice</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="pressable -mt-0.5 -mr-1 flex size-7 items-center justify-center rounded-full text-label-2 hover:bg-fill hover:text-label"
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      <Segmented<TimerMode>
        label="Timer type"
        value={s.mode}
        onChange={(mode) => timerSettings.set({ mode })}
        options={[
          { value: "session", label: "Pose session" },
          { value: "timer", label: "Timer" },
        ]}
      />
      <p className="mt-1.5 text-[11px] leading-snug text-label-3">
        {session
          ? "A new pose each time the timer runs out. The interface steps aside until you end the session."
          : "A countdown for the pose that's on stage. It sits in the top bar while you work."}
      </p>

      {/* Time */}
      <Section title={session ? "Time per pose" : "Time"}>
        <div role="radiogroup" aria-label="Time" className="grid grid-cols-5 gap-1.5">
          {DURATIONS.map((d) => (
            <Chip key={d} on={s.seconds === d} onClick={() => timerSettings.set({ seconds: d })}>
              {d < 60 ? `${d}s` : `${d / 60}m`}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex h-9 items-center justify-between rounded-[10px] bg-fill px-1">
          <StepButton label="Less time" onClick={() => timerSettings.set({ seconds: step(s.seconds, -1) })} disabled={s.seconds <= MIN_SECONDS}>
            <Minus size={15} aria-hidden />
          </StepButton>
          <output className="text-[14px] font-semibold tabular-nums" aria-live="polite">
            {formatDuration(s.seconds)}
          </output>
          <StepButton label="More time" onClick={() => timerSettings.set({ seconds: step(s.seconds, 1) })} disabled={s.seconds >= MAX_SECONDS}>
            <Plus size={15} aria-hidden />
          </StepButton>
        </div>
      </Section>

      <AnimatePresence initial={false}>
        {session && (
          <motion.div
            key="session"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springSnappy}
            className="overflow-hidden"
          >
            <Section title="Poses">
              <div role="radiogroup" aria-label="Number of poses" className="grid grid-cols-4 gap-1.5">
                {COUNTS.map((c) => (
                  <Chip key={c} on={s.count === c} onClick={() => timerSettings.set({ count: c })} label={c ? undefined : "Until I stop"}>
                    {c || "∞"}
                  </Chip>
                ))}
              </div>
            </Section>

            <Section title="New poses from">
              <Segmented<PoseSource>
                label="New poses from"
                value={s.source}
                onChange={(source) => timerSettings.set({ source })}
                options={[
                  { value: "ai", label: "AI ideas" },
                  { value: "saved", label: `My poses${savedCount ? ` (${savedCount})` : ""}` },
                ]}
              />
              <p className={`mt-1.5 text-[11px] leading-snug ${noSaved ? "text-danger" : "text-label-3"}`}>
                {s.source === "ai"
                  ? "A fresh pose every round, generated while you draw the last."
                  : noSaved
                    ? "You haven't saved any poses yet. Use AI ideas, or pose a few first."
                    : "Your saved poses, shuffled. They're already in your history."}
              </p>
            </Section>

            <div className="mt-3.5">
              <Row label="Random camera angle" hint="Front, ¾, side or back each pose">
                <Switch label="Random camera angle" on={s.randomView} onChange={(randomView) => timerSettings.set({ randomView })} />
              </Row>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-3.5 flex flex-col gap-3.5">
        <Row label="Chime when time's up">
          <Switch label="Chime when time's up" on={s.sound} onChange={(sound) => timerSettings.set({ sound })} />
        </Row>
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={session && noSaved}
        className="pressable mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-[11px] bg-accent text-[14px] font-semibold text-on-accent enabled:hover:bg-accent-hover disabled:opacity-40"
      >
        <Play size={15} fill="currentColor" aria-hidden />
        {session ? "Start session" : "Start timer"}
      </button>
      <p className="mt-1.5 text-center text-[11px] text-label-3 tabular-nums">
        {session ? (s.count ? `${s.count} poses · ${formatDuration(totalSeconds)} total` : "Until you stop") : formatDuration(totalSeconds)}
        {" · "}Space pauses
      </p>
    </motion.div>,
    document.body,
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-[12px] font-semibold text-label-3">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px]">{label}</p>
        {hint && <p className="text-[11px] text-label-3">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Chip({ on, onClick, label, children }: { on: boolean; onClick: () => void; label?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      data-tip={label}
      onClick={onClick}
      className={`pressable h-8 rounded-[9px] text-[13px] font-medium tabular-nums transition-colors duration-150 ${
        on ? "bg-accent text-on-accent" : "bg-fill text-label hover:bg-fill-strong"
      }`}
    >
      {children}
    </button>
  );
}

function StepButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="pressable flex size-7 items-center justify-center rounded-[7px] text-label-2 enabled:hover:bg-fill-strong enabled:hover:text-label disabled:opacity-35"
    >
      {children}
    </button>
  );
}
