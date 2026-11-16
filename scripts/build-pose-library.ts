/**
 * Builds lib/ai/poseLibrary.json from CMU Graphics Lab motion capture:
 * data/cmu/*.bvh, the cgspeed "MotionBuilder-friendly" BVH release (its
 * frame 0 is a T-pose; the motion starts at frame 1).
 *
 *   npm run build:poses                 (writes lib/ai/poseLibrary.json)
 *   npm run build:poses -- --out x.json (writes somewhere else, for trying files out)
 *
 * Name each file after what it shows — "crying-79_72.bvh" becomes "Crying";
 * the name is what prompts search. The trailing CMU number is dropped (it's
 * there so a reference can be traced back to its clip).
 *
 * For every clip:
 *  1. Sample it and retarget each frame onto our mannequin. Both skeletons
 *     rest in a T-pose facing +Z, so each bone's *world* rotation away from
 *     rest carries over directly; we re-express it relative to our parent
 *     bone and read it out as the same anatomical [bend, tilt, twist] the
 *     sliders and the AI use. The body's turn about the vertical is taken
 *     out, so every reference faces forward.
 *  2. Measure the result on our own mannequin (CMU's proportions differ:
 *     its upper body is short), as it will look in the app.
 *  3. Drop the in-between moments of just standing there, then keep the few
 *     most distinct of the rest (farthest-point sampling on where the hands,
 *     elbows, knees, feet and head are).
 *  4. Describe each pose (kneeling, airborne, hand to face…) so prompts can
 *     find it.
 *
 * Only the derived joint angles are written, never the raw clips (too big
 * for git; data/cmu/ is ignored).
 */

import fs from "node:fs";
import path from "node:path";
import { AnimationMixer, Bone, Group, MeshStandardMaterial, Quaternion, Vector3, type Object3D } from "three";
import { BVHLoader } from "three/examples/jsm/loaders/BVHLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createPoseSolver } from "../components/scene/poseSolver";
import { buildRig, type RigJoint } from "../components/scene/rig";
import { AI_JOINT_IDS, type AiAngles } from "../lib/ai/spec";
import type { LibraryPose } from "../lib/ai/library";
import type { JointId } from "../lib/joints";
import { compose, decompose, toQuat, type PoseData, type RigFrames } from "../lib/poseMath";

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "data/cmu");
const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, "lib/ai/poseLibrary.json");
const MODEL = path.join(ROOT, "public/models/mannequin.glb");

const SAMPLE_FPS = 12;
const MAX_PER_CLIP = 6;
/** Two moments closer than this (mean cm per body point) count as the same pose. */
const DISTINCT_CM = 9;
const LIBRARY_DUPLICATE_CM = 5;

/* ------------------------------------------------------------ our rig */

