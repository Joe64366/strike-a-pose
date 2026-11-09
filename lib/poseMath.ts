import { Euler, MathUtils, Quaternion } from "three";
import { JOINT_BY_ID, type AxisKey, type JointId } from "./joints";

/** [x, y, z, w] rotation relative to the rest pose, in the parent bone's space. */
export type Quat = [number, number, number, number];
/**
 * Where the figure is, in metres: [x, height, z]. Height is how far the
 * whole figure is raised from standing; it's only used when `floating`.
 */
export type RootPosition = [number, number, number];

/** Only joints that moved are stored; missing = rest. */
export type PoseData = Partial<Record<JointId, Quat>> & {
  root?: RootPosition;
  /**
   * Grounding off: the figure stays at `root` height while you pose it
   * (mid-air jumps, or tucking the legs without dropping). Absent = the
   * figure rests its lowest point on the floor.
   */
  floating?: boolean;
};

export const MAX_LIFT = 2;
export const MAX_TRAVEL = 8;

/** True when nothing differs from the default T-pose at the origin. */
export function isRestPose(pose: PoseData): boolean {
  const { root, floating, ...joints } = pose;
  if (floating) return false;
  if (root && root.some((v) => Math.abs(v) > 1e-4)) return false;
  return Object.values(joints).every((q) => isIdentity(q as Quat));
}

export type Angles = Record<AxisKey, number>; // degrees, display-signed

/**
 * Per-joint frame computed from the loaded rig: rotates the joint's
 * anatomical axes (x = bend, y = tilt, z = twist) into parent space.
 * `signs` flips an axis's displayed value where the frame had to be
 * mirrored to stay right-handed.
 */
export interface JointFrame {
  basis: Quat;
  signs: [number, number, number];
}
export type RigFrames = Partial<Record<JointId, JointFrame>>;

const _q = new Quaternion();
const _b = new Quaternion();
const _e = new Euler(0, 0, 0, "XYZ");

export const IDENTITY: Quat = [0, 0, 0, 1];

export function toQuat(q: Quaternion): Quat {
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  return [r(q.x), r(q.y), r(q.z), r(q.w)];
}

export function isIdentity(q: Quat | undefined) {
  return !q || Math.abs(Math.abs(q[3]) - 1) < 1e-6;
}

/** Rotation → anatomical angles (degrees) for the sliders. */
export function decompose(q: Quat | undefined, frame: JointFrame): Angles {
  if (!q) return { bend: 0, tilt: 0, twist: 0 };
  _b.fromArray(frame.basis);
  // Express the rotation in the joint's own basis, then read Euler XYZ:
  // bend about x, tilt about y, twist about z (applied innermost).
  _q.fromArray(q).premultiply(_b.clone().invert()).multiply(_b);
  _e.setFromQuaternion(_q, "XYZ");
  const d = MathUtils.RAD2DEG;
  return {
    bend: _e.x * d * frame.signs[0],
    tilt: _e.y * d * frame.signs[1],
    twist: _e.z * d * frame.signs[2],
  };
}

/** Anatomical angles → rotation, clamped to the joint's limits. */
export function compose(id: JointId, angles: Angles, frame: JointFrame): Quat {
  const clamped = clampAngles(id, angles);
  const r = MathUtils.DEG2RAD;
  _e.set(
    clamped.bend * r * frame.signs[0],
    clamped.tilt * r * frame.signs[1],
    clamped.twist * r * frame.signs[2],
    "XYZ",
  );
  _b.fromArray(frame.basis);
  _q.setFromEuler(_e).premultiply(_b).multiply(_b.clone().invert());
  return toQuat(_q);
}

export function clampAngles(id: JointId, a: Angles): Angles {
  const def = JOINT_BY_ID[id];
  const c = (k: AxisKey) => {
    const axis = def[k];
    return axis ? MathUtils.clamp(a[k], axis.min, axis.max) : 0;
  };
  return { bend: c("bend"), tilt: c("tilt"), twist: c("twist") };
}

/** Project any rotation onto what the joint can actually do. */
export function constrain(id: JointId, q: Quat, frame: JointFrame): Quat {
  return compose(id, decompose(q, frame), frame);
}
