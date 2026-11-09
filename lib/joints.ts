/**
 * The poseable joints of the mannequin, described anatomically.
 *
 * Every axis is defined by *what it does in the world at rest* (the T-pose,
 * character facing +Z, its left on +X) rather than by the rig's arbitrary
 * local bone axes. That keeps the sliders meaningful ("Straight ↔ Bent"),
 * makes left and right mirror each other for free, and gives the AI later a
 * vocabulary it can reason about.
 */

export const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"] as const;
export type Finger = (typeof FINGERS)[number];
type FingerJointId = `${"left" | "right"}${Finger}${1 | 2 | 3}`;

const BODY_JOINT_IDS = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftForearm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightForearm",
  "rightHand",
  "leftThigh",
  "leftShin",
  "leftFoot",
  "rightThigh",
  "rightShin",
  "rightFoot",
] as const;

export type JointId = (typeof BODY_JOINT_IDS)[number] | FingerJointId;

export const JOINT_IDS: JointId[] = [
  ...BODY_JOINT_IDS,
  ...(["left", "right"] as const).flatMap((s) =>
    FINGERS.flatMap((f) => ([1, 2, 3] as const).map((n) => `${s}${f}${n}` as FingerJointId)),
  ),
];

/** World direction at rest. "out" = away from the body's midline (±X by side). */
type Dir = "up" | "down" | "forward" | "back" | "out" | "in" | "charLeft" | "charRight";

export interface AxisDef {
  label: string;
  /** Rotating positively moves `from` toward `to` (both at rest, in world space). */
  from: Dir | "tip";
  to: Dir;
  /** Slider end labels: [negative, positive]. */
  ends: [string, string];
  min: number;
  max: number;
}

export interface JointDef {
  id: JointId;
  label: string;
  /** Where it pivots, shown under the title. */
  pivot: string;
  /** Rig bone name (suffix match, tolerant of "mixamorig:" prefixes). */
  bone: string;
  /** A bone at the far end of this segment: gives the segment's direction. */
  tip: string;
  side?: "left" | "right";
  /**
   * Joints edited together in one card (a finger's three segments). The
   * card lists every axis of every joint in the group, in order.
   */
  group?: string;
  bend?: AxisDef;
  tilt?: AxisDef;
  twist?: AxisDef;
}

type Side = "left" | "right";
/** "Left"/"Right": both the label prefix and the rig's bone-name prefix. */
const L = (side: Side) => (side === "left" ? "Left" : "Right");
const cap = L;

function torso(
  id: JointId,
  label: string,
  pivot: string,
  bone: string,
  tip: string,
  r: { bend: [number, number]; tilt: number; twist: number },
): JointDef {
  return {
    id,
    label,
    pivot,
    bone,
    tip,
    bend: { label: "Bend", from: "tip", to: "forward", ends: ["Back", "Forward"], min: r.bend[0], max: r.bend[1] },
    tilt: { label: "Lean", from: "tip", to: "charRight", ends: ["Left", "Right"], min: -r.tilt, max: r.tilt },
    twist: { label: "Turn", from: "forward", to: "charRight", ends: ["Left", "Right"], min: -r.twist, max: r.twist },
  };
}

function arm(side: Side): JointDef[] {
  const s = side;
  const p = s; // id prefix
  return [
    {
      id: `${p}Shoulder` as JointId,
      label: `${cap(s)} shoulder`,
      pivot: "Collarbone",
      bone: `${L(s)}Shoulder`,
      tip: `${L(s)}Arm`,
      side: s,
      bend: { label: "Swing", from: "tip", to: "forward", ends: ["Back", "Forward"], min: -20, max: 25 },
      tilt: { label: "Shrug", from: "tip", to: "up", ends: ["Down", "Up"], min: -10, max: 35 },
    },
    {
      id: `${p}UpperArm` as JointId,
      label: `${cap(s)} upper arm`,
      pivot: "Shoulder joint",
      bone: `${L(s)}Arm`,
      tip: `${L(s)}ForeArm`,
      side: s,
      bend: { label: "Swing", from: "tip", to: "forward", ends: ["Back", "Forward"], min: -70, max: 150 },
      tilt: { label: "Raise", from: "tip", to: "up", ends: ["Down", "Up"], min: -88, max: 88 },
      twist: { label: "Twist", from: "forward", to: "up", ends: ["In", "Out"], min: -90, max: 90 },
    },
    {
      id: `${p}Forearm` as JointId,
      label: `${cap(s)} forearm`,
      pivot: "Elbow",
      bone: `${L(s)}ForeArm`,
      tip: `${L(s)}Hand`,
      side: s,
      bend: { label: "Elbow", from: "tip", to: "forward", ends: ["Straight", "Bent"], min: 0, max: 150 },
      twist: { label: "Twist", from: "forward", to: "up", ends: ["In", "Out"], min: -90, max: 90 },
    },
    {
      id: `${p}Hand` as JointId,
      label: `${cap(s)} hand`,
      pivot: "Wrist",
      bone: `${L(s)}Hand`,
      tip: `${L(s)}HandMiddle1`,
      side: s,
      // T-pose palms face down, so curling the wrist toward the palm is "down".
      bend: { label: "Bend", from: "tip", to: "down", ends: ["Back", "Palm"], min: -65, max: 75 },
      tilt: { label: "Tilt", from: "tip", to: "forward", ends: ["Pinky", "Thumb"], min: -35, max: 25 },
    },
  ];
}

