import { Quaternion, Vector3, type Object3D } from "three";
import type { Gaze, Reach, SolveRequest } from "@/lib/ai/targets";
import { JOINT_BY_ID, type AxisKey, type JointId } from "@/lib/joints";
import { compose, decompose, type PoseData } from "@/lib/poseMath";
import type { Rig } from "./rig";

/**
 * Turns named goals ("right hand on the face", "looking down") into joint
 * angles on the real skeleton. Language models pick the goal well but can't
 * do the geometry, so they name it and this places it.
 *
 * Works off-screen on the rig's bones (posing, measuring, then putting
 * everything back), so the same code runs in the browser and in Node.
 *
 * Positions come from the posed skeleton itself: "the face" is in front of
 * the head wherever the head is, so a hand reaches it whether the figure
 * stands, kneels or lies on its side. Each arm is solved by a small search
 * over its own anatomical angles (so every joint limit holds): first the
 * elbow goes where a natural elbow would be, then the forearm brings the
 * wrist to the target.
 */

type Side = "left" | "right";
type V3 = Vector3;
type Angles3 = [number, number, number];
interface BodyFrame {
  /** Character's forward, up and left, in world space. */
  f: V3;
  u: V3;
  l: V3;
}

const AXES: AxisKey[] = ["bend", "tilt", "twist"];
const FORWARD = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);
const LEFT = new Vector3(1, 0, 0);
const DEG = Math.PI / 180;

/** How far the palm's centre is from the wrist (metres). */
const PALM = 0.07;

export interface PoseSolver {
  /** `pose` with arms, neck and head adjusted to meet the request. */
  solve(pose: PoseData, request: SolveRequest): PoseData;
  /** Named body points of `pose` in metres (floor-relative heights not applied), for checks. */
  landmarks(pose: PoseData): Record<string, Vector3>;
}

