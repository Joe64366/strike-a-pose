"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { springSnappy } from "@/lib/motion";

/**
 * Apple-style alert for destructive actions: a centred card over a dimmed
 * stage, a plain-language title, and two buttons. Cancel is focused first
 * (the safe choice); Escape or clicking outside cancels; Tab stays inside.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    cancelBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === "Tab") {
        const buttons = [...(card.current?.querySelectorAll("button") ?? [])];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      before?.focus?.({ preventScroll: true });
    };
  }, [open, onCancel]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="confirm"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onCancel();
          }}
        >
          <motion.div
            ref={card}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
            transition={springSnappy}
            className="menu-surface w-[300px] max-w-full rounded-[18px] p-5 text-center"
          >
            <h2 id={titleId} className="text-[15px] leading-snug font-semibold text-label">
              {title}
            </h2>
            <p id={messageId} className="mt-1.5 text-[13px] leading-snug text-label-2">
              {message}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                ref={cancelBtn}
                type="button"
                onClick={onCancel}
                className="pressable h-9 rounded-[10px] bg-fill text-[13px] font-semibold text-label hover:bg-fill-strong"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="pressable h-9 rounded-[10px] bg-danger text-[13px] font-semibold text-white hover:brightness-110"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
