/**
 * The contract between the app and the pose model: what the model is told
 * about the body, and the exact JSON shape it must return. Shared by the
 * server route (prompt + schema) and the client (types + conversion).
 *
 * The model speaks the same anatomical vocabulary as the sliders
 * ("upper arm: raise −80 = down by the side"), not raw rotations. The
 * client turns that into quaternions and clamps every angle to the joint's
 * real range, so whatever comes back is physically possible.
 *
 * Kept deliberately compact: every token here costs latency and counts
 * against the free tier's tokens-per-minute.
 */

import { AXES, HAND_SHAPES, JOINTS, type HandShape, type JointId } from "../joints";

/** Body joints the model controls. Fingers come from hand shapes. */
export const AI_JOINTS = JOINTS.filter((j) => !j.group);
export const AI_JOINT_IDS = AI_JOINTS.map((j) => j.id);

/** "keep" leaves that hand's fingers as they are (useful when refining). */
export const AI_HAND_SHAPES = [...(Object.keys(HAND_SHAPES) as HandShape[]), "keep"] as const;
export type AiHandShape = (typeof AI_HAND_SHAPES)[number];

/** [bend, tilt, twist] in degrees. */
export type AiAngles = [number, number, number];

export interface AiPose {
  title: string;
  /** Every body joint, rest = [0,0,0]. */
  pose: Partial<Record<JointId, AiAngles>>;
  left_hand: AiHandShape;
  right_hand: AiHandShape;
  stick_to_floor: boolean;
  /** Height of the lowest point above the floor, when not stuck to it. */
  lift_cm: number;
}

const angles = { type: "array", items: { type: "number" } } as const;

/** Strict JSON Schema (every property required, no extras) for constrained decoding. */
export const AI_POSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    pose: {
      type: "object",
      properties: Object.fromEntries(AI_JOINT_IDS.map((id) => [id, angles])),
      required: AI_JOINT_IDS,
      additionalProperties: false,
    },
    left_hand: { type: "string", enum: [...AI_HAND_SHAPES] },
    right_hand: { type: "string", enum: [...AI_HAND_SHAPES] },
    stick_to_floor: { type: "boolean" },
    lift_cm: { type: "number" },
  },
  required: ["title", "pose", "left_hand", "right_hand", "stick_to_floor", "lift_cm"],
  additionalProperties: false,
} as const;

/** One line per joint: [bend, tilt, twist] meanings and ranges. Unused axes are "0". */
function jointReference(): string {
  return AI_JOINTS.map((j) => {
    const parts = AXES.map((k) => {
      const a = j[k];
      return a ? `${a.label.toLowerCase()} ${a.ends[0].toLowerCase()}−/${a.ends[1].toLowerCase()}+ ${a.min}..${a.max}` : "0";
    });
    return `${j.id}: [${parts.join(" | ")}]`;
  }).join("\n");
}

// Examples list only the joints that move (the rest are [0,0,0]) to save tokens.
const example = (prompt: string, p: AiPose) => `"${prompt}" → ${JSON.stringify(p)}`;

