"use client";

import { useSyncExternalStore } from "react";
import {
  BACKGROUNDS,
  BODY_COLORS,
  DEFAULT_SETTINGS,
  isHex,
  OUTLINE_COLORS,
  SETTINGS_KEY,
  type Scheme,
  type Settings,
} from "./stage";

export * from "./stage";

const LEGACY_OUTLINE_KEY = "strike-a-pose:outline";

/* ---------------------------------------------------------------- store */

let settings: Settings = DEFAULT_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    settings = { ...DEFAULT_SETTINGS, ...saved };
    // The outline used to have its own on/off toggle; it's now "Off" here.
    if (localStorage.getItem(LEGACY_OUTLINE_KEY) === "0" && !raw?.includes('"off"')) settings.outlineWeight = "off";
    localStorage.removeItem(LEGACY_OUTLINE_KEY);
    // A named colour, or a custom one.
    if (!isHex(settings.background) && !BACKGROUNDS.some((b) => b.id === settings.background)) settings.background = "studio";
    if (!isHex(settings.bodyColor) && !BODY_COLORS.some((c) => c.id === settings.bodyColor)) settings.bodyColor = "clay";
    if (!isHex(settings.outlineColor) && !OUTLINE_COLORS.some((c) => c.id === settings.outlineColor)) settings.outlineColor = "ink";
  } catch {}
}

export const settingsStore = {
  get() {
    load();
    return settings;
  },
  set(patch: Partial<Settings>) {
    load();
    settings = { ...settings, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useSettings(): Settings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, () => DEFAULT_SETTINGS);
}

/** The light/dark scheme actually in effect (the setting, or the system's). */
export function useScheme(): Scheme {
  const { appearance } = useSettings();
  const systemDark = useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  if (appearance === "system") return systemDark ? "dark" : "light";
  return appearance;
}
