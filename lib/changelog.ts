/**
 * What's New: releases, newest first. Add an entry when you ship something
 * people will notice; the What's New button shows a dot until it's opened.
 *
 *   {
 *     version: "1.1",
 *     date: "2026-11-20",
 *     title: "Mirror view and silhouettes",
 *     items: [
 *       { kind: "new", text: "Press M to flip the stage and check a drawing with fresh eyes." },
 *       { kind: "improved", text: "Poses from prompts kneel, sit and reach far more accurately." },
 *       { kind: "fixed", text: "Long shadows no longer end in a straight line." },
 *     ],
 *   },
 */

export type ChangeKind = "new" | "improved" | "fixed";

export interface ChangelogEntry {
  version: string;
  /** ISO date, e.g. "2026-11-20". */
  date: string;
  title: string;
  items: { kind: ChangeKind; text: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [];

const SEEN_KEY = "strike-a-pose:changelog-seen";

/** The newest release hasn't been looked at on this device yet. */
export function hasUnseenChanges(): boolean {
  const latest = CHANGELOG[0]?.version;
  if (!latest) return false;
  try {
    return localStorage.getItem(SEEN_KEY) !== latest;
  } catch {
    return false;
  }
}

export function markChangesSeen() {
  const latest = CHANGELOG[0]?.version;
  if (!latest) return;
  try {
    localStorage.setItem(SEEN_KEY, latest);
  } catch {}
}
