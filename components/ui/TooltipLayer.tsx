"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { springSnappy } from "@/lib/motion";

/**
 * One tooltip for the whole app. Any element opts in with attributes:
 *
 *   <button data-tip="Hide sidebar" data-tip-kbd="/" data-tip-side="bottom">
 *
 * Behaves like macOS help tags: a short delay before the first one, then
 * instant while you sweep across neighbouring controls. Pressing,
 * scrolling or Escape dismisses it.
 */

type Side = "top" | "bottom" | "left" | "right";
type Tip = { el: HTMLElement; label: string; kbd?: string; side: Side; key: number };

const FIRST_DELAY_MS = 500;
const WARM_WINDOW_MS = 600;
const GAP = 8;
const MARGIN = 8;

function readTip(el: HTMLElement, key: number): Tip | null {
  const label = el.dataset.tip;
  if (!label) return null;
  return {
    el,
    label,
    kbd: el.dataset.tipKbd,
    side: (el.dataset.tipSide as Side) ?? "bottom",
    key,
  };
}

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Portals need document.body, which only exists after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);

    let current: HTMLElement | null = null;
    let suppressed: HTMLElement | null = null; // pressed: stay quiet until the pointer leaves
    let visible = false;
    let warmUntil = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let key = 0;

    const target = (node: EventTarget | null) =>
      node instanceof Element ? node.closest<HTMLElement>("[data-tip]") : null;

    const show = (el: HTMLElement, immediate = false) => {
      if (el === current || el === suppressed) return;
      if (el.getAttribute("aria-expanded") === "true") return;
      clearTimeout(timer);
      current = el;
      const delay = immediate || performance.now() < warmUntil ? 0 : FIRST_DELAY_MS;
      timer = setTimeout(() => {
        if (current !== el || !el.isConnected) return;
        const next = readTip(el, ++key);
        visible = !!next;
        setTip(next);
      }, delay);
    };

    const hide = () => {
      clearTimeout(timer);
      if (visible) warmUntil = performance.now() + WARM_WINDOW_MS;
      visible = false;
      current = null;
      setTip(null);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = target(e.target);
      if (el !== suppressed) suppressed = null;
      if (el) show(el);
      else if (current) hide();
    };
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) {
        suppressed = null;
        if (current) hide();
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = target(e.target);
      if (el && el === e.target && el.matches(":focus-visible")) show(el, true);
    };
    const onDismiss = () => {
      if (current) suppressed = current;
      hide();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && current) onDismiss();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", onDismiss, true);
    document.addEventListener("wheel", onDismiss, { capture: true, passive: true });
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", onDismiss, true);
      document.removeEventListener("wheel", onDismiss, true);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>{tip && <TooltipBubble key={tip.key} tip={tip} />}</AnimatePresence>,
    document.body,
  );
}

const ORIGIN: Record<Side, string> = {
  top: "center bottom",
  bottom: "center top",
  left: "right center",
  right: "left center",
};
const NUDGE: Record<Side, { x?: number; y?: number }> = {
  top: { y: 3 },
  bottom: { y: -3 },
  left: { x: 3 },
  right: { x: -3 },
};

function TooltipBubble({ tip }: { tip: Tip }) {
  const box = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<Side>(tip.side);

  // Measure, then place beside the trigger, flipping if it would leave the
  // viewport and clamping to the edges.
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const r = tip.el.getBoundingClientRect();
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let s = tip.side;
    if (s === "bottom" && r.bottom + GAP + h > vh - MARGIN) s = "top";
    else if (s === "top" && r.top - GAP - h < MARGIN) s = "bottom";
    else if (s === "right" && r.right + GAP + w > vw - MARGIN) s = "left";
    else if (s === "left" && r.left - GAP - w < MARGIN) s = "right";

    let x: number;
    let y: number;
    if (s === "top" || s === "bottom") {
      x = r.left + r.width / 2 - w / 2;
      y = s === "bottom" ? r.bottom + GAP : r.top - GAP - h;
    } else {
      x = s === "right" ? r.right + GAP : r.left - GAP - w;
      y = r.top + r.height / 2 - h / 2;
    }
    x = Math.min(Math.max(x, MARGIN), vw - MARGIN - w);
    y = Math.min(Math.max(y, MARGIN), vh - MARGIN - h);
    node.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    // Placement is measured from the DOM, so it can only be known here.
    setSide(s);
  }, [tip]);

  return (
    <div ref={box} className="pointer-events-none fixed top-0 left-0 z-[100]" role="tooltip">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, ...NUDGE[side] }}
        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}
        transition={springSnappy}
        style={{ transformOrigin: ORIGIN[side] }}
        className="tooltip flex max-w-[260px] items-center gap-2 rounded-[9px] px-2.5 py-[5px] text-[12px] leading-[16px] font-medium"
      >
        <span className="min-w-0">{tip.label}</span>
        {tip.kbd && <kbd className="tooltip-kbd">{tip.kbd}</kbd>}
      </motion.div>
    </div>
  );
}
