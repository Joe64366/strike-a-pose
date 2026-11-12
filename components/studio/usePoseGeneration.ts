"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { aiToPose, poseToAi } from "@/lib/ai/convert";
import type { AiPose } from "@/lib/ai/spec";
import { isRestPose, type PoseData } from "@/lib/poseMath";
import { UNTITLED, type PoseEntry } from "@/lib/poses";
import { poseStore } from "@/lib/poseStore";
import type { usePoseHistory } from "@/lib/usePoseHistory";

export type GenerationResult = { id: string; ms: number; provider: string };

/**
 * Sends prompts to /api/pose and applies the result to a saved pose.
 * - a new pose gets its title from the model
 * - prompting an existing pose refines it (the model sees the current pose)
 * - results are one undoable step; failures keep the pose and offer Retry
 */
export function usePoseGeneration(
  history: ReturnType<typeof usePoseHistory>,
  applyPose: (id: string, pose: PoseData) => void,
  activeId: string | null,
) {
  const latest = useRef({ history, applyPose, activeId });
  useEffect(() => {
    latest.current = { history, applyPose, activeId };
  });
  const inflight = useRef(new Map<string, AbortController>());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastResult, setLastResult] = useState<GenerationResult | null>(null);

  const clearError = (id: string) =>
    setErrors((m) => {
      if (!(id in m)) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });

  /** `entry` is passed in (not looked up) so a brand-new entry works before it renders. */
  const run = useCallback(async (entry: PoseEntry, prompt: string) => {
    const id = entry.id;
    inflight.current.get(id)?.abort();
    const ctrl = new AbortController();
    inflight.current.set(id, ctrl);
    clearError(id);
    const started = performance.now();

    const { frames, floorGap } = poseStore.get();
    const refine = !isRestPose(entry.pose);
    const shown = latest.current.activeId === id;
    const current = refine ? poseToAi(entry.pose, frames, entry.title, shown ? floorGap : 0) : null;
    const previous = refine ? entry.prompts.slice(0, -1).slice(-3) : [];

    try {
      if (Object.keys(frames).length === 0) throw new Error("The mannequin is still loading — try again in a moment.");
      const res = await fetch("/api/pose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, current, previous }),
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => ({}))) as { pose?: AiPose; provider?: string; error?: string };
      if (!res.ok || !data.pose) throw new Error(data.error || "Couldn't create that pose. Try again.");

      // Build on the pose as it is now (it may have been hand-edited meanwhile).
      const { history: h, applyPose: apply } = latest.current;
      const now = h.entries.find((e) => e.id === id) ?? entry;
      const pose = aiToPose(data.pose, poseStore.get().frames, refine ? now.pose : {}, (p) => poseStore.measureLowest(p), {
        solve: (p, request) => poseStore.solve(p, request),
      });
      apply(id, pose);
      const retitle = !refine || now.title === UNTITLED;
      h.update(id, { status: "ready", ...(retitle && data.pose.title ? { title: data.pose.title } : {}) });
      setLastResult({ id, ms: Math.round(performance.now() - started), provider: data.provider ?? "" });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      latest.current.history.update(id, { status: "error" });
      // fetch() itself throws TypeError when the network is unreachable.
      const message =
        e instanceof TypeError
          ? "Can't reach the server — check your connection and retry."
          : e instanceof Error
            ? e.message
            : "Couldn't create that pose. Try again.";
      setErrors((m) => ({ ...m, [id]: message }));
    } finally {
      if (inflight.current.get(id) === ctrl) inflight.current.delete(id);
    }
  }, []);

  /** Re-send the last prompt of an entry that failed. */
  const retry = useCallback(
    (id: string) => {
      const entry = latest.current.history.entries.find((e) => e.id === id);
      const prompt = entry?.prompts.at(-1);
      if (!entry || !prompt) return;
      latest.current.history.update(id, { status: "posing" });
      void run(entry, prompt);
    },
    [run],
  );

  const cancel = useCallback((id: string) => {
    inflight.current.get(id)?.abort();
    inflight.current.delete(id);
    clearError(id);
  }, []);

  useEffect(() => {
    const pending = inflight.current;
    return () => pending.forEach((c) => c.abort());
  }, []);

  return { run, retry, cancel, errors, lastResult };
}
