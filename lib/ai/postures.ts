import type { JointId } from "../joints";
import type { AiAngles, AiPose } from "./spec";

/**
 * How the body is supported, as named, hand-tuned leg and hip setups.
 *
 * Language models describe "kneeling" well but compute it badly: a knee on
 * the floor depends on hips, thigh and shin angles agreeing, and one wrong
 * number leaves the figure squatting on an invisible chair. So the model
 * names the posture and these templates supply the hips and legs, tuned on
 * this mannequin so knees, feet and seat really meet the floor.
 *
 * "custom" keeps the model's own legs: standing, walking, running, lunges,
 * dancing, balancing and jumps, where the legs are the pose's expression
 * and the reference library shows real examples.
 *
 * Hips: [bend, tilt] only; the model's hips twist (which way the whole body
 * faces) is kept. Every other listed joint is set exactly.
 */

type Joints = Partial<Record<JointId, AiAngles>>;
interface Posture {
  /** What it's for, in the prompt's words. */
  hint: string;
  hips?: [number, number];
  joints?: Joints;
}

/** Both legs the same, with each side's spread (tilt) and twist mirrored as they should be. */
const legs = (thigh: AiAngles, shin: number, foot: number, right: AiAngles = thigh): Joints => ({
  leftThigh: thigh,
  rightThigh: right,
  leftShin: [shin, 0, 0],
  rightShin: [shin, 0, 0],
  leftFoot: [foot, 0, 0],
  rightFoot: [foot, 0, 0],
});

/** Left ↔ right: thigh spread and twist are already "outward" on both sides, so values carry over. */
function mirror(j: Joints): Joints {
  const out: Joints = {};
  for (const [id, a] of Object.entries(j) as [JointId, AiAngles][]) {
    const other = id.startsWith("left") ? id.replace(/^left/, "right") : id.replace(/^right/, "left");
    out[other as JointId] = a;
  }
  return out;
}

const KNEEL_LEFT: Joints = {
  leftThigh: [-4, 4, 0],
  leftShin: [98, 0, 0],
  leftFoot: [40, 0, 0],
  rightThigh: [96, 8, 0],
  rightShin: [100, 0, 0],
  rightFoot: [0, 0, 0],
};

export const POSTURES = {
  custom: { hint: "standing, walking, running, lunging, dancing, balancing, jumping or flying: you write the hips and legs" },
  kneel_upright: {
    hint: "on both knees, thighs upright (praying, pleading, crying on the knees)",
    hips: [0, 0],
    joints: legs([0, 5, 0], 92, 40),
  },
  kneel_sit_back: {
    hint: "on both knees, sitting back on the heels (seiza, defeated, waiting)",
    hips: [0, 0],
    joints: legs([55, 6, 0], 148, 45),
  },
  kneel_left_knee: {
    hint: "left knee on the ground, right foot planted in front (proposing, superhero landing, tying a shoe)",
    hips: [0, 0],
    joints: KNEEL_LEFT,
  },
  kneel_right_knee: {
    hint: "right knee on the ground, left foot planted in front",
    hips: [0, 0],
    joints: mirror(KNEEL_LEFT),
  },
  sit_chair: {
    hint: "sitting on a chair, bench, stool or ledge (unseen), feet on the floor",
    hips: [0, 0],
    joints: legs([88, 7, 0], 86, 0),
  },
  sit_floor: {
    hint: "sitting on the floor, legs out in front",
    hips: [-8, 0],
    joints: legs([78, 5, 0], 4, 10),
  },
  sit_knees_up: {
    hint: "sitting on the floor, knees pulled up to the chest (hugging the knees, sad, cold)",
    hips: [-12, 0],
    joints: legs([128, 6, 0], 150, -5),
  },
  sit_cross_legged: {
    hint: "cross-legged on the floor (meditating, sitting casually on the ground)",
    hips: [-8, 0],
    joints: legs([88, 55, 62], 150, 0),
  },
  squat: {
    hint: "deep squat on the balls of the feet, knees up (crouching low, looking at the ground)",
    hips: [25, 0],
    joints: legs([125, 16, 8], 150, -30),
  },
  lie_back: {
    hint: "lying on the back (sleeping, resting, dead)",
    hips: [-90, 0],
    joints: legs([2, 6, 0], 6, 30),
  },
  lie_front: {
    hint: "lying face down",
    hips: [90, 0],
    joints: legs([0, 6, 0], 4, 50),
  },
  lie_left_side: {
    hint: "lying on the left side",
    hips: [0, -88],
    // The lower arm reaches past the head as a pillow, so the head rests on it.
    joints: { ...legs([28, 4, 0], 45, 20), rightThigh: [38, 0, 0], rightShin: [55, 0, 0], leftUpperArm: [15, 85, 0], leftForearm: [35, 0, 0], neck: [0, -30, 0], head: [0, -20, 0] },
  },
  lie_right_side: {
    hint: "lying on the right side",
    hips: [0, 88],
    joints: { ...legs([28, 4, 0], 45, 20), leftThigh: [38, 0, 0], leftShin: [55, 0, 0], rightUpperArm: [15, 85, 0], rightForearm: [35, 0, 0], neck: [0, 30, 0], head: [0, 20, 0] },
  },
  all_fours: {
    hint: "on hands and knees (crawling, searching the floor)",
    // Arms are longer than thighs: the torso tips up toward the head so
    // hands and knees both reach the floor.
    hips: [82, 0],
    joints: {
      ...legs([82, 6, 0], 90, 40),
      leftUpperArm: [90, -8, 0],
      rightUpperArm: [90, -8, 0],
      leftForearm: [4, 0, 0],
      rightForearm: [4, 0, 0],
      leftHand: [-60, 0, 0],
      rightHand: [-60, 0, 0],
      neck: [-30, 0, 0],
      head: [-20, 0, 0],
    },
  },
} satisfies Record<string, Posture>;

export type PostureId = keyof typeof POSTURES;
export const POSTURE_IDS = Object.keys(POSTURES) as PostureId[];

/** Joints a posture template decides (the model's values for them are replaced). */
export function postureJoints(id: PostureId): JointId[] {
  const p: Posture = POSTURES[id];
  return [...(p.hips ? (["hips"] as JointId[]) : []), ...(Object.keys(p.joints ?? {}) as JointId[])];
}

/** The model's pose with the posture's hips and legs put in (hips twist kept). */
export function applyPosture(ai: AiPose): AiPose {
  const p: Posture = POSTURES[ai.posture] ?? POSTURES.custom;
  if (!p.hips && !p.joints) return ai;
  const pose = { ...ai.pose };
  if (p.hips) {
    const twist = pose.hips?.[2] ?? 0;
    pose.hips = [p.hips[0], p.hips[1], twist];
  }
  for (const [id, a] of Object.entries(p.joints ?? {}) as [JointId, AiAngles][]) pose[id] = [...a];
  // Everything rests on the floor in these postures.
  return { ...ai, pose, stick_to_floor: true, lift_cm: 0 };
}
