"use client";

import { useSyncExternalStore } from "react";
import type { CameraView } from "./cameraViews";

/**
 * Fish-eye lens: curvilinear perspective. The camera captures the scene in
 * every direction and re-projects it through a fish-eye lens, so straight
 * lines bow into curves as in curvilinear drawing. Optional guide lines
 * (parallel to the floor grid) show how the space bends.
 */

export interface PerspectiveSettings {
  /** Degrees of view from the centre to the top edge. */
  curvature: number;
  /** Camera (eye) height in metres. */
  eye: number;
  guides: boolean;
  dense: boolean;
}

export const CURVE_MIN = 45;
export const CURVE_MAX = 85;

/** Eye-level marks along the slider (metres). */
export const EYE_MARKS = [
  { at: 0.15, name: "Ground" },
  { at: 1.0, name: "Waist" },
  { at: 1.6, name: "Eyes" },
  { at: 2.6, name: "Above" },
] as const;
export const EYE_MIN = 0.1;
export const EYE_MAX = 4;

const DEFAULTS: PerspectiveSettings = { curvature: 65, eye: 1.2, guides: true, dense: false };

/**
 * The lens as a pose keeps it (PoseEntry.fisheye): on or off, its settings,
 * and the fish-eye angle it was last seen from. The default pose always
 * starts with DEFAULT_FISHEYE.
 */
export interface FisheyeLook extends PerspectiveSettings {
  on: boolean;
  view?: CameraView;
}

export const DEFAULT_FISHEYE: FisheyeLook = { on: false, ...DEFAULTS };

let settings = DEFAULTS;
const listeners = new Set<() => void>();
// See `fisheyeViews` below.
let lastFisheye: CameraView | null = null;
let pending: CameraView | null = null;
let switching = false;

const num = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

const isV3 = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));

/** A lens read back from storage, with anything missing or out of range fixed. */
export function sanitizeFisheye(input: unknown): FisheyeLook {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<FisheyeLook>;
  const view = raw.view && isV3(raw.view.position) && isV3(raw.view.target) ? raw.view : undefined;
  return {
    on: raw.on === true,
    curvature: num(raw.curvature, CURVE_MIN, CURVE_MAX, DEFAULTS.curvature),
    eye: num(raw.eye, EYE_MIN, EYE_MAX, DEFAULTS.eye),
    guides: typeof raw.guides === "boolean" ? raw.guides : DEFAULTS.guides,
    dense: raw.dense === true,
    ...(view ? { view: { position: view.position, target: view.target } } : {}),
  };
}

/** Mode state that isn't saved. */
interface PerspectiveUi {
  on: boolean;
  /** Its menu is showing (separate from the lens being on). */
  open: boolean;
  /** Bumped to re-frame the camera (mode on, curvature or eye level changed). */
  aim: number;
}
let ui: PerspectiveUi = { on: false, open: false, aim: 0 };
const SERVER_UI = ui;

function emit() {
  listeners.forEach((l) => l());
}

export const perspective = {
  get() {
    return settings;
  },
  ui: () => ui,
  set(patch: Partial<PerspectiveSettings>, reframe = true) {
    settings = { ...settings, ...patch };
    if (reframe) ui = { ...ui, aim: ui.aim + 1 };
    emit();
  },
  /** The lens as the open pose would keep it (its last fish-eye angle included). */
  look(): FisheyeLook {
    return { on: ui.on, ...settings, ...(lastFisheye ? { view: lastFisheye } : {}) };
  },
  /**
   * Show a pose's lens (switching poses): its settings, on or off, and back
   * to the fish-eye angle it was left at.
   */
  load({ on, view, ...next }: FisheyeLook) {
    settings = next;
    lastFisheye = view ?? null;
    pending = on && view ? view : null;
    switching = true;
    ui = { ...ui, on, aim: ui.aim + 1 };
    emit();
  },
  setUi(patch: Partial<PerspectiveUi>) {
    ui = { ...ui, ...patch };
    emit();
  },
  /** Turn the lens on or off. */
  toggle(on: boolean) {
    ui = { ...ui, on, aim: ui.aim + 1 };
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function usePerspective(): PerspectiveSettings {
  return useSyncExternalStore(perspective.subscribe, perspective.get, () => DEFAULTS);
}

export function usePerspectiveUi<T>(pick: (s: PerspectiveUi) => T): T {
  return useSyncExternalStore(
    perspective.subscribe,
    () => pick(ui),
    () => pick(SERVER_UI),
  );
}

/** Guide colours per axis (matching the floor grid's directions). */
export const AXIS_COLORS = { x: "#f03e3e", y: "#2f9e44", z: "#1c7ed6", horizon: "#f59f00" } as const;

/* ------------------------------------------- remembered and requested angles */

/**
 * Angles the lens uses instead of its own framing:
 *  - the open pose's last fish-eye view, so turning it back on carries on there;
 *  - a saved camera angle to land on when the lens switches on or off.
 */
export const fisheyeViews = {
  /** The lens was turned off here: kept with the open pose. */
  remember(view: CameraView) {
    lastFisheye = view;
    emit();
  },
  last: () => lastFisheye,
  setPending(view: CameraView | null) {
    pending = view;
  },
  takePending() {
    const view = pending;
    pending = null;
    return view;
  },
  /**
   * The last change came from switching poses (read once): the angle being
   * left belongs to the previous pose, not the one now open.
   */
  takeSwitch() {
    const was = switching;
    switching = false;
    return was;
  },
};