function leg(side: Side): JointDef[] {
  const s = side;
  const p = s;
  return [
    {
      id: `${p}Thigh` as JointId,
      label: `${cap(s)} thigh`,
      pivot: "Hip joint",
      bone: `${L(s)}UpLeg`,
      tip: `${L(s)}Leg`,
      side: s,
      bend: { label: "Swing", from: "tip", to: "forward", ends: ["Back", "Forward"], min: -35, max: 130 },
      tilt: { label: "Spread", from: "tip", to: "out", ends: ["In", "Out"], min: -30, max: 80 },
      twist: { label: "Twist", from: "forward", to: "out", ends: ["In", "Out"], min: -45, max: 65 },
    },
    {
      id: `${p}Shin` as JointId,
      label: `${cap(s)} lower leg`,
      pivot: "Knee",
      bone: `${L(s)}Leg`,
      tip: `${L(s)}Foot`,
      side: s,
      bend: { label: "Knee", from: "tip", to: "back", ends: ["Straight", "Bent"], min: 0, max: 155 },
    },
    {
      id: `${p}Foot` as JointId,
      label: `${cap(s)} foot`,
      pivot: "Ankle",
      bone: `${L(s)}Foot`,
      tip: `${L(s)}ToeBase`,
      side: s,
      bend: { label: "Point", from: "tip", to: "down", ends: ["Flex", "Point"], min: -30, max: 55 },
      tilt: { label: "Roll", from: "tip", to: "out", ends: ["In", "Out"], min: -30, max: 30 },
    },
  ];
}

const FINGER_NAMES: Record<Finger, string> = {
  Thumb: "thumb",
  Index: "index finger",
  Middle: "middle finger",
  Ring: "ring finger",
  Pinky: "pinky",
};

/**
 * Three segments per finger. In the T-pose palms face down, so curling
 * toward the palm is "down" and spreading toward the thumb is "forward".
 * The thumb lies along the palm's edge: it sweeps across the palm at the
 * base, then curls like the others.
 */
function fingers(side: Side): JointDef[] {
  return FINGERS.flatMap((f) =>
    ([1, 2, 3] as const).map((n): JointDef => {
      const thumb = f === "Thumb";
      const curl = (label: string, min: number, max: number): AxisDef => ({
        label,
        from: "tip",
        to: "down",
        ends: ["Back", "Curl"],
        min,
        max,
      });
      const base = n === 1;
      return {
        id: `${side}${f}${n}`,
        label: `${L(side)} ${FINGER_NAMES[f]}`,
        pivot: base ? (thumb ? "Base of the thumb" : "Knuckle") : n === 2 ? "Middle joint" : "Tip joint",
        bone: `${L(side)}Hand${f}${n}`,
        tip: `${L(side)}Hand${f}${n + 1}`,
        side,
        group: `${side}${f}`,
        bend: base
          ? thumb
            ? { label: "Base", from: "tip", to: "down", ends: ["Up", "Down"], min: -35, max: 50 }
            : curl("Base", -25, 90)
          : n === 2
            ? curl("Middle", thumb ? -10 : 0, thumb ? 60 : 105)
            : curl("Tip", thumb ? -15 : -5, thumb ? 80 : 85),
        tilt: base
          ? thumb
            ? { label: "Across", from: "tip", to: "back", ends: ["Away", "Across"], min: -30, max: 80 }
            : { label: "Spread", from: "tip", to: "forward", ends: ["Pinky side", "Thumb side"], min: -22, max: 22 }
          : undefined,
      };
    }),
  );
}

