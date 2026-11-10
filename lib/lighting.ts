"use client";

import { useSyncExternalStore } from "react";

/**
 * Stage lighting: three named lights in the classic portrait setup, each
 * orbiting the figure and always aimed at it. Directions are stored as
 * angles around the figure, so a light keeps its relationship to the body
 * wherever the figure is moved.
 *
 *   azimuth   0° = in front of the figure, +90° = the figure's left
 *             (camera right in the front view), ±180° = behind
 *   elevation 0° = level with the chest, +90° = straight overhead,
 *             negative = from below
 */

export type LightId = "key" | "fill" | "rim";
export const LIGHT_IDS: LightId[] = ["key", "fill", "rim"];

export const LIGHT_INFO: Record<LightId, { name: string; role: string }> = {
  key: { name: "Key", role: "Main light: sets the shadows" },
  fill: { name: "Fill", role: "Lifts the shadow side" },
  rim: { name: "Rim", role: "Edges the figure from behind" },
};

export interface LightSpec {
  on: boolean;
  azimuth: number;
  elevation: number;
  /** 1 = 100%. */
  intensity: number;
  color: string;
  shadows: boolean;
  /** 0 = crisp shadow edge, 1 = very soft. */
  softness: number;
}

export type Shading = "smooth" | "two" | "three";

export interface Lighting {
  lights: Record<LightId, LightSpec>;
  /** Light bouncing around the room: 0 = black shadows, 1 = very soft. */
  ambient: number;
  shading: Shading;
  /** The preset this matches, or null once edited. */
  preset: PresetId | null;
}

export const MIN_ELEVATION = -80;
export const MAX_ELEVATION = 89;
export const MAX_INTENSITY = 2.5;

/** Three.js intensity for a light at 100%. */
export const LIGHT_UNIT = 1.7;

export const LIGHT_COLORS = [
  { hex: "#ffffff", name: "Daylight" },
  { hex: "#ffd9b0", name: "Tungsten" },
  { hex: "#ffb36b", name: "Golden hour" },
  { hex: "#ff8f4a", name: "Candle" },
  { hex: "#dce8ff", name: "Overcast" },
  { hex: "#9fb6ff", name: "Moonlight" },
  { hex: "#ff5fa2", name: "Neon pink" },
  { hex: "#3fd5c8", name: "Teal" },
] as const;

/* ---------------------------------------------------------------- presets */

const light = (
  azimuth: number,
  elevation: number,
  intensity: number,
  extra: Partial<LightSpec> = {},
): LightSpec => ({
  on: true,
  azimuth,
  elevation,
  intensity,
  color: "#ffffff",
  shadows: false,
  softness: 0.35,
  ...extra,
});
const off = (azimuth: number, elevation: number, intensity = 0.5): LightSpec => ({
  ...light(azimuth, elevation, intensity),
  on: false,
});

