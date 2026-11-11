"use client";

import { cameraBridge } from "./cameraViews";
import { DEFAULT_LIGHTING, lightingStore, type Lighting } from "./lighting";
import { DEFAULT_FISHEYE, perspective, type FisheyeLook } from "./perspective";
import type { PoseEntry } from "./poses";

/**
 * A pose's look: its lighting and its fish-eye lens. Each saved pose keeps
 * its own; the default pose ("New pose") always starts with default
 * lighting and the lens off, and what you change there isn't saved (unless
 * the default pose becomes a saved pose, which then keeps it).
 */
export interface PoseLook {
  lighting: Lighting;
  fisheye: FisheyeLook;
}

/** The look on stage now (with the lens on, the angle it's looking from). */
export function currentLook(): PoseLook {
  const fisheye = perspective.look();
  const view = fisheye.on ? cameraBridge.get() : null;
  return { lighting: lightingStore.get(), fisheye: view ? { ...fisheye, view } : fisheye };
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

let applying = false;
/** The stores are changing because a pose was opened (not an edit to keep). */
export const isShowingLook = () => applying;

/** Put a pose's look on stage (the default look for the default pose). */
export function showLook(entry: PoseEntry | null | undefined) {
  const lighting = entry?.lighting ?? DEFAULT_LIGHTING;
  const fisheye = entry?.fisheye ?? DEFAULT_FISHEYE;
  applying = true;
  try {
    if (!same(lighting, lightingStore.get())) lightingStore.load(lighting);
    if (!same(fisheye, perspective.look())) perspective.load(fisheye);
  } finally {
    applying = false;
  }
}

let carried: string | null = null;

/**
 * A new pose made from what's on stage (editing the default pose, a prompt
 * from it, saving an angle of it) keeps the look you gave it.
 */
export function withCurrentLook<T extends PoseEntry>(entry: T): T {
  carried = entry.id;
  return { ...entry, ...currentLook() };
}

/** The pose just opened already has the look on stage (read once). */
export function takeCarried(id: string | null): boolean {
  if (!id || carried !== id) return false;
  carried = null;
  return true;
}
