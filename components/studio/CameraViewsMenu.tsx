"use client";

import { Camera, Check, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { springSnappy } from "@/lib/motion";
import {
  cameraBridge,
  describeView,
  MAX_VIEWS,
  sameView,
  type SavedView,
} from "@/lib/cameraViews";

export type ViewsAnchor = { rect: DOMRect; returnFocus: HTMLElement | null };

const MARGIN = 12;

/**
 * Camera angles kept with the open pose: save the view you're drawing from,
 * and come back to it exactly after orbiting away (or after the pose
 * changes). A popover from its top-bar button.
 */
export function CameraViewsMenu({
  anchor,
  poseTitle,
  views,
  onSave,
  onGo,
  onDelete,
  onClose,
}: {
  anchor: ViewsAnchor;
  /** The pose the angles belong to (null: the default pose; saving creates one). */
  poseTitle: string | null;
  views: SavedView[];
  onSave: () => void;
  onGo: (view: SavedView) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const full = views.length >= MAX_VIEWS;
  // Which saved angle the camera is at right now (rechecked as it glides).
  const [currentId, setCurrentId] = useState<string | null>(null);
  useEffect(() => {
    const check = () => {
      const now = cameraBridge.get();
      setCurrentId(
        now ? (views.find((v) => sameView(v, now))?.id ?? null) : null,
      );
    };
    check();
    const t = setInterval(check, 250);
    return () => clearInterval(t);
  }, [views]);

  // Below the button, right-aligned to it.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const { rect } = anchor;
    const top = rect.bottom + 8;
    const left = Math.min(
      Math.max(MARGIN, rect.right - node.offsetWidth),
      window.innerWidth - MARGIN - node.offsetWidth,
    );
    node.style.top = `${top}px`;
    node.style.left = `${left}px`;
    node.style.transformOrigin = `${rect.left + rect.width / 2 - left}px 0`;
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
      aria-label="Camera angles"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14 } }}
      className="menu-surface fixed z-[80] flex max-h-[calc(100dvh-80px)] w-[320px] max-w-[calc(100vw-24px)] flex-col rounded-[18px] text-label"
    >
      <header className="flex items-start justify-between px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
            Camera angles
          </h2>
          <p className="truncate text-[12px] text-label-3">
            {poseTitle
              ? `Saved with “${poseTitle}”`
              : "Saving one keeps this pose too"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="pressable -mt-0.5 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-label-2 hover:bg-fill hover:text-label"
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      <div className="px-4">
        <button
          type="button"
          onClick={onSave}
          // Already at a saved angle: saving again would only duplicate it.
          disabled={full || currentId !== null}
          className="pressable flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] bg-accent text-[13.5px] font-semibold text-on-accent enabled:hover:bg-accent-hover disabled:opacity-40"
        >
          {currentId !== null ? <Check size={15} strokeWidth={2.75} aria-hidden /> : <Plus size={15} strokeWidth={2.5} aria-hidden />}
          {currentId !== null ? "This angle is saved" : full ? `Up to ${MAX_VIEWS} angles per pose` : "Save this angle"}
        </button>
      </div>

      {views.length === 0 ? (
        <div className="flex flex-col items-center px-6 pt-6 pb-6 text-center">
          <span className="mb-2 flex size-10 items-center justify-center rounded-full bg-fill text-label-2">
            <Camera size={18} aria-hidden />
          </span>
          <p className="text-[13px] font-medium">No saved angles yet</p>
          <p className="mt-0.5 text-[12px] leading-snug text-label-3">
            Save the view you&rsquo;re drawing from, and come back to it exactly
            whenever you orbit away.
          </p>
        </div>
      ) : (
        <>
          <p
            className="flex items-baseline justify-between px-4 pt-3.5 text-[12px] font-semibold text-label-3"
            aria-live="polite"
          >
            <span>
              {views.length} saved {views.length === 1 ? "angle" : "angles"}
            </span>
            <span className="font-normal tabular-nums">
              {views.length} of {MAX_VIEWS}
            </span>
          </p>
          <ul
            className="grid min-h-0 grid-cols-2 gap-2 overflow-y-auto px-4 pt-2 pb-4"
            aria-label="Saved angles"
          >
            <AnimatePresence initial={false}>
              {[...views].reverse().map((v) => {
                const current = v.id === currentId;
                return (
                  <motion.li
                    key={v.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={springSnappy}
                    className="group relative"
                  >
                    <button
                      type="button"
                      onClick={() => onGo(v)}
                      aria-current={current || undefined}
                      aria-label={`Go to ${describeView(v, v.fisheye)}`}
                      className={`block w-full overflow-hidden rounded-[11px] text-left outline-none transition-shadow duration-200 ${
                        current
                          ? "shadow-[0_0_0_2px_var(--accent)]"
                          : "shadow-[0_0_0_0.5px_var(--material-stroke)] hover:shadow-[0_0_0_2px_var(--fill-strong)] focus-visible:shadow-[0_0_0_2px_var(--accent)]"
                      }`}
                    >
                      <span className="flex aspect-[16/10] items-center justify-center bg-[var(--stage)]">
                        {v.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element -- in-memory data URL
                          <img
                            src={v.thumb}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          <Camera
                            size={18}
                            className="text-label-3"
                            aria-hidden
                          />
                        )}
                      </span>
                      <span className="block bg-[var(--material)] px-2 py-1.5">
                        <span className="block truncate text-[11.5px] leading-tight font-medium">
                          {describeView(v, v.fisheye)}
                        </span>
                        <span
                          className={`block text-[10.5px] leading-tight ${current ? "font-medium text-accent" : "text-label-3"}`}
                        >
                          {current ? "Current" : "Go to this angle"}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(v.id)}
                      aria-label={`Delete ${describeView(v, v.fisheye)}`}
                      data-tip="Delete angle"
                      className="pressable absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm group-hover:opacity-100 hover:bg-black/70 focus-visible:opacity-100"
                    >
                      <X size={13} strokeWidth={2.5} aria-hidden />
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </>
      )}
    </motion.div>,
    document.body,
  );
}
