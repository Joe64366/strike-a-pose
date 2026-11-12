"use client";

import { useSyncExternalStore } from "react";

/**
 * Mirror view (M): the stage shown flipped left to right, like flipping a
 * canvas to check a drawing with fresh eyes. Only the view flips; the pose
 * and everything saved stay as they are. Pointer input, orbiting, labels and
 * the lighting ball all follow the flip so the stage still works mirrored.
 */
let flipped = false;
const listeners = new Set<() => void>();

export const viewFlip = {
  get: () => flipped,
  set(next: boolean) {
    if (next === flipped) return;
    flipped = next;
    listeners.forEach((l) => l());
  },
  toggle() {
    viewFlip.set(!flipped);
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useViewFlip(): boolean {
  return useSyncExternalStore(viewFlip.subscribe, viewFlip.get, () => false);
}
