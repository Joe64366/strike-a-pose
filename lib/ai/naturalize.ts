import type { JointId } from "../joints";
import type { AiAngles, AiPose } from "./spec";

/**
 * The "naturalness pass": figure-drawing knowledge applied to a model's
 * pose before it reaches the mannequin. Models get the big idea right
 * ("kneeling", "arm up") but leave everything else at the stiff T-pose;
 * real bodies are never that still.
 *
 * Rules only fill in what the model left at rest or obviously rigid —
 * they never override a joint the model clearly set. Variation is seeded
 * from the pose itself, so the same pose always looks the same.
 *
 * Angles are the anatomical [bend, tilt, twist] used everywhere else
 * (see lib/joints.ts); `compose` clamps the result to each joint's range.
 */

type Side = "left" | "right";
const SIDES: Side[] = ["left", "right"];

/** Small deterministic PRNG (mulberry32) so a pose's "personality" is stable. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

export function naturalize(ai: AiPose): AiPose {
  const pose: Partial<Record<JointId, AiAngles>> = {};
  for (const [id, a] of Object.entries(ai.pose)) pose[id as JointId] = [...a] as AiAngles;
  const get = (id: JointId): AiAngles => pose[id] ?? [0, 0, 0];
  const set = (id: JointId, a: AiAngles) => {
    pose[id] = a.map(r1) as AiAngles;
  };
  const isRest = (id: JointId) => get(id).every((v) => Math.abs(v) < 0.5);
  const rand = rng(hash(JSON.stringify(ai.pose) + ai.title));
  const jitter = (amp: number) => (rand() * 2 - 1) * amp;

  // 0. Planted legs: models often bow or lean by rotating the whole body,
  //    which tips the legs over too. On the floor the legs should stay
  //    upright under the body and only the torso should bend — so
  //    counter-rotate the thighs. (Not for sitting/crouching, lying, or air.)
  {
    const [hb, ht] = get("hips");
    const legsStraightish = SIDES.every((s) => Math.abs(get(`${s}Thigh`)[0]) < 45);
    // A model that tipped the body *and* swung a thigh the same way already
    // planted that leg itself (an arabesque's standing leg); adding the
    // counter-swing again would double it.
    const compensated =
      Math.abs(hb) > 8 && SIDES.some((s) => Math.sign(get(`${s}Thigh`)[0]) === Math.sign(hb) && Math.abs(get(`${s}Thigh`)[0]) >= 0.6 * Math.abs(hb));
    if (ai.stick_to_floor && legsStraightish && !compensated && Math.abs(hb) < 75 && Math.abs(ht) < 40) {
      for (const s of SIDES) {
        const t = get(`${s}Thigh`);
        // A leg deliberately swung against the lean (the free leg of an
        // arabesque: body tipped forward, thigh back) is meant to rise with
        // the tip — leave it.
        if (Math.abs(hb) > 8 && Math.sign(t[0]) === -Math.sign(hb) && Math.abs(t[0]) >= 20) continue;
        // Pitching the body forward swings the legs back, so swing the
        // thighs forward by the same amount. Leaning right (+) carries the
        // feet left; bring them back: the left leg moves in, the right out.
        const counterTilt = s === "left" ? -ht : ht;
        if (Math.abs(hb) > 8 || Math.abs(ht) > 5) set(`${s}Thigh`, [t[0] + hb, t[1] + counterTilt, t[2]]);
      }
    }
  }

  // 0b. Tuck flared elbows: hands brought in front of the body with the
  //     upper arms still near the T-pose's horizontal reads as a mannequin.
  for (const s of SIDES) {
    const [swing, raise, twist] = get(`${s}UpperArm`);
    const elbow = get(`${s}Forearm`)[0];
    if (elbow > 75 && raise > -40 && raise < 25 && swing < 70) {
      set(`${s}UpperArm`, [Math.max(swing, 35), -55 + (raise + 40) * 0.25, twist]);
    }
  }

  const hips = get("hips");
  const standing =
    ai.stick_to_floor &&
    Math.abs(hips[0]) < 15 &&
    Math.abs(hips[1]) < 15 &&
    SIDES.every((s) => Math.abs(get(`${s}Thigh`)[0]) < 20 && get(`${s}Shin`)[0] < 20);

  // 1. Shoulders follow the arms (scapulohumeral rhythm): lifting an arm
  //    above ~70° from hanging raises the collarbone; reaching forward rolls
  //    the shoulder forward.
  //    The arm hangs off the collarbone, so whatever the shoulder adds is
  //    taken back out of the upper arm: the arm keeps pointing where the
  //    model aimed it, only the shoulder line changes.
  for (const s of SIDES) {
    const shoulder: JointId = `${s}Shoulder`;
    if (!isRest(shoulder)) continue;
    const [swing, raise, twist] = get(`${s}UpperArm`);
    const elevation = raise + 90; // 0 = hanging, 90 = T-pose, 175 = overhead
    const shrug = clamp((elevation - 70) * 0.18, 0, 18);
    const protract = elevation < 140 ? clamp(swing * 0.12, -8, 12) : 0;
    if (shrug > 0.5 || Math.abs(protract) > 0.5) {
      set(shoulder, [protract, shrug, 0]);
      set(`${s}UpperArm`, [swing - protract, raise - shrug, twist]);
    }
  }

  // 2. Bends live in the whole spine, not one hinge. Spread a lone bend,
  //    lean or turn across waist + chest, and head motion across neck + head.
  const spread = (a: JointId, b: JointId, shareA: number) => {
    const A = get(a);
    const B = get(b);
    const out: [AiAngles, AiAngles] = [[...A], [...B]];
    for (let k = 0; k < 3; k++) {
      const total = A[k] + B[k];
      const lone = (Math.abs(A[k]) < 0.5) !== (Math.abs(B[k]) < 0.5);
      if (lone && Math.abs(total) > 12) {
        out[0][k] = total * shareA;
        out[1][k] = total * (1 - shareA);
      }
    }
    set(a, out[0]);
    set(b, out[1]);
  };
  spread("spine", "chest", 0.55);
  spread("neck", "head", 0.45);

  // 3. Soft joints: nobody locks elbows or knees at rest; hanging hands relax.
  for (const s of SIDES) {
    const fore = get(`${s}Forearm`);
    if (fore[0] < 6) set(`${s}Forearm`, [6 + rand() * 7, fore[1], fore[2]]);

    const [, raise] = get(`${s}UpperArm`);
    if (raise < -50 && isRest(`${s}Hand`)) set(`${s}Hand`, [8 + rand() * 6, jitter(3), 0]);

    const shin = get(`${s}Shin`);
    if (standing && shin[0] < 3) set(`${s}Shin`, [3 + rand() * 3, 0, 0]);
  }

  // 4. Contrapposto: a standing body puts its weight on one leg. The free
  //    knee softens and swings slightly; the spine answers with a gentle S.
  if (standing && Math.abs(get("spine")[1]) < 3 && Math.abs(get("chest")[1]) < 3) {
    const weight: Side = rand() < 0.5 ? "left" : "right";
    const free: Side = weight === "left" ? "right" : "left";
    const toWeight = weight === "right" ? 1 : -1; // lean tilt + = toward the character's right

    const fThigh = get(`${free}Thigh`);
    const fShin = get(`${free}Shin`);
    set(`${free}Thigh`, [fThigh[0] + 6, fThigh[1] + 3, fThigh[2] + 5]);
    set(`${free}Shin`, [Math.max(fShin[0], 14 + rand() * 6), 0, 0]);
    const fFoot = get(`${free}Foot`);
    set(`${free}Foot`, [fFoot[0] + 8, fFoot[1], fFoot[2]]);

    const spine = get("spine");
    const chest = get("chest");
    set("spine", [spine[0], spine[1] + 4 * toWeight, spine[2] + jitter(3)]);
    set("chest", [chest[0], chest[1] - 6 * toWeight, chest[2]]);
    const head = get("head");
    set("head", [head[0], head[1] - 3 * toWeight, head[2]]);
  }

  // 5. Natural asymmetry: perfectly mirrored arms read as a mannequin.
  const lU = get("leftUpperArm");
  const rU = get("rightUpperArm");
  if (lU.every((v, k) => Math.abs(v - rU[k]) < 2)) {
    set("leftUpperArm", [lU[0] + jitter(5), lU[1] + jitter(4), lU[2]]);
    set("rightUpperArm", [rU[0] + jitter(5), rU[1] + jitter(4), rU[2]]);
    const lF = get("leftForearm");
    set("leftForearm", [lF[0] + 3 + rand() * 6, lF[1], lF[2]]);
  }

  // 6. A touch of life in a still head.
  if (standing && isRest("neck") && Math.abs(get("head")[0]) < 1 && Math.abs(get("head")[2]) < 1) {
    const head = get("head");
    set("head", [2 + rand() * 3, head[1] + jitter(3), jitter(5)]);
  }

  // 7. Kneeling: the tops of the feet lie on the floor instead of digging in.
  for (const s of SIDES) {
    const kneeling = get(`${s}Shin`)[0] > 70 && Math.abs(get(`${s}Thigh`)[0]) < 45;
    const foot = get(`${s}Foot`);
    if (ai.stick_to_floor && kneeling && foot[0] < 20) set(`${s}Foot`, [40, foot[1], foot[2]]);
  }

  return { ...ai, pose };
}
