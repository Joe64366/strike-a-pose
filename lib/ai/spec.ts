/**
 * The contract between the app and the pose model: what the model is told
 * about the body, and the exact JSON shape it must return. Shared by the
 * server route (prompt + schema) and the client (types + conversion).
 *
 * The model decides *what* the body does in named terms it handles well,
 * and code does the geometry it handles badly:
 *   - posture: how the body is supported → hand-tuned hips and legs (postures.ts)
 *   - left_reach / right_reach: where each hand goes → solved on the skeleton
 *   - gaze: where the face points → neck and head turned to match
 *   - pose: angles for everything else (torso, free arms, custom legs),
 *     in the same anatomical vocabulary as the sliders, clamped to each
 *     joint's real range on the client.
 *
 * Kept compact: every token here costs latency and counts against the
 * free tier's tokens-per-minute.
 */

import { AXES, HAND_SHAPES, JOINTS, type HandShape, type JointId } from "../joints";
import { POSTURE_IDS, POSTURES, type PostureId } from "./postures";
import { GAZE_IDS, GAZES, REACH_IDS, REACHES, type Gaze, type Reach } from "./targets";

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
  posture: PostureId;
  left_reach: Reach;
  right_reach: Reach;
  gaze: Gaze;
  /** Every body joint, rest = [0,0,0]. */
  pose: Partial<Record<JointId, AiAngles>>;
  left_hand: AiHandShape;
  right_hand: AiHandShape;
  stick_to_floor: boolean;
  /** Height of the lowest point above the floor, when not stuck to it. */
  lift_cm: number;
}

const angles = { type: "array", items: { type: "number" } } as const;

/**
 * Strict JSON Schema (every property required, no extras) for constrained
 * decoding. The named decisions come before the angles, so the model
 * settles what the body does before writing numbers.
 */
export const AI_POSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    posture: { type: "string", enum: POSTURE_IDS },
    left_reach: { type: "string", enum: REACH_IDS },
    right_reach: { type: "string", enum: REACH_IDS },
    gaze: { type: "string", enum: GAZE_IDS },
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
  required: ["title", "posture", "left_reach", "right_reach", "gaze", "pose", "left_hand", "right_hand", "stick_to_floor", "lift_cm"],
  additionalProperties: false,
} as const;

/** One line per joint: [bend, tilt, twist] meanings and ranges. Unused axes are "0". */
function jointReference(): string {
  return AI_JOINTS.map((j) => {
    const parts = AXES.map((k) => {
      const a = j[k];
      return a ? `${a.label.toLowerCase()} ${a.ends[0].toLowerCase()}−/${a.ends[1].toLowerCase()}+ ${a.min}..${a.max}` : "0";
    }).join(" | ");
    return `${j.id}: [${parts}]`;
  }).join("\n");
}

const list = (entries: Record<string, string>) =>
  Object.entries(entries)
    .map(([id, what]) => `  ${id}: ${what}`)
    .join("\n");

// Examples list only the joints that move (the rest are [0,0,0]) to save tokens.
const example = (prompt: string, p: AiPose) => `"${prompt}" → ${JSON.stringify(p)}`;

