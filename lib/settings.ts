"use client";

import { useSyncExternalStore } from "react";
import { BACKGROUNDS, DEFAULT_SETTINGS, SETTINGS_KEY, type Scheme, type Settings } from "./stage";

export * from "./stage";

/* ---------------------------------------------------------------- store */

let settings: Settings = DEFAULT_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    if (!BACKGROUNDS.some((b) => b.id === settings.background)) settings.background = "studio";
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
