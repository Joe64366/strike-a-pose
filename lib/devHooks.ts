"use client";

import { aiToPose } from "./ai/convert";
import type { AiPose } from "./ai/spec";
import type { JointId } from "./joints";
import { compose, type Angles } from "./poseMath";
import { poseStore } from "./poseStore";

/**
 * Development-only console/automation handle (never in production builds):
 *   __pose.set("rightThumb1", { bend: 10, tilt: 40, twist: 0 })
 *   __pose.select("rightHand")
 */
export function installDevHooks() {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return;
  (window as unknown as { __pose: unknown }).__pose = {
    store: poseStore,
    select: (id: JointId | null) => poseStore.select(id),
    set(id: JointId, angles: Angles) {
      const frame = poseStore.get().frames[id];
      if (!frame) throw new Error(`no frame for ${id}`);
      poseStore.setJoint(id, compose(id, angles, frame));
      poseStore.endEdit();
    },
    /** Show a pose in the model's JSON format (for tuning the prompt's reference values). */
    applyAi(ai: AiPose, natural = true) {
      const pose = aiToPose(ai, poseStore.get().frames, {}, (p) => poseStore.measureLowest(p), {
        natural,
        solve: (p, request) => poseStore.solve(p, request),
      });
      poseStore.replace(pose);
    },
  };
}