export function createPoseSolver(rig: Rig, root: Object3D): PoseSolver {
  const j = (id: JointId) => rig.byId[id]!;
  const frames = rig.frames;
  const tmpQ = new Quaternion();

  // --- measured once, at rest ---
  const before = rig.snapshot();
  rig.applyRaw({});
  root.updateMatrixWorld(true);
  const restInv = new Map<JointId, Quaternion>(
    rig.joints.map((k) => [k.id, k.bone.getWorldQuaternion(new Quaternion()).invert()]),
  );
  const top = j("head").tip.getWorldPosition(new Vector3()).y;
  const bottom = rig.skin({ step: 4 });
  /** World units per metre (the figure is 1.8 m tall). */
  const m = (top - bottom) / 1.8;
  const segment = (a: JointId, b: JointId) =>
    j(a).bone.getWorldPosition(new Vector3()).distanceTo(j(b).bone.getWorldPosition(new Vector3()));
  const lengths = {
    left: { upper: segment("leftUpperArm", "leftForearm"), fore: segment("leftForearm", "leftHand") },
    right: { upper: segment("rightUpperArm", "rightForearm"), fore: segment("rightForearm", "rightHand") },
  };
  rig.restore(before);
  root.updateMatrixWorld(true);

  /* ------------------------------------------------------------ helpers */

  const pos = (id: JointId) => j(id).bone.getWorldPosition(new Vector3());
  const frame = (id: JointId): BodyFrame => {
    const q = j(id).bone.getWorldQuaternion(tmpQ).multiply(restInv.get(id)!);
    return {
      f: FORWARD.clone().applyQuaternion(q),
      u: UP.clone().applyQuaternion(q),
      l: LEFT.clone().applyQuaternion(q),
    };
  };
  /** p + Σ axis · metres. */
  const at = (p: V3, ...terms: [V3, number][]) => {
    const out = p.clone();
    for (const [axis, metres] of terms) out.addScaledVector(axis, metres * m);
    return out;
  };

  const angles = new Map<JointId, Angles3>();
  const get = (id: JointId): Angles3 => angles.get(id) ?? [0, 0, 0];
  /** Pose one joint (clamped to its range) and update everything it carries. */
  const put = (id: JointId, a: Angles3) => {
    const c = AXES.map((k, i) => {
      const axis = JOINT_BY_ID[id][k];
      return axis ? Math.min(axis.max, Math.max(axis.min, a[i])) : 0;
    }) as Angles3;
    angles.set(id, c);
    const frameOf = frames[id];
    if (!frameOf) return;
    const q = compose(id, { bend: c[0], tilt: c[1], twist: c[2] }, frameOf);
    const joint = j(id);
    joint.bone.quaternion.set(q[0], q[1], q[2], q[3]).multiply(joint.rest);
    joint.bone.updateMatrixWorld(true);
  };
  const limits = (id: JointId, k: AxisKey): [number, number] => {
    const axis = JOINT_BY_ID[id][k];
    return axis ? [axis.min, axis.max] : [0, 0];
  };

  /**
   * Pattern search: nudge each parameter both ways, keep what helps, halve
   * the step when nothing does. Starts from the best of a coarse grid so it
   * doesn't settle into an arm pointing the wrong way.
   */
  function search(grid: number[][], lim: [number, number][], cost: (p: number[]) => number, step = 12): number[] {
    let best = grid[0];
    let bestCost = Infinity;
    for (const g of grid) {
      const c = cost(g);
      if (c < bestCost) {
        bestCost = c;
        best = g;
      }
    }
    const p = [...best];
    let s = step;
    for (let iter = 0; s >= 0.35 && iter < 160; iter++) {
      let improved = false;
      for (let i = 0; i < p.length; i++) {
        for (const dir of [1, -1]) {
          const old = p[i];
          const v = Math.min(lim[i][1], Math.max(lim[i][0], old + dir * s));
          if (v === old) continue;
          p[i] = v;
          const c = cost(p);
          if (c < bestCost - 1e-12) {
            bestCost = c;
            improved = true;
          } else p[i] = old;
        }
      }
      if (!improved) s /= 2;
    }
    cost(p); // leave the bones at the answer
    return p;
  }
  const cross = (a: number[], b: number[]) => a.flatMap((x) => b.map((y) => [x, y]));

  /* ------------------------------------------------------------- reaches */

  /** Where the palm should land, and which way the elbow should point. */
  function goal(side: Side, reach: Reach, floorY: number): { palm: V3; pole: V3 } | null {
    const s = side === "left" ? 1 : -1;
    const other: Side = side === "left" ? "right" : "left";
    const head = frame("head");
    const H = pos("head");
    const chest = frame("chest");
    const N = pos("neck");
    const hips = frame("hips");
    const elbowDown = at(new Vector3(), [chest.u, -1], [chest.l, 0.5 * s], [chest.f, -0.15]);
    const elbowOut = at(new Vector3(), [chest.l, s], [chest.u, 0.25], [chest.f, -0.2]);
    const S = pos(`${side}UpperArm`);
    switch (reach) {
      case "overhead":
        return { palm: at(S, [chest.u, 0.66], [chest.l, 0.06 * s], [chest.f, 0.04]), pole: elbowOut };
      case "raised":
        return {
          palm: at(S, [chest.u, 0.28], [chest.l, 0.24 * s], [chest.f, 0.06]),
          pole: at(new Vector3(), [chest.l, s], [chest.u, -0.8], [chest.f, -0.1]),
        };
      case "forward":
        return { palm: at(S, [chest.f, 0.7], [chest.u, 0.02], [chest.l, -0.04 * s]), pole: at(new Vector3(), [chest.u, -1], [chest.l, 0.4 * s]) };
      case "face":
        return { palm: at(H, [head.u, 0.08], [head.f, 0.13], [head.l, 0.035 * s]), pole: elbowDown };
      case "eyes":
        return { palm: at(H, [head.u, 0.11], [head.f, 0.12], [head.l, 0.04 * s]), pole: elbowDown };
      case "mouth":
        return { palm: at(H, [head.u, 0.035], [head.f, 0.14]), pole: elbowDown };
      case "chin":
        return { palm: at(H, [head.u, -0.01], [head.f, 0.12]), pole: elbowDown };
      case "forehead":
        return { palm: at(H, [head.u, 0.15], [head.f, 0.12]), pole: at(new Vector3(), [chest.l, s], [chest.u, -0.4]) };
      case "top_of_head":
        return { palm: at(H, [head.u, 0.25], [head.l, 0.03 * s]), pole: elbowOut };
      case "back_of_head":
        return { palm: at(H, [head.u, 0.11], [head.f, -0.12], [head.l, 0.03 * s]), pole: elbowOut };
      case "ear":
        return { palm: at(H, [head.u, 0.08], [head.l, 0.11 * s]), pole: at(new Vector3(), [chest.l, s], [chest.u, -0.6]) };
      case "chest":
        return { palm: at(N, [chest.u, -0.15], [chest.f, 0.14], [chest.l, 0.06 * s]), pole: elbowDown };
      case "heart":
        return { palm: at(N, [chest.u, -0.17], [chest.f, 0.14], [chest.l, 0.07]), pole: elbowDown };
      case "stomach":
        return { palm: at(pos("spine"), [frame("spine").u, 0.04], [frame("spine").f, 0.15], [frame("spine").l, 0.03 * s]), pole: elbowDown };
      case "hip":
        return {
          palm: at(pos("hips"), [hips.l, 0.19 * s], [hips.u, 0.07], [hips.f, 0.01]),
          pole: at(new Vector3(), [chest.l, s], [chest.f, -0.45], [chest.u, -0.2]),
        };
      case "opposite_shoulder":
        return { palm: at(pos(`${other}UpperArm`), [chest.f, 0.09], [chest.u, -0.03]), pole: elbowDown };
      case "crossed":
        // Forearms stacked in front of the lower chest, each hand by the
        // other elbow (the left arm on top). Fixed to the body, not to the
        // other arm, which may not be in place yet.
        return {
          palm: at(N, [chest.u, -0.3], [chest.f, side === "left" ? 0.17 : 0.12], [chest.l, -0.17 * s]),
          pole: at(new Vector3(), [chest.u, -1], [chest.l, 0.35 * s]),
        };
      case "hug_knees": {
        // Arms around the shins, hands meeting in front of them.
        const shins = pos("leftShin").add(pos("rightShin")).multiplyScalar(0.5);
        const ankles = pos("leftFoot").add(pos("rightFoot")).multiplyScalar(0.5);
        const flatF = new Vector3(hips.f.x, 0, hips.f.z).normalize();
        return {
          palm: at(shins.lerp(ankles, 0.3), [flatF, 0.08], [hips.l, 0.03 * s]),
          pole: at(new Vector3(), [chest.l, s], [chest.u, -0.3]),
        };
      }
      case "knee":
        return {
          palm: at(pos(`${side}Shin`), [UP, 0.06], [hips.f, 0.03]),
          pole: at(new Vector3(), [chest.l, 0.7 * s], [chest.f, -0.5], [chest.u, -0.3]),
        };
      case "lap": {
        const mid = pos(`${side}Thigh`).lerp(pos(`${side}Shin`), 0.6);
        return { palm: at(mid, [UP, 0.08]), pole: at(new Vector3(), [chest.l, 0.6 * s], [chest.f, -0.5], [chest.u, -0.3]) };
      }
      case "floor": {
        const flat = (v: V3) => new Vector3(v.x, 0, v.z).normalize();
        const p = at(S, [flat(chest.f), 0.12], [flat(chest.l), 0.06 * s]);
        p.y = floorY + 0.03 * m;
        return { palm: p, pole: at(new Vector3(), [chest.f, -1], [chest.l, 0.3 * s]) };
      }
      case "prayer":
        return { palm: at(N, [chest.u, -0.24], [chest.f, 0.24], [chest.l, 0.012 * s]), pole: elbowDown };
      default:
        return null;
    }
  }

  function reachTo(side: Side, reach: Reach, floorY: number) {
    const g = goal(side, reach, floorY);
    if (!g) return;
    const ua: JointId = `${side}UpperArm`;
    const fa: JointId = `${side}Forearm`;
    const hand: JointId = `${side}Hand`;
    const S = pos(ua);
    const { upper: L1, fore: L2 } = lengths[side];

    // The wrist sits a palm's length back from the contact, along the reach.
    const T = g.palm.clone().addScaledVector(g.palm.clone().sub(S).normalize(), -PALM * m);
    let D = T.distanceTo(S);
    const maxD = (L1 + L2) * 0.985;
    const minD = Math.abs(L1 - L2) + 0.03 * m;
    if (D > maxD || D < minD) {
      // Out of reach (or folded too tight): the nearest reachable point on the same line.
      D = Math.min(maxD, Math.max(minD, D));
      const toward = T.clone().sub(S).normalize();
      T.copy(S).addScaledVector(toward, D);
    }
    // A natural elbow: in the plane toward the pole, from the triangle's sides.
    const d = T.clone().sub(S).normalize();
    const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pole = g.pole.clone().addScaledVector(d, -g.pole.dot(d));
    if (pole.lengthSq() < 1e-8) pole.copy(UP).multiplyScalar(-1);
    const E = S.clone().addScaledVector(d, a).addScaledVector(pole.normalize(), h);

    const [, , upperTwist] = get(ua);
    const foreTwist = get(fa)[2];

    // 1. Upper arm swing and raise: the elbow to its natural spot.
    const [swing, raise] = search(
      cross([-40, 0, 40, 80, 120], [-80, -40, 0, 40, 80]),
      [limits(ua, "bend"), limits(ua, "tilt")],
      ([sw, ra]) => {
        put(ua, [sw, ra, upperTwist]);
        return pos(fa).distanceToSquared(E);
      },
    );
    // 2. Upper arm twist and elbow bend: the wrist to the target.
    const [twist, elbow] = search(
      cross([-80, -40, 0, 40, 80], [10, 50, 90, 130]),
      [limits(ua, "twist"), limits(fa, "bend")],
      ([tw, el]) => {
        put(ua, [swing, raise, tw]);
        put(fa, [el, 0, foreTwist]);
        return pos(hand).distanceToSquared(T);
      },
    );
    // 3. All four together: the wrist exactly on target, the elbow kept natural.
    search(
      [[swing, raise, twist, elbow]],
      [limits(ua, "bend"), limits(ua, "tilt"), limits(ua, "twist"), limits(fa, "bend")],
      ([sw, ra, tw, el]) => {
        put(ua, [sw, ra, tw]);
        put(fa, [el, 0, foreTwist]);
        return pos(hand).distanceToSquared(T) + 0.15 * pos(fa).distanceToSquared(E);
      },
      4,
    );
    // The hand lines up with the forearm (the model's wrist bend is for free arms).
    put(hand, [0, 0, 0]);
  }

  /* ---------------------------------------------------------------- gaze */

  function look(gaze: Gaze) {
    if (gaze === "none") return;
    const chest = frame("chest");
    const eye = at(pos("head"), [frame("head").u, 0.1]);
    const turn = (deg: number) =>
      chest.f.clone().multiplyScalar(Math.cos(deg * DEG)).addScaledVector(chest.l, Math.sin(deg * DEG));
    let target: V3;
    switch (gaze) {
      case "forward": {
        const flat = new Vector3(chest.f.x, 0, chest.f.z);
        target = flat.lengthSq() > 0.05 ? flat.normalize() : chest.f.clone();
        break;
      }
      case "down":
        target = chest.f.clone().multiplyScalar(Math.cos(55 * DEG)).addScaledVector(chest.u, -Math.sin(55 * DEG));
        break;
      case "up":
        target = chest.f.clone().multiplyScalar(Math.cos(40 * DEG)).addScaledVector(chest.u, Math.sin(40 * DEG));
        break;
      case "left":
        target = turn(65);
        break;
      case "right":
        target = turn(-65);
        break;
      case "over_left_shoulder":
        target = turn(120);
        break;
      case "over_right_shoulder":
        target = turn(-120);
        break;
      case "at_left_hand":
        target = pos("leftHand").sub(eye);
        break;
      case "at_right_hand":
        target = pos("rightHand").sub(eye);
        break;
      default:
        return;
    }
    target.normalize();
    const [, neckTilt] = get("neck");
    const [, headTilt] = get("head");
    // Bend and turn shared between neck and head, as a real neck moves.
    search(
      cross([-40, 0, 40, 80], [-60, 0, 60]),
      [
        [-75, 85],
        [-95, 95],
      ],
      ([p, y]) => {
        put("neck", [p * 0.45, neckTilt, y * 0.52]);
        put("head", [p * 0.55, headTilt, y * 0.48]);
        return 1 - frame("head").f.dot(target);
      },
    );
  }

  /* --------------------------------------------------------------- solve */

  function begin(pose: PoseData) {
    angles.clear();
    for (const k of rig.joints) {
      const fr = frames[k.id];
      if (!fr || k.def.group) continue;
      const a = decompose(pose[k.id], fr);
      angles.set(k.id, [a.bend, a.tilt, a.twist]);
    }
    rig.applyRaw(pose);
    root.updateMatrixWorld(true);
  }

  function solve(pose: PoseData, req: SolveRequest): PoseData {
    if (req.leftReach === "none" && req.rightReach === "none" && req.gaze === "none") return pose;
    const snap = rig.snapshot();
    try {
      begin(pose);
      const floorY = rig.skin({ step: 3 });
      const touched = new Set<JointId>();
      const reachBoth = () => {
        for (const side of ["left", "right"] as const) {
          const r = side === "left" ? req.leftReach : req.rightReach;
          if (r === "none") continue;
          reachTo(side, r, floorY);
          touched.add(`${side}UpperArm`).add(`${side}Forearm`).add(`${side}Hand`);
        }
      };
      const lookAtHand = req.gaze === "at_left_hand" || req.gaze === "at_right_hand";
      if (!lookAtHand && req.gaze !== "none") look(req.gaze);
      // Every target is fixed to the body (never to the other arm), so one pass places both.
      reachBoth();
      if (lookAtHand) look(req.gaze);
      if (req.gaze !== "none") touched.add("neck").add("head");

      const out: PoseData = { ...pose };
      for (const id of touched) {
        const fr = frames[id];
        const a = get(id);
        if (fr) out[id] = compose(id, { bend: a[0], tilt: a[1], twist: a[2] }, fr);
      }
      return out;
    } finally {
      rig.restore(snap);
      root.updateMatrixWorld(true);
    }
  }

  function landmarks(pose: PoseData): Record<string, Vector3> {
    const snap = rig.snapshot();
    try {
      begin(pose);
      const lowest = rig.skin({ step: 2 });
      const head = frame("head");
      const H = pos("head");
      const N = pos("neck");
      const chest = frame("chest");
      const toMetres = (p: V3) => new Vector3(p.x / m, (p.y - lowest) / m, p.z / m);
      const points: Record<string, V3> = {
        head: H,
        face: at(H, [head.u, 0.08], [head.f, 0.13]),
        chin: at(H, [head.u, -0.01], [head.f, 0.12]),
        topOfHead: at(H, [head.u, 0.25]),
        heart: at(N, [chest.u, -0.17], [chest.f, 0.14], [chest.l, 0.07]),
        chestFront: at(N, [chest.u, -0.2], [chest.f, 0.14]),
        hips: pos("hips"),
        leftHip: at(pos("hips"), [frame("hips").l, 0.19]),
        rightHip: at(pos("hips"), [frame("hips").l, -0.19]),
        leftKnee: pos("leftShin"),
        rightKnee: pos("rightShin"),
        leftFoot: pos("leftFoot"),
        rightFoot: pos("rightFoot"),
        leftWrist: pos("leftHand"),
        rightWrist: pos("rightHand"),
        leftElbow: pos("leftForearm"),
        rightElbow: pos("rightForearm"),
        leftShoulder: pos("leftUpperArm"),
        rightShoulder: pos("rightUpperArm"),
        leftUpperArmMid: pos("leftUpperArm").lerp(pos("leftForearm"), 0.55),
        rightUpperArmMid: pos("rightUpperArm").lerp(pos("rightForearm"), 0.55),
      };
      const out: Record<string, V3> = {};
      for (const [k, p] of Object.entries(points)) out[k] = toMetres(p);
      // Directions (unit vectors, not positions).
      out.headForward = head.f.clone();
      out.chestForward = chest.f.clone();
      out.hipsUp = frame("hips").u.clone();
      return out;
    } finally {
      rig.restore(snap);
      root.updateMatrixWorld(true);
    }
  }

  return { solve, landmarks };
}