export const PRESETS = {
  studio: {
    name: "Studio",
    tip: "Even three-point light: clear form, gentle shadows",
    ambient: 0.45,
    lights: {
      key: light(35, 42, 1, { shadows: true }),
      fill: light(-60, 12, 0.3, { color: "#dce8ff" }),
      rim: light(160, 30, 0.6),
    },
  },
  rembrandt: {
    name: "Rembrandt",
    tip: "High side light; a small triangle of light on the shadowed cheek",
    ambient: 0.16,
    lights: {
      key: light(48, 40, 1.25, { shadows: true, color: "#ffd9b0", softness: 0.25 }),
      fill: off(-60, 10),
      rim: off(160, 30),
    },
  },
  split: {
    name: "Split",
    tip: "Light from exactly one side: half lit, half in shadow",
    ambient: 0.1,
    lights: {
      key: light(90, 4, 1.3, { shadows: true, softness: 0.2 }),
      fill: off(-90, 10),
      rim: off(180, 30),
    },
  },
  butterfly: {
    name: "Butterfly",
    tip: "Light high and straight ahead; a small shadow under the nose and chin",
    ambient: 0.3,
    lights: {
      key: light(0, 55, 1.15, { shadows: true }),
      fill: light(0, -20, 0.25),
      rim: off(180, 30),
    },
  },
  rim: {
    name: "Rim",
    tip: "Two lights from behind: a bright outline around a dark figure",
    ambient: 0.08,
    lights: {
      key: light(145, 22, 1.5, { shadows: true }),
      fill: light(0, 10, 0.12),
      rim: light(-145, 22, 1.5),
    },
  },
  top: {
    name: "Top",
    tip: "A single light straight above, like a spotlight",
    ambient: 0.08,
    lights: {
      key: light(0, 86, 1.5, { shadows: true, softness: 0.15 }),
      fill: off(-60, 10),
      rim: off(160, 30),
    },
  },
  under: {
    name: "Under",
    tip: "Lit from below: eerie, campfire or horror",
    ambient: 0.08,
    lights: {
      key: light(10, -50, 1.2, { color: "#ffb36b" }),
      fill: off(-60, 10),
      rim: light(180, 20, 0.35, { color: "#9fb6ff" }),
    },
  },
  golden: {
    name: "Golden",
    tip: "Low warm sun with cool sky light on the shadow side",
    ambient: 0.28,
    lights: {
      key: light(70, 12, 1.25, { shadows: true, color: "#ffb36b", softness: 0.2 }),
      fill: light(-110, 35, 0.35, { color: "#9fb6ff" }),
      rim: off(170, 20),
    },
  },
  moonlight: {
    name: "Moonlight",
    tip: "Dim, cool light with a pale edge",
    ambient: 0.12,
    lights: {
      key: light(-55, 35, 0.6, { shadows: true, color: "#9fb6ff", softness: 0.5 }),
      fill: off(60, 10),
      rim: light(150, 20, 0.5, { color: "#dce8ff" }),
    },
  },
  flat: {
    name: "Flat",
    tip: "Soft, shadowless light that shows the whole silhouette",
    ambient: 0.85,
    lights: {
      key: light(0, 25, 0.45),
      fill: light(-120, 20, 0.2),
      rim: light(120, 20, 0.2),
    },
  },
} satisfies Record<string, { name: string; tip: string; ambient: number; lights: Record<LightId, LightSpec> }>;

export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export function fromPreset(id: PresetId, shading: Shading = "smooth"): Lighting {
  const p = PRESETS[id];
  return {
    lights: { key: { ...p.lights.key }, fill: { ...p.lights.fill }, rim: { ...p.lights.rim } },
    ambient: p.ambient,
    shading,
    preset: id,
  };
}

export const DEFAULT_LIGHTING: Lighting = fromPreset("studio");

/* ------------------------------------------------------------------ math */