function arrayBuffer(file: string) {
  const b = fs.readFileSync(file);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/** Body points measured on our mannequin (cm above its lowest point, facing +Z). */
const POINTS = [
  "hips",
  "chestFront",
  "head",
  "leftElbow",
  "rightElbow",
  "leftWrist",
  "rightWrist",
  "leftKnee",
  "rightKnee",
  "leftFoot",
  "rightFoot",
] as const;
type Points = Record<(typeof POINTS)[number] | "face", Vector3>;

async function loadOurRig() {
  const gltf = await new GLTFLoader().parseAsync(arrayBuffer(MODEL), "");
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const rig = buildRig(model, new MeshStandardMaterial());
  if (!rig) throw new Error("mannequin has no skinned mesh");
  const frames = rig.frames as RigFrames;
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
  const solver = createPoseSolver(rig, model);
  /** Where the body points land for these angles, as the app would show them. */
  const measure = (angles: Angles) => {
    const pose: PoseData = {};
    for (const id of AI_JOINT_IDS) {
      const a = angles[id];
      const frame = frames[id];
      if (a && frame) pose[id] = compose(id, { bend: a[0], tilt: a[1], twist: a[2] }, frame);
    }
    const l = solver.landmarks(pose);
    const at = Object.fromEntries([...POINTS, "face"].map((k) => [k, l[k].clone().multiplyScalar(100)])) as Points;
    return { at, chestForward: l.chestForward.clone() };
  };
  const hipsCm = measure({}).at.hips.y;
  return { rig, parentJoint, parentRest, frames, measure, hipsCm };
}

/* ------------------------------------------------------------ CMU clips */

/**
 * The CMU bone(s) whose world motion each of our joints takes on (several
 * are averaged). CMU's spine and neck are split differently from ours:
 *   Hips → LowerBack (lower back) → Spine (upper back) → Spine1 (shoulders + neck base)
 *   → Neck → Neck1 → Head
 * Our waist takes the lower back, our chest the shoulder frame (so the arms
 * and neck hang right), and our neck the average of CMU's two neck pieces.
 * Everything else has the same name. CMU's fingers are a single stub per
 * hand, so they're left out (hands come out relaxed).
 */
const CMU_MOTION: Partial<Record<JointId, string[]>> = {
  spine: ["LowerBack"],
  chest: ["Spine1"],
  neck: ["Neck", "Neck1"],
};
const CMU_REQUIRED = ["Hips", "LowerBack", "Spine1", "Neck1", "Head", "LeftArm", "RightArm", "LeftUpLeg", "RightUpLeg"];

function loadClip(file: string) {
  const { skeleton, clip } = new BVHLoader().parse(fs.readFileSync(file, "utf8"));
  const root = new Group();
  root.add(skeleton.bones[0]);
  const bones = skeleton.bones;
  const byName = (name: string) => bones.find((b) => b.name === name);
  const mixer = new AnimationMixer(root);
  mixer.clipAction(clip).play();
  const frameTime = clip.tracks[0].times[1] - clip.tracks[0].times[0];
  const duration = clip.duration - frameTime;
  const count = Math.max(1, Math.floor(duration * SAMPLE_FPS));
  const at = (t: number) => {
    mixer.setTime(t);
    root.updateMatrixWorld(true);
  };
  return {
    bones,
    byName,
    count,
    rest: () => at(0),
    sample: (i: number) => at(frameTime + (count === 1 ? 0 : (i / (count - 1)) * duration * 0.999)),
  };
}

/* ------------------------------------------------------------ helpers */

type Angles = Partial<Record<JointId, AiAngles>>;

/** Mean distance (cm) between the same body points of two poses, measured from the hips. */
function shapeDistance(a: Points, b: Points) {
  let sum = 0;
  for (const k of POINTS) {
    if (k === "hips") {
      sum += Math.abs(a.hips.y - b.hips.y);
      continue;
    }
    const da = a[k].clone().sub(a.hips).setY(a[k].y);
    const db = b[k].clone().sub(b.hips).setY(b[k].y);
    sum += da.distanceTo(db);
  }
  return sum / POINTS.length;
}

const flatDistance = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

function cleanName(file: string) {
  const base = path.basename(file, path.extname(file));
  // An unrenamed clip ("79_72") keeps its number so it can still be traced.
  if (/^\d+_\d+$/.test(base)) return `CMU ${base}`;
  return base
    // "crying-79_72" → "crying": the CMU number is for us, not for search.
    .replace(/[-_\s]+\d+_\d+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------ describe */

interface Body {
  angles: Angles;
  at: Points;
  liftCm: number;
  /** Which way the chest faces (unit vector). */
  chestForward: Vector3;
}

/** Bones sit inside the body, so "touching the floor" still leaves a gap. */
const AIRBORNE_CM = 15;

/** Torso close to horizontal: head roughly level with the hips. */
const isLying = (at: Points) => at.head.y - at.hips.y < 30 && at.hips.y < 45;

/**
 * Just standing there: upright on straight legs, feet together, hands
 * hanging by the sides. Clips are full of these in-between moments, and
 * they teach the model nothing.
 */
function isNeutralStand({ at, liftCm }: Body, hipsCm: number) {
  if (isLying(at) || liftCm > AIRBORNE_CM) return false;
  if (at.hips.y < 0.92 * hipsCm) return false;
  if (flatDistance(at.head, at.hips) > 15) return false;
  // Feet side by side measure ~37 cm apart (ankle to ankle, on our mannequin).
  if (flatDistance(at.leftFoot, at.rightFoot) > 45 || Math.max(at.leftFoot.y, at.rightFoot.y) > 15) return false;
  // A hanging hand's wrist sits about level with the hips bone (which is high, near the navel).
  return [at.leftWrist, at.rightWrist].every((h) => h.y < at.hips.y + 5 && flatDistance(h, at.hips) < 35);
}

/** Plain-language descriptors so prompts can find poses by what the body does. */
function describe({ angles, at, liftCm, chestForward }: Body): string[] {
  const a = (id: JointId) => angles[id] ?? [0, 0, 0];
  const tags = new Set<string>();
  const [hb] = a("hips");
  const lying = isLying(at);
  const hipsY = at.hips.y;
  const wrists = [at.leftWrist, at.rightWrist];

  if (liftCm > AIRBORNE_CM && !lying) tags.add("airborne");
  if (lying) tags.add(chestForward.y > 0.5 ? "lying on back" : chestForward.y < -0.5 ? "lying face down" : "lying on side");
  if (!lying && wrists.some((w) => w.y < 18)) tags.add("hands on floor");
  for (const s of ["left", "right"] as const) {
    const thigh = a(`${s}Thigh`)[0];
    const shin = a(`${s}Shin`)[0];
    const other = a(`${s === "left" ? "right" : "left"}Thigh`)[0];
    // Kneeling means a knee is actually on (or at) the floor.
    const knee = s === "left" ? at.leftKnee : at.rightKnee;
    if (!lying && liftCm <= AIRBORNE_CM && shin > 70 && knee.y < 16) tags.add("kneeling");
    // Sitting and crouching fold both legs; one high thigh alone is a stride or a raised knee.
    if (thigh > 60 && other > 45 && !lying && liftCm <= 6) tags.add(hipsY < 30 ? "sitting on floor" : shin > 100 ? "crouching" : "sitting");
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

  // Arms by where the hands are (a hanging arm's angles say little: many
  // bend/twist pairs point it straight down).
  if (!lying) {
    const raised = wrists.filter((w) => w.y > at.head.y).length;
    if (raised === 2) tags.add("arms raised");
    else if (raised === 1) tags.add("one arm raised");
    const forward = wrists.filter((w) => w.z - at.chestFront.z > 30 && w.y > hipsY + 10).length;
    if (forward) tags.add(forward === 2 ? "arms forward" : "reaching forward");
  }

  // Wrists, not palms: a hand over the face leaves its wrist below and in
  // front of it; a hand on the cheek, beside the head (near the top of the neck).
  const nearFace = wrists.filter((w) => w.distanceTo(at.face) < 30 || w.distanceTo(at.head) < 22).length;
  if (nearFace === 2) tags.add("hands to face");
  else if (nearFace === 1) tags.add("hand to face");
  if (!lying && liftCm <= 6 && Math.abs(at.leftFoot.x - at.rightFoot.x) > 60) tags.add("wide stance");
  if (!lying && Math.abs(at.leftFoot.z - at.rightFoot.z) > 45) tags.add("stride");
  if (!tags.size || ![...tags].some((t) => /lying|kneel|sit|crouch|airborne/.test(t))) tags.add("standing");
  return [...tags];
}

/* ------------------------------------------------------------ extract */

async function main() {
  const { rig, parentJoint, parentRest, frames, measure, hipsCm } = await loadOurRig();
  const files = fs.existsSync(SRC_DIR) ? fs.readdirSync(SRC_DIR).filter((f) => /\.bvh$/i.test(f)).sort() : [];
  if (!files.length) throw new Error(`no .bvh files in ${SRC_DIR}`);

  const library: LibraryPose[] = [];
  const libraryShapes: Points[] = [];
  const q = new Quaternion();
  const qParent = new Quaternion();

  for (const file of files) {
    let clip: ReturnType<typeof loadClip>;
    try {
      clip = loadClip(path.join(SRC_DIR, file));
    } catch (e) {
      console.warn(`skip ${file}: ${(e as Error).message}`);
      continue;
    }
    const { bones, byName, count } = clip;
    const missing = CMU_REQUIRED.filter((k) => !byName(k));
    if (missing.length) {
      console.warn(`skip ${file}: not a CMU skeleton (no ${missing.join(", ")})`);
      continue;
    }

    // Rest (the T-pose in frame 0). Its height above the floor isn't to be
    // trusted (it borrows frame 1's), but its proportions are.
    clip.rest();
    const restWorld = new Map<Bone, Quaternion>(bones.map((b) => [b, b.getWorldQuaternion(new Quaternion())]));
    const restLowest = Math.min(...bones.map((b) => b.getWorldPosition(new Vector3()).y));
    // CMU units → cm, by leg length (lift off the floor is about the legs).
    const cmScale = hipsCm / (byName("Hips")!.getWorldPosition(new Vector3()).y - restLowest);

    const srcFor = new Map<JointId, Bone[]>();
    for (const j of rig.joints) {
      if (j.def.group) continue; // fingers
      const b = (CMU_MOTION[j.id] ?? [j.def.bone]).map(byName).filter((x): x is Bone => !!x);
      if (b.length) srcFor.set(j.id, b);
    }

    /** World rotation away from rest for a source bone (averaged over several). */
    const one = (b: Bone, out: Quaternion) => out.copy(b.getWorldQuaternion(new Quaternion())).multiply(restWorld.get(b)!.clone().invert());
    const delta = (bs: Bone[] | undefined, out: Quaternion) => {
      if (!bs?.length) return out.identity();
      one(bs[0], out);
      const other = new Quaternion();
      bs.slice(1).forEach((b, k) => out.slerp(one(b, other), 1 / (k + 2)));
      return out;
    };

    const samples: (Body & { lowest: number })[] = [];
    const heading = new Quaternion();
    const chestTurn = new Quaternion();
    for (let i = 0; i < count; i++) {
      clip.sample(i);

      // Which way the body as a whole is turned (hips and chest together),
      // about the vertical only. Taken back out so every reference faces
      // forward: the actor's walk across the room says nothing about the pose.
      delta(srcFor.get("hips"), heading).slerp(delta(srcFor.get("chest"), chestTurn), 0.5);
      heading.set(0, heading.y, 0, heading.w);
      if (heading.lengthSq() < 1e-8) heading.identity();
      else heading.normalize().invert();

      const angles: Angles = {};
      for (const j of rig.joints) {
        const srcBones = srcFor.get(j.id);
        if (!srcBones) continue;
        const parent = parentJoint.get(j.id);
        delta(srcBones, q);
        // Only the root carries the turn; everything else is relative to its parent.
        if (!parent) q.premultiply(heading);
        delta(parent ? srcFor.get(parent.id) : undefined, qParent);
        // d = PWR⁻¹ · Qparent⁻¹ · Qjoint · PWR  (see header)
        const pwr = parentRest.get(j.id)!;
        const d = pwr.clone().invert().multiply(qParent.clone().invert()).multiply(q).multiply(pwr);
        const frame = frames[j.id];
        if (!frame) continue;
        const ang = decompose(toQuat(d), frame);
        const v: AiAngles = [Math.round(ang.bend), Math.round(ang.tilt), Math.round(ang.twist)];
        if (v.some((x) => x !== 0)) angles[j.id] = v;
      }

      const lowest = Math.min(...bones.map((b) => b.getWorldPosition(new Vector3()).y));
      samples.push({ angles, lowest, liftCm: 0, ...measure(angles) });
    }
    // The floor is wherever the clip touches down (frame 0's height can't be
    // trusted: in a clip that starts lying down, it's sunk into the floor).
    const floor = Math.min(...samples.map((s) => s.lowest));
    for (const s of samples) s.liftCm = Math.max(0, (s.lowest - floor) * cmScale);

    // Skip the moments of just standing there, unless that's all the clip is.
    let candidates = samples.map((_, i) => i).filter((i) => !isNeutralStand(samples[i], hipsCm));
    const neutral = samples.length - candidates.length;
    if (!candidates.length) candidates = samples.map((_, i) => i);

    // Most distinct moments: start from the one farthest from the clip's
    // average shape, then keep adding whichever differs most from everything
    // kept so far.
    const mean = Object.fromEntries(
      POINTS.map((k) => [k, candidates.reduce((v, i) => v.add(samples[i].at[k]), new Vector3()).divideScalar(candidates.length)]),
    ) as Points;
    const kept = [candidates.reduce((best, i) => (shapeDistance(samples[i].at, mean) > shapeDistance(samples[best].at, mean) ? i : best))];
    while (kept.length < MAX_PER_CLIP) {
      let best = -1;
      let bestD = 0;
      for (const i of candidates) {
        const d = Math.min(...kept.map((k) => shapeDistance(samples[i].at, samples[k].at)));
        if (d > bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best < 0 || bestD < DISTINCT_CM) break;
      kept.push(best);
    }
    kept.sort((a, b) => a - b);

    const name = cleanName(file);
    let added = 0;
    for (const i of kept) {
      const s = samples[i];
      if (libraryShapes.some((p) => shapeDistance(p, s.at) < LIBRARY_DUPLICATE_CM)) continue;
      const floating = s.liftCm > AIRBORNE_CM && !isLying(s.at);
      library.push({
        id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${library.filter((p) => p.name === name).length + 1}`,
        name,
        tags: describe(s),
        pose: s.angles,
        left_hand: "relaxed",
        right_hand: "relaxed",
        stick_to_floor: !floating,
        lift_cm: floating ? Math.round(s.liftCm) : 0,
      });
      libraryShapes.push(s.at);
      added++;
    }
    console.log(
      `${file.padEnd(36)} ${String(count).padStart(4)} frames, ${String(neutral).padStart(3)} just standing → ${added} pose${added === 1 ? "" : "s"}`,
    );
  }

  fs.writeFileSync(OUT, JSON.stringify(library) + "\n");
  console.log(`\n${library.length} poses from ${files.length} clips → ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
