"use client";

import { Sparkles, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect } from "react";
import { AnchoredPopover, type PopoverAnchor } from "@/components/ui/AnchoredPopover";
import { CHANGELOG, markChangesSeen, type ChangeKind } from "@/lib/changelog";

const KIND: Record<ChangeKind, { label: string; className: string }> = {
  new: { label: "New", className: "bg-accent-fill text-accent" },
  improved: { label: "Improved", className: "bg-[rgb(52_199_89/0.14)] text-[rgb(36_138_61)] dark:text-[rgb(48_209_88)]" },
  fixed: { label: "Fixed", className: "bg-fill text-label-2" },
};

function formatDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** What's New: every release, newest first, or a calm empty state until there is one. */
export function ChangelogPanel({ anchor, onClose }: { anchor: PopoverAnchor; onClose: () => void }) {
  useEffect(() => markChangesSeen(), []);

  return (
    <AnchoredPopover anchor={anchor} onClose={onClose} label="What's New" width={340}>
      <header className="flex items-start justify-between px-4 pt-4 pb-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">What&rsquo;s New</h2>
          <p className="text-[12px] text-label-3">Updates to Strike A Pose</p>
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

      {CHANGELOG.length === 0 ? (
        <div className="flex flex-col items-center px-8 pt-4 pb-8 text-center">
          <motion.span
            initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", bounce: 0.3, duration: 0.5, delay: 0.05 }}
            className="mb-3 flex size-12 items-center justify-center rounded-full bg-accent-fill text-accent"
          >
            <Sparkles size={22} aria-hidden />
          </motion.span>
          <p className="text-[14px] font-semibold">No updates yet</p>
          <p className="mt-1 text-[12.5px] leading-snug text-label-3">
            You&rsquo;re on the first version. New features and fixes will show up here as they arrive.
          </p>
        </div>
      ) : (
        <ol className="scroll-fade min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4" aria-label="Releases">
          {CHANGELOG.map((entry, i) => (
            <li key={entry.version} className={i > 0 ? "mt-4 border-t border-fill-strong pt-4" : ""}>
              <div className="flex items-baseline gap-2">
                <span className="rounded-full bg-fill px-2 py-0.5 text-[11px] font-semibold text-label-2 tabular-nums">
                  {entry.version}
                </span>
                <time dateTime={entry.date} className="text-[11.5px] text-label-3">
                  {formatDate(entry.date)}
                </time>
              </div>
              <p className="mt-1.5 text-[13.5px] font-semibold">{entry.title}</p>
              <ul className="mt-2 flex flex-col gap-2">
                {entry.items.map((item, k) => (
                  <li key={k} className="flex items-start gap-2 text-[12.5px] leading-snug">
                    <span className={`mt-px shrink-0 rounded-[5px] px-1.5 py-px text-[10.5px] font-semibold ${KIND[item.kind].className}`}>
                      {KIND[item.kind].label}
                    </span>
                    <span className="text-label">{item.text}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </AnchoredPopover>
  );
}