export function systemPrompt(): string {
  return `You pose a 3D mannequin for artists' drawing reference. Turn the request into joint angles for a believable, physically possible pose.

REST (all 0) = T-pose: standing straight, facing the viewer, arms straight out sideways at shoulder height, palms down, legs straight. Angles are degrees relative to the parent segment. left/right = the CHARACTER's own sides.

Each joint is [bend, tilt, twist] (meaning negative−/positive+ min..max):
${jointReference()}

FACTS
- The rest pose's straight-out arms almost never occur in real poses: any arm the request doesn't place hangs relaxed (upperArm raise -75..-85, forearm elbow 5-20).
- Arms down at the sides: upperArm raise ≈-80. Overhead: raise ≈85. Reaching forward: upperArm swing ≈90, raise 0.
- Hand to face/chest: upperArm swing forward + raise down, forearm elbow 100-145.
- Knees bend backward only (shin +). Thigh swing + lifts the leg forward.
- hips turns the WHOLE body: bend -90 = lying on back, +90 = face down; tilt ±85 = on a side; twist = face another way.
- Sit on a chair/ledge (unseen): thighs ≈90, shins ≈90. Kneel upright: thighs ≈0, shins ≈100. Crouch: thighs ≈100, shins ≈120, waist bend +.
- Cross-legged on the floor: hips [-10,0,0], both thighs [90,55,65], both shins [150,0,0].
- Running stride: front thigh [60,3,0] shin [75,0,0]; back thigh [-25,3,0] shin [35,0,0] foot [25,0,0]; arms swing opposite to legs (upperArm swing ±35..55, raise -72, forearm elbow 90), fists, spine bend 10.
- Turning/looking back: share the twist across spine, chest, neck, head (e.g. 25, 25, 40, 35; + = toward the character's right). Looking behind is a twist, never a backward bend (bend − = looking up).
- Hand raised beside the head (wave, hi, oath): upperArm [0,10,85], forearm [90,0,0], hand open.
- Holding something in front (book, phone, cup): upperArm swing 30-45, raise -60, forearm elbow 100-115, and neck/head bend + to look at it.
- On one leg: hips stays level (tilt within ±5), the standing leg straight under the body, the free leg's thigh swings or spreads.
- Falling backward: hips bend -30..-50 (tipped back), arms flung forward/up, a leg rising; airborne.
- Curl or bow: share the bend across spine, chest, neck. Look down: neck/head bend +.

REALISM: keep the centre of mass over the support and balance leans; natural asymmetry and slight bends (elbows 5-15); no limbs through the body; show emotion with head, shoulders, spine and hands.

FLOOR: stick_to_floor true if anything rests on the ground (standing, kneeling, sitting, lying, crouching), lift_cm 0. false only when airborne (jump, leap, fall, fly, float); lift_cm = gap below the lowest body part (jump 20-80, leap 40-120, float 30-150).

HANDS: relaxed | open | spread | fist | point | keep (keep = leave current fingers).

Give every joint (rest = [0,0,0]). To refine a CURRENT POSE, start from it and change only what is asked. title: 2-4 word Title Case.

EXAMPLES (joints not shown are [0,0,0]; your answer must still list every joint)
${example("standing relaxed", {
  title: "Relaxed Stance",
  pose: {
    leftUpperArm: [5, -80, 0],
    rightUpperArm: [5, -80, 0],
    leftForearm: [12, 0, 0],
    rightForearm: [12, 0, 0],
    leftThigh: [0, 4, 0],
    rightThigh: [0, 4, 0],
  },
  left_hand: "relaxed",
  right_hand: "relaxed",
  stick_to_floor: true,
  lift_cm: 0,
})}
${example("jumping for joy, arms up", {
  title: "Jump for Joy",
  pose: {
    head: [-15, 0, 0],
    leftUpperArm: [10, 70, 0],
    rightUpperArm: [10, 70, 0],
    leftForearm: [15, 0, 0],
    rightForearm: [15, 0, 0],
    leftThigh: [25, 8, 0],
    rightThigh: [10, 8, 0],
    leftShin: [70, 0, 0],
    rightShin: [50, 0, 0],
  },
  left_hand: "spread",
  right_hand: "spread",
  stick_to_floor: false,
  lift_cm: 45,
})}`;
}

/** The user message: the request, plus the pose being refined (if any). */
export function userPrompt(prompt: string, current: AiPose | null, previous: string[]): string {
  if (!current) return prompt;
  const { title, ...pose } = current;
  return `CURRENT POSE "${title}"${previous.length ? ` (from: ${previous.map((p) => `"${p}"`).join(", ")})` : ""}:
${JSON.stringify(pose)}

CHANGE: ${prompt}`;
}

const SHAPES = new Set<string>(AI_HAND_SHAPES);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);

/** Accept only well-formed output; unknown joints and junk values are dropped. */
export function sanitizeAiPose(raw: unknown): AiPose | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!r.pose || typeof r.pose !== "object") return null;
  const src = r.pose as Record<string, unknown>;
  const pose: AiPose["pose"] = {};
  for (const id of AI_JOINT_IDS) {
    const v = src[id];
    if (!Array.isArray(v)) continue;
    const a: AiAngles = [num(v[0]), num(v[1]), num(v[2])];
    if (a.some((x) => x !== 0)) pose[id] = a;
  }
  const hand = (v: unknown): AiHandShape => (typeof v === "string" && SHAPES.has(v) ? (v as AiHandShape) : "keep");
  const title = typeof r.title === "string" ? r.title.replace(/\s+/g, " ").trim().slice(0, 48) : "";
  return {
    title: title || "New Pose",
    pose,
    left_hand: hand(r.left_hand),
    right_hand: hand(r.right_hand),
    stick_to_floor: r.stick_to_floor !== false,
    lift_cm: Math.min(200, Math.max(0, num(r.lift_cm))),
  };
}
