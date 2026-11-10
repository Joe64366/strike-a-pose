import { fingerJoints, HAND_SHAPES, handShapeAngles, type HandShape, type JointId } from "../joints";
import { compose, decompose, type PoseData, type RigFrames } from "../poseMath";
import { naturalize } from "./naturalize";
import { AI_JOINT_IDS, type AiAngles, type AiHandShape, type AiPose } from "./spec";

const SIDES = ["left", "right"] as const;

/**
 * Model output → a pose the figure can show. Every angle goes through
 * `compose`, which clamps it to the joint's real range, so the result is
 * always anatomically possible whatever the model said.
 */
export function aiToPose(
  raw: AiPose,
  frames: RigFrames,
  base: PoseData,
  measureLowest: (pose: PoseData) => number | null,
  { natural = true }: { natural?: boolean } = {},
): PoseData {
  // Fill in what makes a body look alive (weight shift, spine curve, soft
  // joints) before turning angles into rotations.
  const ai = natural ? naturalize(raw) : raw;
  const pose: PoseData = {};

  for (const id of AI_JOINT_IDS) {
    const a = ai.pose[id];
    const frame = frames[id];
    if (!a || !frame) continue;
    pose[id] = compose(id, { bend: a[0], tilt: a[1], twist: a[2] }, frame);
  }

  for (const side of SIDES) {
    const shape = side === "left" ? ai.left_hand : ai.right_hand;
    if (shape === "keep") {
      for (const id of fingerJoints(side)) if (base[id]) pose[id] = base[id];
      continue;
    }
    for (const { id, bend, tilt } of handShapeAngles(side, shape)) {
      const frame = frames[id];
      if (frame) pose[id] = compose(id, { bend, tilt, twist: 0 }, frame);
    }
  }

  // Stay where the figure was standing; decide floor contact vs. lift.
  const [x, , z] = base.root ?? [0, 0, 0];
  if (ai.stick_to_floor) {
    if (Math.abs(x) > 1e-4 || Math.abs(z) > 1e-4) pose.root = [x, 0, z];
  } else {
    const lowest = measureLowest(pose) ?? 0;
    pose.root = [x, ai.lift_cm / 100 - lowest, z];
    pose.floating = true;
  }
  return pose;
}

/** The hand shape these fingers match (within a few degrees), or "keep" if custom. */
function detectHand(pose: PoseData, frames: RigFrames, side: "left" | "right"): AiHandShape {
  for (const shape of Object.keys(HAND_SHAPES) as HandShape[]) {
    const match = handShapeAngles(side, shape).every(({ id, bend, tilt }) => {
      const f = frames[id];
      if (!f) return true;
      const a = decompose(pose[id], f);
      return Math.abs(a.bend - bend) < 4 && Math.abs(a.tilt - tilt) < 4;
    });
    if (match) return shape;
  }
  return "keep";
}

/** A saved pose → the model's vocabulary, so a prompt can refine it. */
export function poseToAi(pose: PoseData, frames: RigFrames, title: string, floorGap: number): AiPose {
  const out: AiPose["pose"] = {};
  for (const id of AI_JOINT_IDS) {
    const f = frames[id];
    if (!f || !pose[id]) continue;
    const a = decompose(pose[id], f);
    const v: AiAngles = [Math.round(a.bend), Math.round(a.tilt), Math.round(a.twist)];
    if (v.some((n) => n !== 0)) out[id as JointId] = v;
  }
  return {
    title,
    pose: out,
    left_hand: detectHand(pose, frames, "left"),
    right_hand: detectHand(pose, frames, "right"),
    stick_to_floor: !pose.floating,
    lift_cm: pose.floating ? Math.round(floorGap * 100) : 0,
  };
}
