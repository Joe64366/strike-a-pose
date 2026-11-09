import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Bone,
  type MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh,
} from "three";
import { boneMatches, dirVector, JOINTS, type AxisDef, type JointDef, type JointId } from "@/lib/joints";
import { IDENTITY, toQuat, type JointFrame, type PoseData, type RigFrames } from "@/lib/poseMath";

/** Max joints the tint shader can address; the last slot means "none". */
const TINT_SLOTS = 64;
export const NO_JOINT = TINT_SLOTS - 1;

export interface RigJoint {
  id: JointId;
  def: JointDef;
  index: number;
  bone: Bone;
  /** Bone at the far end of the segment (gives its direction). */
  tip: Bone;
  /** Bone's local rotation in the rest pose. */
  rest: Quaternion;
  /** Joint indices that move when this one rotates (including itself). */
  subtree: number[];
}

export interface Rig {
  joints: RigJoint[];
  byId: Partial<Record<JointId, RigJoint>>;
  frames: RigFrames;
  mesh: SkinnedMesh;
  /** Invisible, CPU-skinned copy of the body used for hit-testing. */
  pick: Mesh;
  /** Joint index under each vertex (dominant skin weight). */
  vertexJoint: Uint8Array;
  /** Per-joint highlight strength (0–1), read by the body shader. */
  tint: { value: Float32Array };
  /** CPU skinning. Returns the lowest world Y; optionally refreshes the pick mesh. */
  skin: (opts: { step?: number; updatePick?: boolean }) => number;
  /** Ease bones toward `pose` (or snap if `instant`). Returns true while still moving. */
  drive: (pose: PoseData, instant: boolean, dt: number, ease: number) => boolean;
  /** Body highlight for the hovered part, selected part, and what it carries. */
  setTint: (s: { hovered: JointId | null; selected: JointId | null; dragging: boolean }) => void;
  /** Set bones straight to `pose` (no easing) — for measuring; pair with snapshot/restore. */
  applyRaw: (pose: PoseData) => void;
  snapshot: () => Quaternion[];
  restore: (snap: Quaternion[]) => void;
}

export const TINT = { hover: 0.26, selected: 0.38, carried: 0.12 };

const v = new Vector3();
const q = new Quaternion();