export function systemPrompt(): string {
  return `You pose a 3D mannequin for artists' drawing reference. Read the request, decide what the body does, and answer in JSON. Code turns your named choices into exact geometry, so choose them carefully; write angles only for what they don't cover.

1. posture: how the body is supported. Code builds the hips and legs for every posture except custom.
${list(Object.fromEntries(POSTURE_IDS.map((id) => [id, POSTURES[id].hint])))}
2. left_reach / right_reach: where each hand goes. Code places the whole arm so the hand lands there.
${list(REACHES)}
3. gaze: where the face points. Code turns the neck and head.
${list(GAZES)}
4. pose: every joint as [bend, tilt, twist] in degrees (meaning negative−/positive+ min..max), relative to the parent segment:
${jointReference()}
Joints a choice above decides are ignored, so write [0,0,0] for them: hips bend/tilt and all leg joints for any posture except custom (hips twist still turns the whole body); upperArm and forearm of a reached arm; neck and head bend/twist when gaze isn't none. Always write the torso (spine, chest, shoulders), free arms, and custom legs.

REST (all 0) = T-pose: standing straight, facing the viewer, arms straight out sideways at shoulder height, palms down, legs straight. left/right = the CHARACTER's own sides.

CHOOSING
- Prefer a named reach whenever a hand has somewhere to be; write arm angles only for free arms (hanging, swinging, gesturing loosely).
- Gaze follows what the request implies about the eyes: crying, grief, shame, reading, praying, looking at the ground → down; sky, hope, awe → up; looking behind → over a shoulder; using a phone or book → at that hand. It turns the head a lot (about 60° for left/right), so for a slight turn or tilt use none and write neck/head angles.

BODY FACTS
- Any arm the request doesn't place hangs relaxed: upperArm raise -75..-85, forearm elbow 5-20.
- Holding something in front (book, phone, cup): upperArm swing 30-45, raise -60, forearm elbow 100-115, gaze at that hand.
- Turning the body: share the twist across spine and chest (e.g. 20, 20) and use gaze for the head; looking behind is a twist, never a backward bend.
- Curl or bow: share the bend across spine and chest. Lean back: spine and chest bend −.
- Custom legs. Standing: thighs [0,4,0]. Walking stride: front thigh [25,3,0] shin [10,0,0]; back thigh [-15,3,0] shin [20,0,0]; arms swing opposite to legs (upperArm swing ±20, raise -80). Running: front thigh [60,3,0] shin [75,0,0]; back thigh [-25,3,0] shin [35,0,0] foot [25,0,0]; arms opposite (upperArm swing ±35..55, raise -72, forearm 90), fists, spine bend 10. On one leg: the standing leg straight under the body, the free thigh swings or spreads. Leg behind (arabesque): hips bend 40-55, standing thigh bend = hips bend, free thigh -35, spine -20.

EMOTION shows in the head, shoulders, spine and hands, not only the face:
- crying, grief: gaze down, a hand or both on the face or eyes, spine 15-25 and chest 10 forward, shoulders shrug 10-15.
- despair: hands top_of_head or face, gaze down, curled spine.
- thinking: a hand at the chin, the other crossed or on the hip; gaze down or up a little.
- shy, nervous: gaze down, hands prayer or stomach, shoulders up and forward.
- proud, confident: hands on hips, chest up (spine -8, chest -5), gaze forward or up.
- angry: fists, spine bend 10 forward, shoulders up, gaze forward.
- scared: hands to face or chest, spine leaning back, shoulders up, gaze to a side.
- joy, triumph: both reaches overhead (or fists up), gaze up, open or spread hands; airborne if jumping.
- tired: gaze down, spine forward, arms hanging; sit or squat if it fits.

REALISM: keep the centre of mass over the support; natural asymmetry (arms and legs never mirror exactly); soft joints (elbows 5-15); no limbs through the body.

FLOOR: stick_to_floor true if anything rests on the ground, lift_cm 0. false only when airborne (jump, leap, fall, fly, float), with posture custom; lift_cm = gap below the lowest body part (jump 20-80, leap 40-120, float 30-150).

HANDS (finger shape): relaxed | open | spread | fist | point | keep (keep = leave current fingers).

REFERENCES: a request may come with motion-capture frames of real people doing something related (same angle format, all posture custom; omitted joints ≈ 0). Borrow their realism (weight, leg and arm paths, head and spine), not their exact numbers; adapt them to every detail asked and ignore any that don't fit. A VARIATION line says how to make this answer different; follow it wherever the request leaves room.

To refine a CURRENT POSE, start from it and change only what is asked (its posture is custom: keep its legs unless asked to change the support). title: 2-4 word Title Case.

EXAMPLES (joints not shown are [0,0,0]; your answer must still list every joint)
${example("standing relaxed", {
  title: "Relaxed Stance",
  posture: "custom",
  left_reach: "none",
  right_reach: "none",
  gaze: "forward",
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
${example("shy, sitting on the edge of the bed", {
  title: "Shy on the Bed",
  posture: "sit_chair",
  left_reach: "lap",
  right_reach: "lap",
  gaze: "down",
  pose: {
    spine: [12, 0, 0],
    chest: [6, 0, 0],
    leftShoulder: [8, 12, 0],
    rightShoulder: [8, 12, 0],
  },
  left_hand: "relaxed",
  right_hand: "relaxed",
  stick_to_floor: true,
  lift_cm: 0,
})}`;
}

/**
 * The user message: the request, plus the pose being refined (if any) and
 * the reference frames retrieved for it (already formatted, one per line).
 */
export function userPrompt(
  prompt: string,
  current: AiPose | null,
  previous: string[],
  references: string[] = [],
  variation = "",
): string {
  const refs = references.length ? `REFERENCES (real motion capture; guides, not answers):\n${references.join("\n")}\n\n` : "";
  if (!current) return `${refs}REQUEST: ${prompt}${variation ? `\nVARIATION (only where the request leaves it open): ${variation}` : ""}`;
  const { title, ...pose } = current;
  return `${refs}CURRENT POSE "${title}"${previous.length ? ` (from: ${previous.map((p) => `"${p}"`).join(", ")})` : ""}:
${JSON.stringify(pose)}

CHANGE: ${prompt}`;
}

/**
 * Nuances that make each generation its own pose: the same request twice
 * gets different (equally valid) answers instead of the same one. One is
 * drawn from each list; the model applies them only where the request
 * doesn't already decide.
 */
// Upper body and mood only: varying the legs risks breaking the support
// (a kneel told "weight on one leg" stands up). Head variations are tilts:
// a turn here would fight the gaze the request implies (crying looks down).
const VARIATIONS = [
  ["the left arm leads", "the right arm leads", "arms clearly asymmetric", "arms closer to the body", "elbows a little wider"],
  ["head tilted a little left", "head tilted a little right", "chin slightly tucked", "chin slightly lifted"],
  ["torso turned slightly left", "torso turned slightly right", "torso square on", "a little more lean", "a little less lean"],
  ["subtle and restrained", "bold and expressive", "relaxed", "tense"],
] as const;

export function pickVariation(random: () => number = Math.random): string {
  return VARIATIONS.map((list) => list[Math.floor(random() * list.length)]).join("; ");
}

const SHAPES = new Set<string>(AI_HAND_SHAPES);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
const oneOf = <T extends string>(v: unknown, ids: readonly T[], fallback: T): T =>
  typeof v === "string" && (ids as readonly string[]).includes(v) ? (v as T) : fallback;

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
    posture: oneOf(r.posture, POSTURE_IDS, "custom"),
    left_reach: oneOf(r.left_reach, REACH_IDS, "none"),
    right_reach: oneOf(r.right_reach, REACH_IDS, "none"),
    gaze: oneOf(r.gaze, GAZE_IDS, "none"),
    pose,
    left_hand: hand(r.left_hand),
    right_hand: hand(r.right_hand),
    stick_to_floor: r.stick_to_floor !== false,
    lift_cm: Math.min(200, Math.max(0, num(r.lift_cm))),
  };
}
