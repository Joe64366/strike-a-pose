"use client";

import { useSyncExternalStore } from "react";
import { aiToPose } from "./ai/convert";
import type { AiPose } from "./ai/spec";
import type { PoseData } from "./poseMath";
import { poseStore } from "./poseStore";
import { PROMPT_IDEAS } from "./promptIdeas";

/**
 * The drawing timer, for gesture practice.
 *
 *  - "timer": a countdown on whatever pose is on stage.
 *  - "session": a run of poses, each held for the same time; a fresh pose
 *    appears when the time is up. AI poses are generated in the background
 *    while you draw the current one, so the next is ready on time.
 *
 * Session poses are *not* saved to history by themselves (twenty 30-second
 * gestures would bury real work). Star the ones you like while drawing; the
 * summary at the end saves the starred ones in one go.
 *
 * Time lives in an external store so the countdown ticking never re-renders
 * the studio; only the capsule subscribes to it frame by frame.
 */

export type TimerMode = "timer" | "session";
export type PoseSource = "ai" | "saved";

export interface TimerSettings {
  mode: TimerMode;
  /** Seconds per pose (or for the timer). */
  seconds: number;
  /** Poses in a session; 0 = until you stop. */
  count: number;
  source: PoseSource;
  randomView: boolean;
  sound: boolean;
}

export const DURATIONS = [30, 60, 120, 300, 600] as const;
export const COUNTS = [5, 10, 20, 0] as const;
export const MIN_SECONDS = 10;
export const MAX_SECONDS = 60 * 60;

const DEFAULTS: TimerSettings = {
  mode: "session",
  seconds: 60,
  count: 10,
  source: "ai",
  randomView: false,
  sound: true,
};

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "30 sec", "1 min", "2½ min", "10 min". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const m = seconds / 60;
  if (Number.isInteger(m)) return `${m} min`;
  if (Number.isInteger(m * 2)) return `${Math.floor(m)}½ min`;
  return formatClock(seconds * 1000);
}

/* ------------------------------------------------------------- settings */

const SETTINGS_KEY = "strike-a-pose:timer:v1";
let settings = DEFAULTS;
let settingsLoaded = false;
const settingsListeners = new Set<() => void>();

function loadSettings() {
  if (settingsLoaded || typeof window === "undefined") return;
  settingsLoaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<TimerSettings>;
    settings = {
      mode: raw.mode === "timer" ? "timer" : "session",
      seconds:
        typeof raw.seconds === "number" ? Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(raw.seconds))) : DEFAULTS.seconds,
      count: typeof raw.count === "number" && raw.count >= 0 ? Math.min(99, Math.round(raw.count)) : DEFAULTS.count,
      source: raw.source === "saved" ? "saved" : "ai",
      randomView: typeof raw.randomView === "boolean" ? raw.randomView : DEFAULTS.randomView,
      sound: typeof raw.sound === "boolean" ? raw.sound : DEFAULTS.sound,
    };
  } catch {}
}

export const timerSettings = {
  get() {
    loadSettings();
    return settings;
  },
  set(patch: Partial<TimerSettings>) {
    loadSettings();
    settings = { ...settings, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
    settingsListeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    settingsListeners.add(l);
    return () => {
      settingsListeners.delete(l);
    };
  },
};

export function useTimerSettings() {
  return useSyncExternalStore(timerSettings.subscribe, timerSettings.get, () => DEFAULTS);
}

/* ---------------------------------------------------------------- sound */

let audio: AudioContext | null = null;

/** Must run inside a click: browsers only allow audio after a user gesture. */
export function unlockSound() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {}
}

/** A soft two-note chime: time's up. */
export function chime() {
  if (!audio) return;
  const t = audio.currentTime;
  for (const [freq, delay] of [
    [1318.5, 0],
    [987.8, 0.14],
  ] as const) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t + delay);
    gain.gain.linearRampToValueAtTime(0.16, t + delay + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.9);
    osc.connect(gain).connect(audio.destination);
    osc.start(t + delay);
    osc.stop(t + delay + 1);
  }
}

/* -------------------------------------------------------------- session */

export interface SessionPose {
  id: string;
  title: string;
  /** What it was made from: an idea prompt, or the saved pose's title. */
  prompt: string;
  pose: PoseData;
  /** Small JPEG of the stage, taken once the pose has settled. */
  thumb?: string;
  kept: boolean;
}

