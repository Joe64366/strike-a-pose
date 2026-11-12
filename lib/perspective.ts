"use client";

import { useSyncExternalStore } from "react";

/**
 * Fish-eye lens: curvilinear perspective. The camera captures the scene in
 * every direction and re-projects it through a fish-eye lens, so straight
 * lines bow into curves as in curvilinear drawing. Optional guide lines
 * (parallel to the floor grid) show how the space bends.
 *
 * The lens is only a way of seeing: turning it on or off never moves the
 * camera, so you look from exactly the same place either way.
 */

export interface PerspectiveSettings {
  /** Degrees of view from the centre to the top edge. */
  curvature: number;
  guides: boolean;
  dense: boolean;
}

export const CURVE_MIN = 45;
export const CURVE_MAX = 85;

const DEFAULTS: PerspectiveSettings = { curvature: 65, guides: false, dense: false };

/**
 * The lens as a pose keeps it (PoseEntry.fisheye): on or off, and its
 * settings. The default pose always starts with DEFAULT_FISHEYE.
 */
export interface FisheyeLook extends PerspectiveSettings {
  on: boolean;
}

export const DEFAULT_FISHEYE: FisheyeLook = { on: false, ...DEFAULTS };

let settings = DEFAULTS;
const listeners = new Set<() => void>();

const num = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

/** A lens read back from storage, with anything missing or out of range fixed. */
export function sanitizeFisheye(input: unknown): FisheyeLook {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<FisheyeLook>;
  return {
    on: raw.on === true,
    curvature: num(raw.curvature, CURVE_MIN, CURVE_MAX, DEFAULTS.curvature),
    guides: typeof raw.guides === "boolean" ? raw.guides : DEFAULTS.guides,
    dense: raw.dense === true,
  };
}

/** Mode state that isn't saved. */
interface PerspectiveUi {
  on: boolean;
  /** Its menu is showing (separate from the lens being on). */
  open: boolean;
}
let ui: PerspectiveUi = { on: false, open: false };
const SERVER_UI = ui;

function emit() {
  listeners.forEach((l) => l());
}

export const perspective = {
  get() {
    return settings;
  },
  ui: () => ui,
  set(patch: Partial<PerspectiveSettings>) {
    settings = { ...settings, ...patch };
    emit();
  },
  /** The lens as the open pose keeps it. */
  look(): FisheyeLook {
    return { on: ui.on, ...settings };
  },
  /** Show a pose's lens (switching poses). */
  load({ on, ...next }: FisheyeLook) {
    settings = { curvature: next.curvature, guides: next.guides, dense: next.dense };
    ui = { ...ui, on };
    emit();
  },
  setUi(patch: Partial<PerspectiveUi>) {
    ui = { ...ui, ...patch };
    emit();
  },
  /** Turn the lens on or off (the camera stays where it is). */
  toggle(on: boolean) {
    ui = { ...ui, on };
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
