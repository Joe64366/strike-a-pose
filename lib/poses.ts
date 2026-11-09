import type { PoseData } from "./poseMath";

export type PoseStatus = "posing" | "ready" | "error";

/**
 * A saved pose works like a chat: every prompt refines the same pose, and
 * manual edits are saved into it too.
 */
export interface PoseEntry {
  id: string;
  title: string;
  /** Every instruction given for this pose, oldest first. */
  prompts: string[];
  pose: PoseData;
  createdAt: number;
  status: PoseStatus;
  /** Timestamp when pinned; pinned poses list newest-pinned first. */
  pinnedAt?: number;
}

export const MAX_TITLE_LENGTH = 60;
export const UNTITLED = "Untitled pose";

export function lastPrompt(entry: PoseEntry): string | undefined {
  return entry.prompts[entry.prompts.length - 1];
}

/**
 * Placeholder titling until the AI route exists. The model will return a
 * proper title alongside the pose; this keeps history readable meanwhile.
 * "a person crying on their knees" -> "Crying on Their Knees"
 */
const FILLER = new Set([
  "a", "an", "the", "pose", "posing", "person", "someone", "somebody",
  "character", "figure", "man", "woman", "guy", "girl", "who", "is", "that",
  "make", "give", "me", "please", "doing", "of", "being", "like", "it", "them",
]);
const MINOR = new Set(["on", "in", "at", "with", "and", "to", "for", "over", "from", "by"]);
const MAX_WORDS = 5;

export function titleFromPrompt(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  // Drop leading filler ("a person who is ..."), keep filler mid-phrase only
  // when it carries meaning ("on their knees").
  let start = 0;
  while (start < words.length - 1 && FILLER.has(words[start])) start++;
  const kept = words.slice(start).filter((w, i) => i === 0 || !FILLER.has(w) || MINOR.has(w));
  const picked = (kept.length ? kept : words).slice(0, MAX_WORDS);

  if (picked.length === 0) return UNTITLED;
  return picked
    .map((w, i) => (i > 0 && MINOR.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function createPoseEntry(prompt: string): PoseEntry {
  return {
    id: crypto.randomUUID(),
    title: titleFromPrompt(prompt),
    prompts: [prompt.trim()],
    pose: {},
    createdAt: Date.now(),
    status: "posing",
  };
}

/** Made when you start editing the default pose by hand. */
export function createUntitledEntry(pose: PoseData): PoseEntry {
  return {
    id: crypto.randomUUID(),
    title: UNTITLED,
    prompts: [],
    pose,
    createdAt: Date.now(),
    status: "ready",
  };
}

export type HistoryGroup = { label: string; pinned?: boolean; items: PoseEntry[] };

/**
 * Pinned poses first (like Notes), then Gemini-style date buckets.
 * `entries` must be newest first.
 */
export function groupByRecency(entries: PoseEntry[], now?: Date): HistoryGroup[] {
  // History only exists in the browser; bail before touching the clock so
  // the server prerender stays deterministic.
  if (entries.length === 0) return [];

  const pinned = entries
    .filter((e) => e.pinnedAt)
    .sort((a, b) => b.pinnedAt! - a.pinnedAt!);
  const groups: HistoryGroup[] = pinned.length ? [{ label: "Pinned", pinned: true, items: pinned }] : [];
  const rest = entries.filter((e) => !e.pinnedAt);
  if (rest.length === 0) return groups;

  now ??= new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const buckets: [string, (t: number) => boolean][] = [
    ["Today", (t) => t >= startOfToday],
    ["Yesterday", (t) => t >= startOfToday - day],
    ["Previous 7 days", (t) => t >= startOfToday - 7 * day],
    ["Older", () => true],
  ];

  for (const entry of rest) {
    const label = buckets.find(([, test]) => test(entry.createdAt))![0];
    const last = groups[groups.length - 1];
    if (last && !last.pinned && last.label === label) last.items.push(entry);
    else groups.push({ label, items: [entry] });
  }
  return groups;
}