export type Phase =
  | "idle"
  /** 3-2-1 before the first pose. */
  | "ready"
  | "drawing"
  | "paused"
  /** The next pose isn't ready yet (still generating). */
  | "loading"
  /** Timer mode: the countdown finished. */
  | "timeUp"
  /** Session over: showing the summary (AI poses: pick which to keep). */
  | "summary"
  /** Session over, nothing to choose (poses came from history): a brief note. */
  | "done";

export interface SessionState {
  phase: Phase;
  mode: TimerMode;
  source: PoseSource;
  seconds: number;
  count: number;
  /** Poses shown so far, in order. */
  poses: SessionPose[];
  /** Index of the pose on stage. */
  index: number;
  /** When the current countdown ends (ms, performance clock), while running. */
  endsAt: number;
  /** Time left when paused / at the start of a countdown. */
  remaining: number;
  /** Total time actually spent drawing, ms. */
  drawnMs: number;
  /** A problem getting the next pose (shown in the capsule). */
  notice: string | null;
}

const IDLE: SessionState = {
  phase: "idle",
  mode: "session",
  source: "ai",
  seconds: 60,
  count: 10,
  poses: [],
  index: -1,
  endsAt: 0,
  remaining: 0,
  drawnMs: 0,
  notice: null,
};

/** What the studio lends the session: showing poses, camera, thumbnails. */
export interface SessionHost {
  /** Poses saved in history (for "My poses"). */
  savedPoses: () => { title: string; pose: PoseData }[];
  /** Put a pose on stage (view only). */
  show: (pose: PoseData) => void;
  /** Turn the camera to a random preset. */
  randomView: () => void;
  /** JPEG data URL of the stage, or undefined. */
  capture: () => string | undefined;
  /** Session finished or stopped: hand the stage back. */
  end: () => void;
}

let state: SessionState = IDLE;
const listeners = new Set<() => void>();
let host: SessionHost | null = null;
let timeout: ReturnType<typeof setTimeout> | null = null;
let runId = 0;
/** The next pose, generating in the background. */
let upcoming: Promise<SessionPose | null> | null = null;
let ideaPool: string[] = [];
let savedPool: { title: string; pose: PoseData }[] = [];
let segmentStart = 0;

const READY_MS = 3000;
const THUMB_DELAY_MS = 1400;