export const JOINTS: JointDef[] = [
  torso("hips", "Whole body", "Hips", "Hips", "Spine", { bend: [-180, 180], tilt: 89, twist: 180 }),
  torso("spine", "Waist", "Lower back", "Spine", "Spine1", { bend: [-30, 55], tilt: 30, twist: 35 }),
  torso("chest", "Chest", "Upper back", "Spine1", "Spine2", { bend: [-25, 40], tilt: 25, twist: 30 }),
  torso("neck", "Neck", "Base of neck", "Neck", "Head", { bend: [-40, 50], tilt: 35, twist: 50 }),
  torso("head", "Head", "Top of neck", "Head", "HeadTop_End", { bend: [-35, 35], tilt: 25, twist: 45 }),
  ...arm("left"),
  ...arm("right"),
  ...leg("left"),
  ...leg("right"),
  ...fingers("left"),
  ...fingers("right"),
];

export const JOINT_BY_ID = Object.fromEntries(JOINTS.map((j) => [j.id, j])) as Record<JointId, JointDef>;

/** The joints edited together with `id` (its finger), or just itself. */
export function groupOf(id: JointId): JointId[] {
  const g = JOINT_BY_ID[id].group;
  return g ? JOINTS.filter((j) => j.group === g).map((j) => j.id) : [id];
}

export function fingerJoints(side: Side): JointId[] {
  return JOINTS.filter((j) => j.side === side && j.group).map((j) => j.id);
}

/**
 * One-tap hand shapes. Per finger: [base curl, spread/across, middle, tip]
 * in degrees, using the finger axes above.
 */
export const HAND_SHAPES = {
  relaxed: {
    label: "Relaxed",
    fingers: { Thumb: [-8, 22, 6, 10], Index: [12, 2, 18, 10], Middle: [16, 0, 22, 12], Ring: [20, -2, 26, 14], Pinky: [24, -4, 30, 16] },
  },
  open: {
    label: "Open",
    fingers: { Thumb: [0, 0, 0, 0], Index: [0, 0, 0, 0], Middle: [0, 0, 0, 0], Ring: [0, 0, 0, 0], Pinky: [0, 0, 0, 0] },
  },
  spread: {
    label: "Spread",
    fingers: { Thumb: [-10, -25, 0, -5], Index: [-5, 16, 0, 0], Middle: [-5, 0, 0, 0], Ring: [-5, -12, 0, 0], Pinky: [-5, -22, 0, 0] },
  },
  fist: {
    label: "Fist",
    fingers: { Thumb: [-25, 60, 5, 20], Index: [85, 0, 100, 65], Middle: [88, 0, 100, 65], Ring: [88, 0, 100, 65], Pinky: [88, 0, 100, 65] },
  },
  point: {
    label: "Point",
    fingers: { Thumb: [-25, 60, 5, 20], Index: [0, 0, 0, 0], Middle: [88, 0, 100, 65], Ring: [88, 0, 100, 65], Pinky: [88, 0, 100, 65] },
  },
} as const satisfies Record<string, { label: string; fingers: Record<Finger, readonly [number, number, number, number]> }>;

export type HandShape = keyof typeof HAND_SHAPES;

/** A hand shape as per-segment (bend, tilt) angles. */
export function handShapeAngles(side: Side, shape: HandShape) {
  return FINGERS.flatMap((f) => {
    const [base, spread, mid, tip] = HAND_SHAPES[shape].fingers[f];
    return [
      { id: `${side}${f}1` as JointId, bend: base, tilt: spread },
      { id: `${side}${f}2` as JointId, bend: mid, tilt: 0 },
      { id: `${side}${f}3` as JointId, bend: tip, tilt: 0 },
    ];
  });
}

export const AXES = ["bend", "tilt", "twist"] as const;
export type AxisKey = (typeof AXES)[number];

export function mirrorJoint(id: JointId): JointId | null {
  if (id.startsWith("left")) return id.replace("left", "right") as JointId;
  if (id.startsWith("right")) return id.replace("right", "left") as JointId;
  return null;
}

export function dirVector(dir: Dir, side: Side | undefined): [number, number, number] {
  const out = side === "right" ? -1 : 1;
  switch (dir) {
    case "up": return [0, 1, 0];
    case "down": return [0, -1, 0];
    case "forward": return [0, 0, 1];
    case "back": return [0, 0, -1];
    case "out": return [out, 0, 0];
    case "in": return [-out, 0, 0];
    case "charLeft": return [1, 0, 0];
    case "charRight": return [-1, 0, 0];
  }
}

/** Matches a rig bone name like "mixamorig1LeftArm_09" or "mixamorigLeftArm". */
export function boneMatches(name: string, key: string) {
  return new RegExp(`${key}(_\\d+)?$`).test(name);
}
