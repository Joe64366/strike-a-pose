"use client";

import { useEffect, useRef, type RefObject } from "react";
import { lightingStore } from "@/lib/lighting";
import { perspective } from "@/lib/perspective";
import { currentLook, isShowingLook, showLook, takeCarried } from "@/lib/poseLook";
import type { usePoseHistory } from "@/lib/usePoseHistory";

/** Lighting drags change every frame: keep the result once they pause. */
const SAVE_DELAY = 300;

/**
 * Lighting and the fish-eye lens belong to the open pose:
 * - opening a pose brings back its look (the default pose: the default look);
 * - changes are kept with the open pose (the default pose's aren't saved);
 * - a pose session keeps the look it started with.
 */
export function usePoseLook(
  history: ReturnType<typeof usePoseHistory>,
  activeId: string | null,
  holdsStage: RefObject<boolean>,
) {
  const latest = useRef(history);
  useEffect(() => {
    latest.current = history;
  });
  /** The pose whose look is on stage. */
  const shown = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const save = () => {
      saveTimer.current = null;
      const id = shown.current;
      if (id) latest.current.update(id, currentLook());
    };
    const changed = () => {
      if (isShowingLook() || !shown.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(save, SAVE_DELAY);
    };
    const offLighting = lightingStore.subscribe(changed);
    const offLens = perspective.subscribe(changed);
    return () => {
      offLighting();
      offLens();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    const left = shown.current;
    if (left === activeId) return;
    shown.current = activeId;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const { entries, update } = latest.current;
    // The pose being left keeps its look as it is now (and where the lens was looking).
    if (left && entries.some((e) => e.id === left)) update(left, currentLook());
    if (holdsStage.current || takeCarried(activeId)) return;
    showLook(entries.find((e) => e.id === activeId));
  }, [activeId, holdsStage]);
}