function set(patch: Partial<SessionState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function clearTimer() {
  if (timeout) clearTimeout(timeout);
  timeout = null;
}

function shuffled<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function generate(prompt: string): Promise<SessionPose> {
  const res = await fetch("/api/pose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = (await res.json().catch(() => ({}))) as { pose?: AiPose; error?: string };
  if (!res.ok || !data.pose) throw new Error(data.error || "Couldn't create a pose.");
  const pose = aiToPose(data.pose, poseStore.get().frames, {}, (p) => poseStore.measureLowest(p));
  return { id: crypto.randomUUID(), title: data.pose.title || prompt, prompt, pose, kept: false };
}

/** Fetch (or pick) the pose after the current one. Never rejects. */
function prepareNext(): Promise<SessionPose | null> {
  const run = runId;
  const { count, poses } = state;
  if (count > 0 && poses.length >= count) return Promise.resolve(null);
  if (timerSettings.get().source === "saved") {
    if (!savedPool.length) savedPool = shuffled(host?.savedPoses() ?? []);
    const next = savedPool.shift();
    return Promise.resolve(
      next ? { id: crypto.randomUUID(), title: next.title, prompt: next.title, pose: next.pose, kept: false } : null,
    );
  }
  if (!ideaPool.length) ideaPool = shuffled(PROMPT_IDEAS);
  const idea = ideaPool.shift()!;
  // One retry with a different idea, then give up gracefully.
  return generate(idea)
    .catch(() => {
      if (!ideaPool.length) ideaPool = shuffled(PROMPT_IDEAS);
      return generate(ideaPool.shift()!);
    })
    .catch(() => {
      if (run === runId) set({ notice: "Couldn't get a new pose. Keep drawing this one, or skip to try again." });
      return null;
    });
}

function startCountdown(ms: number) {
  clearTimer();
  segmentStart = performance.now();
  set({ endsAt: segmentStart + ms, remaining: ms });
  timeout = setTimeout(onTimeUp, ms);
}

function bank() {
  // Count time actually spent drawing (for the summary).
  if (state.phase === "drawing") set({ drawnMs: state.drawnMs + (performance.now() - segmentStart) });
}

function onTimeUp() {
  timeout = null;
  bank();
  if (timerSettings.get().sound) chime();
  if (state.mode === "timer") {
    set({ phase: "timeUp", remaining: 0 });
    return;
  }
  void advance();
}

/** Show the next pose (waiting for it if it's still generating). */
async function advance() {
  const run = runId;
  const { count, poses } = state;
  if (count > 0 && poses.length >= count) return finish();
  set({ phase: "loading", notice: null });
  const next = await (upcoming ?? prepareNext());
  if (run !== runId) return;
  upcoming = null;
  if (!next) {
    // Nothing new to show (out of saved poses, or generation failed).
    if (!state.poses.length) {
      set({ notice: timerSettings.get().source === "saved" ? "No saved poses to draw yet." : state.notice });
      return finish();
    }
    if (timerSettings.get().source === "saved") return finish();
    // Keep drawing the current pose for another round.
    set({ phase: "drawing" });
    return startCountdown(state.seconds * 1000);
  }
  present(next);
}

function present(next: SessionPose) {
  const run = runId;
  const index = state.poses.length;
  set({ poses: [...state.poses, next], index, phase: "drawing", notice: null });
  host?.show(next.pose);
  if (timerSettings.get().randomView && index > 0) host?.randomView();
  startCountdown(state.seconds * 1000);
  // Thumbnail once the figure has eased into the pose.
  setTimeout(() => {
    if (run !== runId) return;
    const thumb = host?.capture();
    if (thumb) set({ poses: state.poses.map((p) => (p.id === next.id ? { ...p, thumb } : p)) });
  }, THUMB_DELAY_MS);
  // Start on the one after, while this one is drawn.
  upcoming = prepareNext();
}

const DONE_MS = 3200;

/**
 * Session over: hand the stage back. AI poses get the summary (keep the ones
 * you liked); poses from history are already saved, so just a brief note.
 */
function finish() {
  end();
  if (!state.poses.length) {
    state = IDLE;
    listeners.forEach((l) => l());
    return;
  }
  if (state.source === "saved") {
    set({ phase: "done", endsAt: 0, remaining: 0 });
    const run = runId;
    setTimeout(() => {
      if (run === runId && state.phase === "done") session.dismiss();
    }, DONE_MS);
    return;
  }
  set({ phase: "summary", endsAt: 0, remaining: 0 });
}

function end() {
  runId++;
  clearTimer();
  upcoming = null;
  host?.end();
  host = null;
}

export const session = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },

  /** Begin with the current settings. Call from a click (sound unlock). */
  start(h: SessionHost) {
    end();
    host = h;
    const run = ++runId;
    const s = timerSettings.get();
    unlockSound();
    ideaPool = shuffled(PROMPT_IDEAS);
    savedPool = shuffled(h.savedPoses());
    state = { ...IDLE, mode: s.mode, source: s.source, seconds: s.seconds, count: s.mode === "timer" ? 1 : s.count };
    if (s.mode === "timer") {
      set({ phase: "drawing" });
      startCountdown(s.seconds * 1000);
      return;
    }
    // Get ready: a short countdown, while the first pose is fetched.
    upcoming = prepareNext();
    set({ phase: "ready", endsAt: performance.now() + READY_MS, remaining: READY_MS });
    timeout = setTimeout(() => {
      if (run !== runId) return;
      timeout = null;
      void advance();
    }, READY_MS);
  },

  pause() {
    if (state.phase !== "drawing") return;
    bank();
    clearTimer();
    set({ phase: "paused", remaining: Math.max(0, state.endsAt - performance.now()) });
  },

  resume() {
    if (state.phase !== "paused") return;
    set({ phase: "drawing" });
    startCountdown(state.remaining);
  },

  /** Session: skip to the next pose now. */
  next() {
    if (state.mode !== "session" || !["drawing", "paused"].includes(state.phase)) return;
    bank();
    clearTimer();
    void advance();
  },

  /** Timer: run the same countdown again. */
  again() {
    if (state.phase !== "timeUp") return;
    set({ phase: "drawing" });
    startCountdown(state.seconds * 1000);
  },

  /** Stop: a session goes to its summary; a timer just ends. */
  stop() {
    bank();
    if (state.mode === "session" && state.poses.length) return finish();
    end();
    state = IDLE;
    listeners.forEach((l) => l());
  },

  toggleKeep(id: string) {
    set({ poses: state.poses.map((p) => (p.id === id ? { ...p, kept: !p.kept } : p)) });
  },

  /** Close the summary (after saving, or not). */
  dismiss() {
    state = IDLE;
    listeners.forEach((l) => l());
  },
};

export function useSession<T>(pick: (s: SessionState) => T): T {
  return useSyncExternalStore(
    session.subscribe,
    () => pick(state),
    () => pick(IDLE),
  );
}
