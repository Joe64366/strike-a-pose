/**
 * Builds lib/ai/poseLibrary.json from Mixamo FBX files in data/mixamo/.
 *
 *   npm run build:poses
 *
 * For every animation (or static pose):
 *  1. Sample it and retarget each frame onto our mannequin. Both skeletons
 *     rest in a T-pose facing +Z, so each bone's *world* rotation away from
 *     rest carries over directly; we re-express it relative to our parent
 *     bone and read it out as the same anatomical [bend, tilt, twist] the
 *     sliders and the AI use.
 *  2. Keep only the few most distinct moments (farthest-point sampling).
 *  3. Describe each pose (kneeling, airborne, hand to face…) so prompts can
 *     find it, and detect each hand's shape.
 *
 * Only the derived joint angles are written — never the raw Mixamo files
 * (Adobe's terms don't allow redistributing them).
 */

import fs from "node:fs";
import path from "node:path";
import {
  AnimationMixer,
  Bone,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Object3D,
} from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildRig, type RigJoint } from "../components/scene/rig";
import { AI_JOINT_IDS, type AiAngles, type AiHandShape } from "../lib/ai/spec";
import type { LibraryPose } from "../lib/ai/library";
import { boneMatches, HAND_SHAPES, handShapeAngles, type HandShape, type JointId } from "../lib/joints";
import { decompose, toQuat, type RigFrames } from "../lib/poseMath";

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "data/mixamo");
const OUT = path.join(ROOT, "lib/ai/poseLibrary.json");
const MODEL = path.join(ROOT, "public/models/mannequin.glb");

const SAMPLE_FPS = 12;
const MAX_PER_CLIP = 6;
/** Two frames closer than this (mean degrees per joint axis) count as the same pose. */
const DISTINCT_DEG = 9;
const LIBRARY_DUPLICATE_DEG = 5;

/* ------------------------------------------------------------ our rig */

function arrayBuffer(file: string) {
  const b = fs.readFileSync(file);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

async function loadOurRig() {
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer(MODEL), "");
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const rig = buildRig(model, new MeshStandardMaterial());
  if (!rig) throw new Error("mannequin has no skinned mesh");
  // Which of our joints is each joint's parent (walking up past non-joint bones).
  const parentJoint = new Map<JointId, RigJoint | null>();
  for (const j of rig.joints) {
    let p: Object3D | null = j.bone.parent;
    let found: RigJoint | null = null;
    while (p && !found) {
      found = rig.joints.find((k) => k.bone === p) ?? null;
      p = p.parent;
    }
    parentJoint.set(j.id, found);
  }
  // Parent bone's world rotation at rest, per joint.
  const parentRest = new Map<JointId, Quaternion>(
    rig.joints.map((j) => [j.id, j.bone.parent!.getWorldQuaternion(new Quaternion())]),
  );
  return { rig, parentJoint, parentRest, frames: rig.frames as RigFrames };
}

/**
 * The source bone whose motion each of our joints takes on. Our "chest" is
 * Spine1 but Spine2 stays at rest in our rig, so chest takes Spine2's
 * (topmost) orientation — that keeps the shoulders and neck right.
 */
const srcBoneKey = (id: JointId, bone: string) => (id === "chest" ? "Spine2" : bone);

/* ------------------------------------------------------------ helpers */

type Angles = Partial<Record<JointId, AiAngles>>;

function poseDistance(a: Angles, b: Angles) {
  let sum = 0;
  let n = 0;
  for (const id of AI_JOINT_IDS) {
    const x = a[id] ?? [0, 0, 0];
    const y = b[id] ?? [0, 0, 0];
    // The whole-body orientation matters less than the body's shape.
    const w = id === "hips" ? 0.5 : 1;
    for (let k = 0; k < 3; k++) {
      sum += w * Math.abs(x[k] - y[k]);
      n++;
    }
  }
  return sum / n;
}