export function buildRig(model: Object3D, material: MeshStandardMaterial): Rig | null {
  let mesh: SkinnedMesh | undefined;
  model.traverse((o) => {
    if (!mesh && (o as SkinnedMesh).isSkinnedMesh) mesh = o as SkinnedMesh;
  });
  if (!mesh) return null;
  const skinned = mesh;
  const bones = skinned.skeleton.bones;
  const findBone = (key: string) => bones.find((b) => boneMatches(b.name, key));

  model.updateMatrixWorld(true);

  // --- Joints and their anatomical frames (measured from the rest pose) ---
  const joints: RigJoint[] = [];
  const frames: RigFrames = {};
  for (const def of JOINTS) {
    const bone = findBone(def.bone);
    const tip = findBone(def.tip);
    if (!bone || !tip || !bone.parent) continue;
    const frame = measureFrame(def, bone, tip);
    joints.push({ id: def.id, def, index: joints.length, bone, tip, rest: bone.quaternion.clone(), subtree: [] });
    frames[def.id] = frame;
  }
  const byId = Object.fromEntries(joints.map((j) => [j.id, j])) as Rig["byId"];

  const isAncestor = (a: Object3D, b: Object3D) => {
    for (let n: Object3D | null = b; n; n = n.parent) if (n === a) return true;
    return false;
  };
  for (const j of joints) j.subtree = joints.filter((k) => isAncestor(j.bone, k.bone)).map((k) => k.index);

  // --- Which joint owns each bone (fingers → hand, toes → foot, …) ---
  const jointOfBone = bones.map((b) => {
    for (let n: Object3D | null = b; n; n = n.parent) {
      const hit = joints.find((j) => j.bone === n);
      if (hit) return hit.index;
    }
    return NO_JOINT;
  });

  // --- Per-vertex owner joint, from the dominant skin weight ---
  const geo = skinned.geometry;
  const count = geo.attributes.position.count;
  const skinIndex = geo.attributes.skinIndex;
  const skinWeight = geo.attributes.skinWeight;
  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  const vertexJoint = new Uint8Array(count);
  const jointAttr = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let best = 0;
    let bestW = -1;
    for (let k = 0; k < 4; k++) {
      const bi = skinIndex.getComponent(i, k);
      const w = skinWeight.getComponent(i, k);
      indices[i * 4 + k] = bi;
      weights[i * 4 + k] = w;
      if (w > bestW) {
        bestW = w;
        best = bi;
      }
    }
    vertexJoint[i] = jointOfBone[best];
    jointAttr[i] = jointOfBone[best];
  }
  geo.setAttribute("jointIndex", new BufferAttribute(jointAttr, 1));

  // --- Hover/selection tint, injected into the standard material ---
  const tint = { value: new Float32Array(TINT_SLOTS) };
  const tintColor = { value: new Color("#0a84ff") };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTint = tint;
    shader.uniforms.uTintColor = tintColor;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         attribute float jointIndex;
         uniform float uTint[${TINT_SLOTS}];
         varying float vTint;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vTint = uTint[int(jointIndex + 0.5)];`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform vec3 uTintColor;
         varying float vTint;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         diffuseColor.rgb = mix(diffuseColor.rgb, uTintColor, vTint);`,
      );
  };
  material.customProgramCacheKey = () => "mannequin-tint";

  // --- CPU skinning (mirrors three's GPU path, minus the allocations) ---
  const position = geo.attributes.position;
  const bindPos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(skinned.bindMatrix);
    bindPos.set([v.x, v.y, v.z], i * 3);
  }
  const pickGeo = new BufferGeometry();
  const pickPos = new BufferAttribute(new Float32Array(count * 3), 3);
  pickGeo.setAttribute("position", pickPos);
  if (geo.index) pickGeo.setIndex(geo.index);
  const pick = new Mesh(pickGeo, new MeshBasicMaterial({ visible: false }));
  pick.name = "rig-pick";
  skinned.add(pick);
  // Raycasting the real skinned mesh skins every vertex per test; use the pick mesh.
  skinned.raycast = () => {};

  const toWorld = new Matrix4();
  const skin: Rig["skin"] = ({ step = 1, updatePick = false }) => {
    skinned.skeleton.update();
    const bm = skinned.skeleton.boneMatrices!;
    toWorld.multiplyMatrices(skinned.matrixWorld, skinned.bindMatrixInverse);
    const w = toWorld.elements;
    const inv = skinned.bindMatrixInverse.elements;
    const out = pickPos.array as Float32Array;
    let minY = Infinity;
    for (let i = 0; i < count; i += step) {
      const px = bindPos[i * 3];
      const py = bindPos[i * 3 + 1];
      const pz = bindPos[i * 3 + 2];
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let k = 0; k < 4; k++) {
        const wt = weights[i * 4 + k];
        if (wt === 0) continue;
        const b = indices[i * 4 + k] * 16;
        sx += wt * (bm[b] * px + bm[b + 4] * py + bm[b + 8] * pz + bm[b + 12]);
        sy += wt * (bm[b + 1] * px + bm[b + 5] * py + bm[b + 9] * pz + bm[b + 13]);
        sz += wt * (bm[b + 2] * px + bm[b + 6] * py + bm[b + 10] * pz + bm[b + 14]);
      }
      const y = w[1] * sx + w[5] * sy + w[9] * sz + w[13];
      if (y < minY) minY = y;
      if (updatePick) {
        out[i * 3] = inv[0] * sx + inv[4] * sy + inv[8] * sz + inv[12];
        out[i * 3 + 1] = inv[1] * sx + inv[5] * sy + inv[9] * sz + inv[13];
        out[i * 3 + 2] = inv[2] * sx + inv[6] * sy + inv[10] * sz + inv[14];
      }
    }
    if (updatePick) {
      pickPos.needsUpdate = true;
      pickGeo.computeBoundingSphere();
      pickGeo.computeBoundingBox();
    }
    return minY;
  };
  skin({ updatePick: true });

  const display = joints.map(() => new Quaternion());
  const target = new Quaternion();
  const drive: Rig["drive"] = (pose, instant, dt, ease) => {
    let moving = false;
    const k = 1 - Math.exp(-dt * ease);
    for (const j of joints) {
      const cur = display[j.index];
      target.fromArray(pose[j.id] ?? IDENTITY);
      if (instant || cur.angleTo(target) < 1e-4) cur.copy(target);
      else {
        cur.slerp(target, k);
        moving = true;
      }
      j.bone.quaternion.multiplyQuaternions(cur, j.rest);
    }
    return moving;
  };

  const setTint: Rig["setTint"] = ({ hovered, selected, dragging }) => {
    const t = tint.value;
    t.fill(0);
    const sel = selected ? byId[selected] : undefined;
    if (sel) {
      for (const i of sel.subtree) t[i] = TINT.carried;
      t[sel.index] = TINT.selected;
    }
    const hov = hovered ? byId[hovered] : undefined;
    if (hov && !dragging && hov !== sel) t[hov.index] = Math.max(t[hov.index], TINT.hover);
  };

  const applyRaw: Rig["applyRaw"] = (pose) => {
    for (const j of joints) j.bone.quaternion.multiplyQuaternions(target.fromArray(pose[j.id] ?? IDENTITY), j.rest);
  };
  const snapshot: Rig["snapshot"] = () => joints.map((j) => j.bone.quaternion.clone());
  const restore: Rig["restore"] = (snap) => joints.forEach((j, i) => j.bone.quaternion.copy(snap[i]));

  return { joints, byId, frames, mesh: skinned, pick, vertexJoint, tint, skin, drive, setTint, applyRaw, snapshot, restore };
}