const RAD = Math.PI / 180;
export const clampElevation = (e: number) => Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, e));
/** Wrap to (-180, 180]. */
export const wrapAzimuth = (a: number) => {
  const w = ((((a + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
};

/** Unit vector from the figure toward the light. */
export function lightDirection(azimuth: number, elevation: number): [number, number, number] {
  const a = azimuth * RAD;
  const e = elevation * RAD;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
}

export function anglesOf(x: number, y: number, z: number): { azimuth: number; elevation: number } {
  const len = Math.hypot(x, y, z) || 1;
  return {
    azimuth: wrapAzimuth(Math.atan2(x, z) / RAD),
    elevation: clampElevation(Math.asin(Math.max(-1, Math.min(1, y / len))) / RAD),
  };
}

/** "Front left, 40° up" — where a light sits, in words. */
export function describeDirection(azimuth: number, elevation: number): string {
  const a = wrapAzimuth(azimuth);
  const abs = Math.abs(a);
  // The figure's own left/right, as a portrait photographer would say it.
  const side = a > 0 ? "left" : "right";
  const where =
    abs < 20 ? "Front" : abs < 70 ? `Front ${side}` : abs <= 110 ? `${side === "left" ? "Left" : "Right"} side` : abs < 160 ? `Back ${side}` : "Behind";
  const height =
    elevation > 80 ? "overhead" : elevation >= 5 ? `${Math.round(elevation)}° up` : elevation <= -5 ? `${Math.round(-elevation)}° below` : "level";
  return `${where}, ${height}`;
}

/* ----------------------------------------------------------------- store */

const KEY = "strike-a-pose:lighting:v1";
let state: Lighting = DEFAULT_LIGHTING;
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

function sanitizeLight(raw: unknown, fallback: LightSpec): LightSpec {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<LightSpec>;
  return {
    on: typeof r.on === "boolean" ? r.on : fallback.on,
    azimuth: wrapAzimuth(num(r.azimuth, -360, 360, fallback.azimuth)),
    elevation: num(r.elevation, MIN_ELEVATION, MAX_ELEVATION, fallback.elevation),
    intensity: num(r.intensity, 0, MAX_INTENSITY, fallback.intensity),
    color: typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : fallback.color,
    shadows: typeof r.shadows === "boolean" ? r.shadows : fallback.shadows,
    softness: num(r.softness, 0, 1, fallback.softness),
  };
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<Lighting>;
    const lights = (saved.lights ?? {}) as Partial<Record<LightId, unknown>>;
    state = {
      lights: {
        key: sanitizeLight(lights.key, DEFAULT_LIGHTING.lights.key),
        fill: sanitizeLight(lights.fill, DEFAULT_LIGHTING.lights.fill),
        rim: sanitizeLight(lights.rim, DEFAULT_LIGHTING.lights.rim),
      },
      ambient: num(saved.ambient, 0, 1, DEFAULT_LIGHTING.ambient),
      shading: saved.shading === "two" || saved.shading === "three" ? saved.shading : "smooth",
      preset: saved.preset && saved.preset in PRESETS ? saved.preset : null,
    };
  } catch {}
}

function commit(next: Lighting) {
  state = next;
  listeners.forEach((l) => l());
  // Drags update every frame; write to storage once they pause.
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, 250);
}

export const lightingStore = {
  get(): Lighting {
    load();
    return state;
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  setLight(id: LightId, patch: Partial<LightSpec>) {
    const cur = lightingStore.get();
    const next = { ...cur.lights[id], ...patch };
    if (patch.azimuth !== undefined) next.azimuth = wrapAzimuth(next.azimuth);
    if (patch.elevation !== undefined) next.elevation = clampElevation(next.elevation);
    commit({ ...cur, lights: { ...cur.lights, [id]: next }, preset: null });
  },
  set(patch: Partial<Pick<Lighting, "ambient" | "shading">>) {
    const cur = lightingStore.get();
    // Shading is a way of looking at the light, not part of it: a preset survives it.
    commit({ ...cur, ...patch, preset: patch.ambient !== undefined ? null : cur.preset });
  },
  applyPreset(id: PresetId) {
    commit(fromPreset(id, lightingStore.get().shading));
  },
  /** Swap left and right: the same setup lighting the other side. */
  mirror() {
    const cur = lightingStore.get();
    const flip = (l: LightSpec): LightSpec => ({ ...l, azimuth: wrapAzimuth(-l.azimuth) });
    commit({
      ...cur,
      lights: { key: flip(cur.lights.key), fill: flip(cur.lights.fill), rim: flip(cur.lights.rim) },
      preset: null,
    });
  },
  reset() {
    commit(fromPreset("studio", lightingStore.get().shading));
  },
};

export function useLighting(): Lighting {
  return useSyncExternalStore(lightingStore.subscribe, lightingStore.get, () => DEFAULT_LIGHTING);
}

/* ------------------------------------------------- editing state (not saved) */

export type ViewQuat = [number, number, number, number];

interface LightingUi {
  /** The lighting panel is open: lights show in the scene and can be dragged. */
  open: boolean;
  selected: LightId;
  dragging: LightId | null;
  /** The camera's world rotation, so the panel's ball matches what you see. */
  view: ViewQuat;
}

let ui: LightingUi = { open: false, selected: "key", dragging: null, view: [0, 0, 0, 1] };
const uiListeners = new Set<() => void>();
const SERVER_UI = ui;

export const lightingUi = {
  get: () => ui,
  set(patch: Partial<LightingUi>) {
    ui = { ...ui, ...patch };
    uiListeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    uiListeners.add(l);
    return () => {
      uiListeners.delete(l);
    };
  },
};

export function useLightingUi<T>(pick: (s: LightingUi) => T): T {
  return useSyncExternalStore(
    lightingUi.subscribe,
    () => pick(ui),
    () => pick(SERVER_UI),
  );
}

/* --------------------------------------------- preview shading (the ball) */

/**
 * The value the toon shader and the preview ball use to split light from
 * shadow, relative to how strong the brightest light is.
 */
export const TOON_CUTS = { two: 0.32, threeLow: 0.12, threeHigh: 0.55 } as const;

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Rotate v by the inverse of quaternion q (world → camera view). */
function toView(v: [number, number, number], q: ViewQuat): [number, number, number] {
  const [x, y, z, w] = q;
  const ix = -x;
  const iy = -y;
  const iz = -z;
  // t = 2 * cross(qv, v); v' = v + w*t + cross(qv, t)  (with qv = inverse's vector part)
  const tx = 2 * (iy * v[2] - iz * v[1]);
  const ty = 2 * (iz * v[0] - ix * v[2]);
  const tz = 2 * (ix * v[1] - iy * v[0]);
  return [
    v[0] + w * tx + (iy * tz - iz * ty),
    v[1] + w * ty + (iz * tx - ix * tz),
    v[2] + w * tz + (ix * ty - iy * tx),
  ];
}

/** Rotate v by quaternion q (camera view → world). */
export function fromView(v: [number, number, number], q: ViewQuat): [number, number, number] {
  return toView(v, [-q[0], -q[1], -q[2], q[3]]);
}

/** A light's direction as seen from the camera (x right, y up, z toward you). */
export function viewDirection(spec: Pick<LightSpec, "azimuth" | "elevation">, view: ViewQuat) {
  return toView(lightDirection(spec.azimuth, spec.elevation), view);
}

/**
 * Paints a lit sphere (the figure's material under the current lights) into
 * `img`, seen from `view`. A quick Lambert + highlight model: close enough to
 * the 3D render to judge direction, colour and contrast at a glance.
 */
export function paintBall(img: ImageData, lighting: Lighting, view: ViewQuat, body: string) {
  const { width: size, data } = img;
  const albedo = hexRgb(body);
  const lights = LIGHT_IDS.map((id) => lighting.lights[id])
    .filter((l) => l.on && l.intensity > 0)
    .map((l) => ({ dir: viewDirection(l, view), rgb: hexRgb(l.color), i: l.intensity }));
  const maxI = Math.max(0.0001, ...lights.map((l) => l.i));
  const amb = lighting.ambient;
  const r = size / 2 - 1;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const o = (py * size + px) * 4;
      const nx = (px + 0.5 - size / 2) / r;
      const ny = -(py + 0.5 - size / 2) / r;
      const rr = nx * nx + ny * ny;
      if (rr > 1) {
        data[o + 3] = 0;
        continue;
      }
      const nz = Math.sqrt(1 - rr);
      // Sky from above, a little bounce from below.
      let lr = amb * (0.55 + 0.3 * ny);
      let lg = lr;
      let lb = lr * 1.04;
      let spec = 0;
      let lit = 0;
      for (const l of lights) {
        const d = nx * l.dir[0] + ny * l.dir[1] + nz * l.dir[2];
        if (d <= 0) continue;
        const k = d * l.i * 0.9;
        lr += k * l.rgb[0];
        lg += k * l.rgb[1];
        lb += k * l.rgb[2];
        lit = Math.max(lit, d * l.i);
        // Blinn highlight toward the viewer (0,0,1).
        const hx = l.dir[0];
        const hy = l.dir[1];
        const hz = l.dir[2] + 1;
        const hl = Math.hypot(hx, hy, hz) || 1;
        const nh = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl);
        spec += Math.pow(nh, 36) * 0.18 * l.i;
      }
      let cr = albedo[0] * lr + spec;
      let cg = albedo[1] * lg + spec;
      let cb = albedo[2] * lb + spec;
      if (lighting.shading !== "smooth") {
        // Same banding as the figure: flat light / (half-tone) / shadow.
        const rel = lit / maxI;
        const level =
          lighting.shading === "two"
            ? rel > TOON_CUTS.two ? 1 : 0.2 + amb * 0.22
            : rel > TOON_CUTS.threeHigh ? 1 : rel > TOON_CUTS.threeLow ? 0.55 : 0.17 + amb * 0.18;
        const tint = lights.length ? lights.reduce((m, l) => (l.i === maxI ? l.rgb : m), lights[0].rgb) : [1, 1, 1];
        cr = albedo[0] * level * (0.5 + 0.5 * tint[0]);
        cg = albedo[1] * level * (0.5 + 0.5 * tint[1]);
        cb = albedo[2] * level * (0.5 + 0.5 * tint[2]);
      }
      // Soft shoulder so bright lights don't clip to flat white.
      const tm = (c: number) => Math.round(255 * Math.pow(c / (1 + c * 0.35), 1 / 1.6));
      data[o] = Math.min(255, tm(cr));
      data[o + 1] = Math.min(255, tm(cg));
      data[o + 2] = Math.min(255, tm(cb));
      // Antialiased rim.
      const edge = (1 - Math.sqrt(rr)) * r;
      data[o + 3] = Math.round(255 * Math.min(1, edge + 0.5));
    }
  }
}