function nearestHandShape(angles: Angles, side: "left" | "right"): AiHandShape {
  let best: HandShape = "relaxed";
  let bestErr = Infinity;
  for (const shape of Object.keys(HAND_SHAPES) as HandShape[]) {
    let err = 0;
    for (const { id, bend, tilt } of handShapeAngles(side, shape)) {
      const a = angles[id] ?? [0, 0, 0];
      err += Math.abs(a[0] - bend) + 0.5 * Math.abs(a[1] - tilt);
    }
    if (err < bestErr) {
      bestErr = err;
      best = shape;
    }
  }
  return best;
}

function cleanName(file: string) {
  return path
    .basename(file, path.extname(file))
    .replace(/\s*\(\d+\)\s*$/, "")
    // "action-walk-stride" → "walk stride": a category prefix isn't what the pose shows.
    .replace(/^(action|pose|anim|mixamo)[-_\s]+/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b(Female|Male)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------ describe */

interface Body {
  angles: Angles;
  /** Source joint positions (cm above the floor, our scale), for contact tags. */
  at: (key: string) => Vector3;
  liftCm: number;
  /** Which way the chest faces (unit vector, world). */
  facing: Vector3;
}

/** Bones sit inside the body, so "touching the floor" still leaves a gap. */
const AIRBORNE_CM = 15;

/** Torso close to horizontal: head roughly level with the hips. */
const isLying = (at: (k: string) => Vector3) => at("Head").y - at("Hips").y < 30 && at("Hips").y < 45;

/** Plain-language descriptors so prompts can find poses by what the body does. */
function describe({ angles, at, liftCm, facing }: Body): string[] {
  const a = (id: JointId) => angles[id] ?? [0, 0, 0];
  const tags = new Set<string>();
  const [hb] = a("hips");
  const lying = isLying(at);
  const hipsY = at("Hips").y;

  if (liftCm > AIRBORNE_CM && !lying) tags.add("airborne");
  if (lying) tags.add(facing.y > 0.5 ? "lying on back" : facing.y < -0.5 ? "lying face down" : "lying on side");
  if (!lying && (["Left", "Right"] as const).some((s) => at(`${s}Hand`).y < 18)) tags.add("hands on floor");
  for (const s of ["left", "right"] as const) {
    const thigh = a(`${s}Thigh`)[0];
    const shin = a(`${s}Shin`)[0];
    const other = a(`${s === "left" ? "right" : "left"}Thigh`)[0];
    // Kneeling means a knee is actually on (or at) the floor.
    const knee = at(s === "left" ? "LeftLeg" : "RightLeg");
    if (!lying && liftCm <= AIRBORNE_CM && shin > 70 && knee.y < 16) tags.add("kneeling");
    // Sitting and crouching fold both legs; one high thigh alone is a stride or a raised knee.
    if (thigh > 60 && other > 45 && !lying && liftCm <= 6) tags.add(hipsY < 40 ? "sitting on floor" : shin > 100 ? "crouching" : "sitting");
    if (thigh > 45 && shin < 60 && hipsY > 80) tags.add("leg raised");
  }
  // Gait: one leg ahead, the other behind (walk, run, lunge).
  const lt = a("leftThigh")[0];
  const rt = a("rightThigh")[0];
  if (!lying && Math.max(lt, rt) > 15 && Math.min(lt, rt) < -5) tags.add("legs apart front to back");
  const spineBend = a("spine")[0] + a("chest")[0];
  if (!lying && spineBend + hb > 35) tags.add("leaning forward");
  if (!lying && spineBend + hb < -20) tags.add("leaning back");
  if (!lying && liftCm <= AIRBORNE_CM && hipsY < 45 && ![...tags].some((t) => /sit|kneel/.test(t))) tags.add("low to the ground");
  if (Math.abs(a("spine")[2] + a("chest")[2]) > 30) tags.add("twisted torso");
  // Gaze in the world: a forward-leaning body with level eyes isn't "looking up".
  const gaze = hb + spineBend + a("neck")[0] + a("head")[0];
  if (!lying && gaze > 45) tags.add("head down");
  if (!lying && gaze < -20) tags.add("looking up");

  const raised = (["left", "right"] as const).filter((s) => a(`${s}UpperArm`)[1] > 40);
  if (raised.length === 2) tags.add("arms raised");
  else if (raised.length === 1) tags.add("one arm raised");
  const forward = (["left", "right"] as const).filter((s) => a(`${s}UpperArm`)[0] > 60);
  if (forward.length) tags.add(forward.length === 2 ? "arms forward" : "reaching forward");

  // The head bone sits at the top of the neck; the face is a little above.
  const face = at("Head").clone().add(new Vector3(0, 8, 6));
  const nearFace = (["Left", "Right"] as const).filter((s) => at(`${s}Hand`).distanceTo(face) < 26);
  if (nearFace.length === 2) tags.add("hands to face");
  else if (nearFace.length === 1) tags.add("hand to face");
  const lFoot = at("LeftFoot");
  const rFoot = at("RightFoot");
  if (!lying && liftCm <= 6 && Math.abs(lFoot.x - rFoot.x) > 60) tags.add("wide stance");
  if (!lying && Math.abs(lFoot.z - rFoot.z) > 45) tags.add("stride");
  if (!tags.size || (![...tags].some((t) => /lying|kneel|sit|crouch|airborne/.test(t)))) tags.add("standing");
  return [...tags];
}

/* ------------------------------------------------------------ extract */

async function main() {
  const { rig, parentJoint, parentRest, frames } = await loadOurRig();
  const files = fs.readdirSync(SRC_DIR).filter((f) => /\.fbx$/i.test(f)).sort();
  if (!files.length) throw new Error(`no .fbx files in ${SRC_DIR}`);

  const library: LibraryPose[] = [];
  const q = new Quaternion();
  const qParent = new Quaternion();

  for (const file of files) {
    let obj: Object3D;
    try {
      obj = new FBXLoader().parse(arrayBuffer(path.join(SRC_DIR, file)), "");
    } catch (e) {
      console.warn(`skip ${file}: ${(e as Error).message}`);
      continue;
    }
    const bones: Bone[] = [];
    obj.traverse((o) => (o as Bone).isBone && bones.push(o as Bone));
    const find = (key: string) => bones.find((b) => boneMatches(b.name, key));

    // Rest (T-pose) before any animation is applied.
    obj.updateMatrixWorld(true);
    const restWorld = new Map<Bone, Quaternion>(bones.map((b) => [b, b.getWorldQuaternion(new Quaternion())]));
    const restLowest = Math.min(...bones.map((b) => b.getWorldPosition(new Vector3()).y));
    const height = (find("HeadTop_End")?.getWorldPosition(new Vector3()).y ?? 180) - restLowest;
    const cmScale = 180 / height; // to our 1.8 m mannequin

    const srcFor = new Map<JointId, Bone>();
    for (const j of rig.joints) {
      const b = find(srcBoneKey(j.id, j.def.bone));
      if (b) srcFor.set(j.id, b);
    }

    /** World rotation away from rest for a source bone. */
    const delta = (b: Bone | undefined, out: Quaternion) =>
      b ? out.copy(b.getWorldQuaternion(new Quaternion())).multiply(restWorld.get(b)!.clone().invert()) : out.identity();

    const clip = obj.animations[0];
    const mixer = clip ? new AnimationMixer(obj) : null;
    if (clip && mixer) mixer.clipAction(clip).play();
    const duration = clip?.duration ?? 0;
    const count = Math.max(1, Math.floor(duration * SAMPLE_FPS));

    const samples: { angles: Angles; fingers: Angles; liftCm: number; at: Map<string, Vector3>; facing: Vector3 }[] = [];
    for (let i = 0; i < count; i++) {
      if (mixer) mixer.setTime(count === 1 ? 0 : (i / (count - 1)) * duration * 0.999);
      obj.updateMatrixWorld(true);

      const angles: Angles = {};
      const fingers: Angles = {};
      for (const j of rig.joints) {
        const src = srcFor.get(j.id);
        if (!src) continue;
        const parent = parentJoint.get(j.id);
        delta(src, q);
        delta(parent ? srcFor.get(parent.id) : undefined, qParent);
        // d = PWR⁻¹ · Qparent⁻¹ · Qjoint · PWR  (see header)
        const pwr = parentRest.get(j.id)!;
        const d = pwr.clone().invert().multiply(qParent.clone().invert()).multiply(q).multiply(pwr);
        const frame = frames[j.id];
        if (!frame) continue;
        const ang = decompose(toQuat(d), frame);
        const v: AiAngles = [Math.round(ang.bend), Math.round(ang.tilt), Math.round(ang.twist)];
        if (j.def.group) fingers[j.id] = v;
        else if (v.some((x) => x !== 0)) angles[j.id] = v;
      }

      const lowest = Math.min(...bones.map((b) => b.getWorldPosition(new Vector3()).y));
      const at = new Map<string, Vector3>();
      for (const key of ["Hips", "Head", "LeftHand", "RightHand", "LeftFoot", "RightFoot", "LeftLeg", "RightLeg"]) {
        const b = find(key);
        // Positions relative to the floor, scaled to our mannequin.
        if (b) at.set(key, b.getWorldPosition(new Vector3()).setY(b.getWorldPosition(new Vector3()).y - lowest).multiplyScalar(cmScale));
      }
      const hipsBone = find("Hips");
      const facing = new Vector3(0, 0, 1).applyQuaternion(hipsBone ? hipsBone.getWorldQuaternion(new Quaternion()) : new Quaternion());
      samples.push({ angles, fingers, liftCm: Math.max(0, (lowest - restLowest) * cmScale), at, facing });
    }

    // Most distinct moments: start from the most "posed" frame, then keep
    // adding whichever frame differs most from everything kept so far.
    const rest: Angles = {};
    const kept: number[] = [];
    let first = 0;
    samples.forEach((s, i) => {
      if (poseDistance(s.angles, rest) > poseDistance(samples[first].angles, rest)) first = i;
    });
    kept.push(first);
    while (kept.length < MAX_PER_CLIP) {
      let best = -1;
      let bestD = 0;
      samples.forEach((s, i) => {
        const d = Math.min(...kept.map((k) => poseDistance(s.angles, samples[k].angles)));
        if (d > bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best < 0 || bestD < DISTINCT_DEG) break;
      kept.push(best);
    }
    kept.sort((a, b) => a - b);

    const name = cleanName(file);
    let added = 0;
    for (const i of kept) {
      const s = samples[i];
      if (library.some((p) => poseDistance(p.pose, s.angles) < LIBRARY_DUPLICATE_DEG)) continue;
      const at = (k: string) => s.at.get(k) ?? new Vector3();
      const floating = s.liftCm > AIRBORNE_CM && !isLying(at);
      library.push({
        id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${library.filter((p) => p.name === name).length + 1}`,
        name,
        tags: describe({ angles: s.angles, liftCm: s.liftCm, at, facing: s.facing }),
        pose: s.angles,
        left_hand: nearestHandShape(s.fingers, "left"),
        right_hand: nearestHandShape(s.fingers, "right"),
        stick_to_floor: !floating,
        lift_cm: floating ? Math.round(s.liftCm) : 0,
      });
      added++;
    }
    console.log(`${file.padEnd(36)} ${String(count).padStart(3)} frames → ${added} pose${added === 1 ? "" : "s"}`);
  }

  fs.writeFileSync(OUT, JSON.stringify(library) + "\n");
  console.log(`\n${library.length} poses from ${files.length} files → ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
