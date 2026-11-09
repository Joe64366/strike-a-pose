"use client";

import { PencilLine, Pin, PinOff, RotateCcw, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { springSnappy } from "@/lib/motion";
import type { PoseEntry } from "@/lib/poses";

export type MenuRequest = {
  entry: PoseEntry;
  /** Where to open: the trigger button, or the pointer for a right-click. */
  anchor: { x: number; y: number };
  /** Element to return focus to on close. */
  returnFocus?: HTMLElement | null;
  /** Opened from the "…" button (vs. right-click). */
  fromButton?: boolean;
};

const MARGIN = 8;

export function PoseMenu({
  request,
  onClose,
  onTogglePin,
  onRename,
  onResetPose,
  onDelete,
}: {
  request: MenuRequest;
  onClose: () => void;
  onTogglePin: (entry: PoseEntry) => void;
  onRename: (entry: PoseEntry) => void;
  /** Omitted when the pose is already at rest. */
  onResetPose?: (entry: PoseEntry) => void;
  onDelete: (entry: PoseEntry) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { entry, anchor } = request;
  const pinned = !!entry.pinnedAt;

  // Open below-right of the anchor; flip up/left if it would leave the
  // viewport. transform-origin sits on the anchor so it grows out of it.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const { offsetWidth: w, offsetHeight: h } = node;
    const flipY = anchor.y + h > window.innerHeight - MARGIN;
    const flipX = anchor.x + w > window.innerWidth - MARGIN;
    const x = Math.max(MARGIN, flipX ? anchor.x - w : anchor.x);
    const y = Math.max(MARGIN, flipY ? anchor.y - h : anchor.y);
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.style.transformOrigin = `${flipX ? "right" : "left"} ${flipY ? "bottom" : "top"}`;
    node.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
  }, [anchor]);

  useEffect(() => {
    const close = () => onClose();
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      // A "…" trigger toggles the menu itself on click.
      if (request.fromButton && request.returnFocus?.contains(t)) return;
      if (!ref.current?.contains(t)) onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose, request.returnFocus, request.fromButton]);

  const closeAndRefocus = () => {
    onClose();
    request.returnFocus?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeAndRefocus();
    } else if (e.key === "Tab") {
      e.preventDefault();
      closeAndRefocus();
    }
  };

  const run = (action: (entry: PoseEntry) => void) => () => {
    onClose();
    action(entry);
  };

  return createPortal(
    <motion.div
      ref={ref}
      role="menu"
      aria-label={`Actions for “${entry.title}”`}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
      transition={springSnappy}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className="menu-surface fixed z-[90] w-[200px] rounded-[12px] p-[5px] text-[13px] text-label"
    >
      <MenuItem icon={pinned ? <PinOff size={15} /> : <Pin size={15} />} onSelect={run(onTogglePin)}>
        {pinned ? "Unpin" : "Pin"}
      </MenuItem>
      <MenuItem icon={<PencilLine size={15} />} shortcut="F2" onSelect={run(onRename)}>
        Rename
      </MenuItem>
      {onResetPose && (
        <MenuItem icon={<RotateCcw size={15} />} onSelect={run(onResetPose)}>
          Reset pose
        </MenuItem>
      )}
      <div role="separator" className="mx-2 my-[5px] h-px bg-fill-strong" />
      <MenuItem icon={<Trash2 size={15} />} shortcut="Del" destructive onSelect={run(onDelete)}>
        Delete
      </MenuItem>
    </motion.div>,
    document.body,
  );
}

function MenuItem({
  icon,
  shortcut,
  destructive,
  onSelect,
  children,
}: {
  icon: ReactNode;
  shortcut?: string;
  destructive?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onSelect}
      // Hover and keyboard focus share one highlight, like a native menu.
      onPointerMove={(e) => e.currentTarget.focus({ preventScroll: true })}
      className={`flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2 text-left outline-none focus-visible:outline-none ${
        destructive ? "text-danger focus:bg-danger focus:text-white" : "focus:bg-accent focus:text-on-accent"
      } group`}
    >
      <span className={`flex w-4 justify-center ${destructive ? "" : "text-label-2 group-focus:text-on-accent"}`} aria-hidden>
        {icon}
      </span>
      <span className="flex-1">{children}</span>
      {shortcut && (
        <span className={`text-[12px] ${destructive ? "opacity-70" : "text-label-3 group-focus:text-on-accent/75"}`}>
          {shortcut}
        </span>
      )}
    </button>
  );
}
