"use client";

import { useCallback, useEffect, useState } from "react";
import { sanitizeLighting } from "./lighting";
import { sanitizeFisheye } from "./perspective";
import { MAX_TITLE_LENGTH, type PoseEntry, type PoseStatus } from "./poses";

const STORAGE_KEY = "strike-a-pose:history:v1";

function load(): PoseEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as (PoseEntry & { prompt?: string })[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(({ prompt, ...e }) => ({
      ...e,
      // Entries saved before poses became "chats" had a single prompt.
      prompts: e.prompts ?? (prompt ? [prompt] : []),
      // Before grounding could be switched off, a lifted pose stored its lift
      // in root[1] and was always grounded; it now means a floating pose.
      pose:
        e.pose?.root && e.pose.root[1] > 0 && e.pose.floating === undefined
          ? { ...e.pose, floating: true }
          : (e.pose ?? {}),
      // A reload mid-generation can't resume the request.
      status: e.status === "posing" ? "error" : e.status,
      lighting: e.lighting ? sanitizeLighting(e.lighting) : undefined,
      fisheye: e.fisheye ? sanitizeFisheye(e.fisheye) : undefined,
    }));
  } catch {
    return [];
  }
}

export function usePoseHistory() {
  const [entries, setEntries] = useState<PoseEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // localStorage only exists in the browser, so read it after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Storage full or blocked: history still works for this session.
    }
  }, [entries, hydrated]);

  const add = useCallback((entry: PoseEntry) => {
    setEntries((prev) => [entry, ...prev]);
  }, []);

  const remove = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  /** Put a deleted entry back where it was (for Undo). */
  const restore = useCallback((entry: PoseEntry) => {
    setEntries((prev) =>
      [...prev.filter((e) => e.id !== entry.id), entry].sort((a, b) => b.createdAt - a.createdAt),
    );
  }, []);

  const update = useCallback((id: string, patch: Partial<PoseEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const setStatus = useCallback((id: string, status: PoseStatus) => update(id, { status }), [update]);

  const rename = useCallback(
    (id: string, title: string) => {
      const clean = title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH);
      if (clean) update(id, { title: clean });
    },
    [update],
  );

  const togglePin = useCallback((id: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, pinnedAt: e.pinnedAt ? undefined : Date.now() } : e)),
    );
  }, []);

  return { entries, hydrated, add, remove, restore, update, setStatus, rename, togglePin };
}
