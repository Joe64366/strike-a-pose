"use client";

import { Check, LoaderCircle, Pause, Play, RotateCcw, SkipForward, Square, Star } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { formatClock, session, useSession, type Phase } from "@/lib/drawingTimer";
import { springSnappy } from "@/lib/motion";

/** Seconds left at which the countdown turns orange. */
const WARN_MS = 5000;
const RING = 2 * Math.PI * 13;

/** Phases the capsule shows (the 3-2-1 has its own overlay; the summary is a sheet). */
export function capsulePhase(phase: Phase) {
  return phase === "drawing" || phase === "paused" || phase === "loading" || phase === "timeUp" || phase === "done";
}

/**
 * Drives the countdown digits and ring straight from the clock, every frame,
 * without re-rendering React (the session store only changes on events).
 */
function useClock(
  digits: React.RefObject<HTMLSpanElement | null>,
  ring: React.RefObject<SVGCircleElement | null>,
  root: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = session.get();
      const left =
        s.phase === "drawing" ? Math.max(0, s.endsAt - performance.now()) : s.phase === "timeUp" ? 0 : s.remaining;
      const total = s.seconds * 1000;
      if (digits.current) digits.current.textContent = formatClock(left);
      if (ring.current) ring.current.style.strokeDashoffset = String(RING * (1 - left / Math.max(total, 1)));
      root.current?.toggleAttribute("data-warn", s.phase === "drawing" && left <= WARN_MS && left > 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [digits, ring, root]);
}

/**
 * The running timer, in the spirit of the Dynamic Island: a dark capsule.
 *
 * - "docked": sits in the top bar where the pose name usually is, laid out
 *   with the other controls, so it never covers them (timer with the
 *   interface showing).
 * - "floating": hovers at the top of the stage when the interface is hidden
 *   (always the case during a pose session).
 */
export function TimerCapsule({ variant, show = true, inset = 0 }: { variant: "docked" | "floating"; show?: boolean; inset?: number }) {
  const phase = useSession((s) => s.phase);
  const visible = show && capsulePhase(phase);
  const capsule = <AnimatePresence>{visible && <Capsule key="capsule" variant={variant} />}</AnimatePresence>;
  if (variant === "docked") return capsule;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center transition-[padding] duration-300"
      style={{ paddingLeft: inset }}
    >
      {capsule}
    </div>
  );
}

