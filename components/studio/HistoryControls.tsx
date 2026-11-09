"use client";

import { Redo2, Undo2 } from "lucide-react";
import { useSyncExternalStore } from "react";

const noop = () => () => {};
/** "⌘" on Apple platforms, "Ctrl " elsewhere. */
function useModKey() {
  return useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl "),
    () => "Ctrl ",
  );
}

/** Undo/redo for hand-posing edits on the open pose. */
export function HistoryControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const mod = useModKey();
  const btn =
    "pressable flex size-[30px] items-center justify-center rounded-full text-label-2 enabled:hover:bg-fill enabled:hover:text-label disabled:text-label-3 disabled:opacity-50";

  return (
    <div className="material pointer-events-auto hidden h-9 items-center rounded-full p-[3px] sm:flex">
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
        data-tip={canUndo ? "Undo" : undefined}
        data-tip-kbd={`${mod}Z`}
        className={btn}
      >
        <Undo2 size={16} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="Redo"
        data-tip={canRedo ? "Redo" : undefined}
        data-tip-kbd={`${mod}⇧Z`}
        className={btn}
      >
        <Redo2 size={16} aria-hidden />
      </button>
    </div>
  );
}
