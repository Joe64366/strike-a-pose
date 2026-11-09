"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseData } from "@/lib/poseMath";
import { createUntitledEntry, type PoseEntry } from "@/lib/poses";
import { poseStore } from "@/lib/poseStore";
import type { usePoseHistory } from "@/lib/usePoseHistory";

/** Shared "nothing moved" pose; a stable reference so it never re-triggers loads. */
export const REST_POSE: PoseData = {};
const MAX_UNDO = 100;

type Stacks = { undo: PoseData[]; redo: PoseData[] };

/**
 * Connects hand-posing to saved poses:
 * - shows the active entry's pose (or the rest pose) on the figure
 * - saves every finished edit into the active entry
 * - editing the default pose creates an "Untitled pose" entry
 * - keeps an undo/redo history per entry
 */
export function usePoseEditing(
  history: ReturnType<typeof usePoseHistory>,
  activeId: string | null,
  setActiveId: (id: string | null) => void,
) {
  const stacks = useRef(new Map<string, Stacks>());
  // Mirror of stack sizes for rendering the undo/redo buttons.
  const [sizes, setSizes] = useState<Record<string, [number, number]>>({});
  const sync = (id: string) => {
    const s = stacks.current.get(id);
    setSizes((prev) => ({ ...prev, [id]: [s?.undo.length ?? 0, s?.redo.length ?? 0] }));
  };
  const latest = useRef({ history, activeId, setActiveId });
  useEffect(() => {
    latest.current = { history, activeId, setActiveId };
  });

  const stackFor = (id: string) => {
    let s = stacks.current.get(id);
    if (!s) stacks.current.set(id, (s = { undo: [], redo: [] }));
    return s;
  };

  const active = history.entries.find((e) => e.id === activeId) ?? null;
  const activePose = active?.pose ?? REST_POSE;

  // Show the selected entry's pose. After a save the store already holds
  // this exact object, so this only animates on real switches and undos.
  useEffect(() => {
    if (poseStore.get().pose !== activePose) poseStore.load(activePose);
  }, [activePose]);

  useEffect(() => {
    poseStore.onCommit((prev, next) => {
      const { history, activeId, setActiveId } = latest.current;
      let id = activeId;
      if (!id) {
        const entry = createUntitledEntry(next);
        history.add(entry);
        setActiveId(entry.id);
        id = entry.id;
      } else {
        history.update(id, { pose: next });
      }
      const s = stackFor(id);
      s.undo.push(prev);
      if (s.undo.length > MAX_UNDO) s.undo.shift();
      s.redo = [];
      sync(id);
    });
    return () => poseStore.onCommit(null);
  }, []);

  const step = useCallback((direction: "undo" | "redo") => {
    const { history, activeId } = latest.current;
    if (!activeId) return;
    const entry = history.entries.find((e) => e.id === activeId);
    const s = stacks.current.get(activeId);
    const from = direction === "undo" ? s?.undo : s?.redo;
    const to = direction === "undo" ? s?.redo : s?.undo;
    const pose = from?.pop();
    if (!entry || !pose || !to) return;
    to.push(entry.pose);
    history.update(activeId, { pose });
    sync(activeId);
  }, []);

  /** Replace an entry's pose from outside (an AI result), undoably. */
  const applyPose = useCallback((id: string, next: PoseData) => {
    const { history } = latest.current;
    const entry = history.entries.find((e) => e.id === id);
    const s = stackFor(id);
    s.undo.push(entry?.pose ?? REST_POSE);
    if (s.undo.length > MAX_UNDO) s.undo.shift();
    s.redo = [];
    history.update(id, { pose: next });
    sync(id);
  }, []);

  /** Reset any entry's pose to rest, undoably. */
  const resetPose = useCallback((entry: PoseEntry) => {
    const { history, activeId } = latest.current;
    if (entry.id === activeId) {
      poseStore.replace(REST_POSE);
      return;
    }
    const s = stackFor(entry.id);
    s.undo.push(entry.pose);
    s.redo = [];
    history.update(entry.id, { pose: REST_POSE });
    sync(entry.id);
  }, []);

  const [undoCount, redoCount] = (activeId && sizes[activeId]) || [0, 0];
  return {
    canUndo: undoCount > 0,
    canRedo: redoCount > 0,
    undo: useCallback(() => step("undo"), [step]),
    redo: useCallback(() => step("redo"), [step]),
    resetPose,
    applyPose,
  };
}