function Capsule({ variant }: { variant: "docked" | "floating" }) {
  const phase = useSession((s) => s.phase);
  const mode = useSession((s) => s.mode);
  const source = useSession((s) => s.source);
  const index = useSession((s) => s.index);
  const count = useSession((s) => s.count);
  const posesDrawn = useSession((s) => s.poses.length);
  const drawnMs = useSession((s) => s.drawnMs);
  const pose = useSession((s) => s.poses[s.index]);
  const notice = useSession((s) => s.notice);
  const root = useRef<HTMLDivElement>(null);
  const digits = useRef<HTMLSpanElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  useClock(digits, ring, root);

  const docked = variant === "docked";
  const isSession = mode === "session";
  // Poses from history are already saved: nothing to keep.
  const canKeep = isSession && source === "ai";
  const running = phase === "drawing";
  const size = docked ? "size-7" : "size-8";
  const btn = `pressable pointer-events-auto flex ${size} items-center justify-center rounded-full text-white/80 hover:bg-white/12 hover:text-white`;
  const icon = docked ? 14 : 16;

  return (
    <motion.div
      ref={root}
      layout
      initial={{ opacity: 0, y: docked ? -4 : -12, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: docked ? -4 : -12, scale: 0.94 }}
      transition={springSnappy}
      role="timer"
      aria-label="Drawing timer"
      className={`timer-capsule pointer-events-auto flex items-center rounded-full text-white ${
        docked ? "h-9 gap-2 py-1 pr-1 pl-1.5" : "h-12 gap-3 py-2 pr-2 pl-2.5"
      }`}
    >
      {phase === "done" ? (
        <motion.div layout="position" className={`flex items-center gap-2 ${docked ? "px-2" : "px-2.5"}`}>
          <span className="flex size-5 items-center justify-center rounded-full bg-[#30d158] text-black">
            <Check size={13} strokeWidth={3} aria-hidden />
          </span>
          <span className="text-[13px] font-semibold">Session complete</span>
          <span className="text-[13px] text-white/60 tabular-nums">
            {posesDrawn} {posesDrawn === 1 ? "pose" : "poses"} · {formatClock(drawnMs)}
          </span>
        </motion.div>
      ) : phase === "timeUp" ? (
        <motion.div layout="position" className={`flex items-center ${docked ? "gap-2 pl-2" : "gap-3 pl-1.5"}`}>
          <span className={`${docked ? "text-[13px]" : "text-[15px]"} font-semibold tracking-[-0.01em]`}>Time&rsquo;s up</span>
          <button
            type="button"
            onClick={() => session.again()}
            className={`pressable flex ${docked ? "h-7" : "h-8"} items-center gap-1.5 rounded-full bg-white/14 px-3 text-[13px] font-medium hover:bg-white/22`}
          >
            <RotateCcw size={13} aria-hidden />
            Again
          </button>
          <button
            type="button"
            onClick={() => session.stop()}
            className={`pressable flex ${docked ? "h-7" : "h-8"} items-center rounded-full bg-white px-3.5 text-[13px] font-semibold text-black hover:bg-white/90`}
          >
            Done
          </button>
        </motion.div>
      ) : (
        <>
          {/* Ring + time */}
          <motion.div layout="position" className="flex items-center gap-2">
            <span className={`relative flex items-center justify-center ${docked ? "size-6" : "size-8"}`}>
              {phase === "loading" ? (
                <LoaderCircle size={docked ? 16 : 20} className="animate-spin text-white/70" aria-hidden />
              ) : (
                <svg viewBox="0 0 32 32" className={`${docked ? "size-6" : "size-8"} -rotate-90`} aria-hidden>
                  <circle cx="16" cy="16" r="13" fill="none" stroke="rgb(255 255 255 / 0.16)" strokeWidth="3.5" />
                  <circle
                    ref={ring}
                    cx="16"
                    cy="16"
                    r="13"
                    fill="none"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeDasharray={RING}
                    className="timer-ring"
                  />
                </svg>
              )}
            </span>
            <span
              ref={digits}
              className={`timer-digits min-w-[3.4ch] leading-none font-semibold tabular-nums ${
                docked ? "text-[15px] tracking-[-0.01em]" : "text-[20px] tracking-[-0.02em]"
              } ${phase === "paused" ? "opacity-55" : ""}`}
            >
              0:00
            </span>
          </motion.div>

          {/* What's on stage */}
          {isSession && (
            <motion.div layout="position" className="flex max-w-[min(220px,34vw)] min-w-0 flex-col leading-tight">
              <span className="text-[11px] font-medium text-white/55 tabular-nums">
                {phase === "loading" ? "Next pose…" : `Pose ${index + 1}${count ? ` of ${count}` : ""}`}
              </span>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={notice ?? pose?.id ?? "none"}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={springSnappy}
                  className={`truncate text-[13px] font-medium ${notice ? "text-[#ffb340]" : ""}`}
                  title={notice ?? pose?.title}
                >
                  {notice ?? pose?.title ?? ""}
                </motion.span>
              </AnimatePresence>
            </motion.div>
          )}
          {!isSession && phase === "paused" && <span className="text-[13px] font-medium text-white/60">Paused</span>}

          {/* Controls */}
          <motion.div layout="position" className="flex items-center">
            <button
              type="button"
              onClick={() => (running ? session.pause() : session.resume())}
              disabled={phase === "loading"}
              aria-label={running ? "Pause" : "Resume"}
              data-tip={running ? "Pause" : "Resume"}
              data-tip-kbd="Space"
              className={`${btn} disabled:opacity-40`}
            >
              {running || phase === "loading" ? (
                <Pause size={icon} fill="currentColor" aria-hidden />
              ) : (
                <Play size={icon} fill="currentColor" aria-hidden />
              )}
            </button>
            {isSession && (
              <button
                type="button"
                onClick={() => session.next()}
                disabled={phase === "loading"}
                aria-label="Next pose"
                data-tip="Next pose"
                data-tip-kbd="→"
                className={`${btn} disabled:opacity-40`}
              >
                <SkipForward size={icon} fill="currentColor" aria-hidden />
              </button>
            )}
            {canKeep && (
              <button
                type="button"
                onClick={() => pose && session.toggleKeep(pose.id)}
                disabled={!pose}
                aria-pressed={!!pose?.kept}
                aria-label={pose?.kept ? "Don't keep this pose" : "Keep this pose"}
                data-tip={pose?.kept ? "Kept: you can save it at the end" : "Keep this pose"}
                className={`${btn} ${pose?.kept ? "text-[#ffd60a] hover:text-[#ffd60a]" : ""}`}
              >
                <motion.span
                  key={String(pose?.kept)}
                  initial={{ scale: pose?.kept ? 0.6 : 1 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", bounce: 0.5, duration: 0.35 }}
                  className="flex"
                >
                  <Star size={icon} fill={pose?.kept ? "currentColor" : "none"} aria-hidden />
                </motion.span>
              </button>
            )}
            <button
              type="button"
              onClick={() => session.stop()}
              aria-label={isSession ? "End session" : "Stop timer"}
              data-tip={isSession ? "End session" : "Stop"}
              className={btn}
            >
              <Square size={docked ? 11 : 13} fill="currentColor" aria-hidden />
            </button>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

/** "3, 2, 1" over the stage before the first pose of a session. */
export function ReadyOverlay() {
  const phase = useSession((s) => s.phase);
  const num = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (phase !== "ready") return;
    let raf = 0;
    let last = "";
    const tick = () => {
      const left = Math.max(0, session.get().endsAt - performance.now());
      const n = String(Math.max(1, Math.ceil(left / 1000)));
      if (n !== last && num.current) {
        last = n;
        num.current.textContent = n;
        // Re-trigger the pop for each new number.
        num.current.animate(
          [
            { transform: "scale(1.35)", opacity: 0 },
            { transform: "scale(1)", opacity: 1, offset: 0.25 },
            { transform: "scale(0.92)", opacity: 0.85 },
          ],
          { duration: 1000, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  return (
    <AnimatePresence>
      {phase === "ready" && (
        <motion.div
          key="ready"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center"
          role="status"
          aria-live="polite"
        >
          <div className="timer-capsule flex flex-col items-center rounded-[28px] px-10 pt-5 pb-6 text-white">
            <span className="text-[13px] font-medium text-white/60">Get ready</span>
            <span ref={num} className="text-[64px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
              3
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
