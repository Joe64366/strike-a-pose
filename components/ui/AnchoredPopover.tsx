"use client";

import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type PopoverAnchor = { rect: DOMRect; returnFocus: HTMLElement | null };

const MARGIN = 12;

/**
 * A popover that grows out of the button that opened it (like Settings):
 * below it when there's room, otherwise above, never off-screen. Closes on
 * a click outside, Escape (focus goes back to the button) or a resize. The
 * stage stays visible and live behind it; no dimming, since it's a glance,
 * not a task.
 */
export function AnchoredPopover({
  anchor,
  onClose,
  label,
  width = 340,
  className = "",
  children,
}: {
  anchor: PopoverAnchor;
  onClose: () => void;
  label: string;
  width?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const { rect } = anchor;
    const h = node.offsetHeight;
    const spaceBelow = window.innerHeight - MARGIN - (rect.bottom + 8);
    const spaceAbove = rect.top - 8 - MARGIN;
    // Below if it fits, else above if that fits; too tall for either, it
    // takes the roomier side and scrolls inside, never covering its button.
    const below = h <= spaceBelow || (h > spaceAbove && spaceBelow >= spaceAbove);
    const room = below ? spaceBelow : spaceAbove;
    node.style.maxHeight = `${Math.max(160, room)}px`;
    const fitted = Math.min(h, room);
    const top = below ? rect.bottom + 8 : rect.top - 8 - fitted;
    const left = Math.min(Math.max(MARGIN, rect.left), window.innerWidth - MARGIN - node.offsetWidth);
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
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
      anchor.returnFocus?.focus({ preventScroll: true });
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
      aria-label={label}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14 } }}
      style={{ width }}
      className={`menu-surface fixed z-[80] flex max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[18px] text-label ${className}`}
    >
      {children}
    </motion.div>,
    document.body,
  );
}
