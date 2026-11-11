"use client";

import { PersonStanding, Star } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { formatClock, session, useSession, type SessionPose } from "@/lib/drawingTimer";

/**
 * The end of a pose session: every pose you drew, as a contact sheet. Starred
 * ones (★ while drawing) are pre-selected; one button saves them to history.
 * Nothing is saved unless you say so.
 */
export function SessionSummary({ onSave }: { onSave: (poses: SessionPose[]) => void }) {
  const open = useSession((s) => s.phase === "summary");
  return <AnimatePresence>{open && <Sheet key="summary" onSave={onSave} />}</AnimatePresence>;
}

function Sheet({ onSave }: { onSave: (poses: SessionPose[]) => void }) {
  const poses = useSession((s) => s.poses);
  const drawnMs = useSession((s) => s.drawnMs);
  const kept = poses.filter((p) => p.kept);
  const primary = useRef<HTMLButtonElement>(null);
  const allKept = kept.length === poses.length;

  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        session.dismiss();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const save = () => {
    onSave(kept);
    session.dismiss();
  };
  const toggleAll = () => {
    for (const p of poses) if (p.kept === allKept) session.toggleKeep(p.id);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/35"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => session.dismiss()}
        aria-hidden
      />
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="summary-title"
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.14 } }}
        className="menu-surface relative flex max-h-[min(720px,calc(100dvh-32px))] w-[640px] max-w-full flex-col rounded-[22px] text-label"
      >
        <header className="px-5 pt-5 pb-3">
          <h2 id="summary-title" className="text-[19px] font-semibold tracking-[-0.02em]">
            Session complete
          </h2>
          <p className="text-[13px] text-label-2 tabular-nums">
            {poses.length} {poses.length === 1 ? "pose" : "poses"} · {formatClock(drawnMs)} drawing
          </p>
        </header>

        <div className="flex items-center justify-between px-5 pb-2">
          <p className="text-[12px] text-label-3">Star the poses you want to keep in your history.</p>
          <button type="button" onClick={toggleAll} className="pressable text-[12px] font-medium text-accent hover:text-accent-hover">
            {allKept ? "Clear all" : "Select all"}
          </button>
        </div>

        <ul className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5 overflow-y-auto px-5 pt-1 pb-4">
          {poses.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => session.toggleKeep(p.id)}
                aria-pressed={p.kept}
                aria-label={`${p.title}${p.kept ? ", kept" : ""}`}
                className={`group relative block w-full overflow-hidden rounded-[12px] text-left outline-none transition-shadow duration-200 ${
                  p.kept ? "shadow-[0_0_0_2px_var(--accent)]" : "shadow-[0_0_0_0.5px_var(--material-stroke)] hover:shadow-[0_0_0_2px_var(--fill-strong)] focus-visible:shadow-[0_0_0_2px_var(--accent)]"
                }`}
              >
                <span className="flex aspect-[7/10] items-center justify-center bg-[var(--stage)]">
                  {p.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- in-memory data URL
                    <img src={p.thumb} alt="" className="size-full object-cover" />
                  ) : (
                    <PersonStanding size={28} className="text-label-3" aria-hidden />
                  )}
                </span>
                <span className="absolute top-1.5 left-1.5 rounded-full bg-black/45 px-1.5 text-[10px] leading-[16px] font-semibold text-white tabular-nums">
                  {i + 1}
                </span>
                <span
                  className={`absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full ${
                    p.kept ? "bg-accent text-white" : "bg-black/35 text-white/85 opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <Star size={13} fill={p.kept ? "currentColor" : "none"} aria-hidden />
                </span>
                <span className="block truncate bg-[var(--material)] px-2 py-1.5 text-[12px] font-medium">{p.title}</span>
              </button>
            </li>
          ))}
        </ul>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--material-stroke)] px-5 py-3.5">
          <button
            type="button"
            onClick={() => session.dismiss()}
            className="pressable h-9 rounded-[10px] px-4 text-[14px] font-medium text-label hover:bg-fill"
          >
            {kept.length ? "Don't save" : "Done"}
          </button>
          <button
            ref={primary}
            type="button"
            onClick={save}
            disabled={!kept.length}
            className="pressable h-9 rounded-[10px] bg-accent px-4 text-[14px] font-semibold text-on-accent enabled:hover:bg-accent-hover disabled:opacity-40"
          >
            {kept.length ? `Save ${kept.length} to history` : "Save to history"}
          </button>
        </footer>
      </motion.section>
    </div>
  );
}