/**
 * Builds the joint's (bend, tilt, twist) axes from what they should *do* at
 * rest, then expresses them in the parent bone's space so rotations stay
 * relative to the parent (an elbow bends relative to the upper arm).
 */
function measureFrame(def: JointDef, bone: Bone, tip: Bone): JointFrame {
  const pivot = bone.getWorldPosition(new Vector3());
  const T = tip.getWorldPosition(new Vector3()).sub(pivot).normalize();
  const dir = (d: AxisDef["from"] | AxisDef["to"]) =>
    d === "tip" ? T.clone() : new Vector3(...dirVector(d, def.side));
  const axisOf = (a: AxisDef) => new Vector3().crossVectors(dir(a.from), dir(a.to)).normalize();

  // Twist runs along the segment; its sign comes from the twist definition.
  let a3 = T.clone();
  if (def.twist && axisOf(def.twist).dot(T) < 0) a3.negate();

  // Bend: exactly perpendicular to the segment.
  const a1 = def.bend ? axisOf(def.bend) : new Vector3(1, 0, 0);
  a1.addScaledVector(a3, -a1.dot(a3)).normalize();

  // Tilt: completes the frame, pointed the way its definition asks.
  const a2 = new Vector3().crossVectors(a3, a1).normalize();
  if (def.tilt && a2.dot(axisOf(def.tilt)) < 0) a2.negate();

  // Keep the basis right-handed so it's a pure rotation; if that means
  // reversing the twist axis, flip the twist's displayed sign instead.
  const signs: [number, number, number] = [1, 1, 1];
  if (new Vector3().crossVectors(a1, a2).dot(a3) < 0) {
    a3 = a3.negate();
    signs[2] = -1;
  }

  const toParent = bone.parent!.getWorldQuaternion(q).invert();
  for (const a of [a1, a2, a3]) a.applyQuaternion(toParent);
  const basis = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(a1, a2, a3));
  return { basis: toQuat(basis), signs };
}
