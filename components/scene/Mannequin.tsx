"use client";

import { Html, useGLTF } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import type CameraControlsImpl from "camera-controls";
import { useEffect, useMemo, useRef } from "react";
import {
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  Plane,
  Quaternion,
  Raycaster,
  SkinnedMesh,
  Vector2,
  Vector3,
} from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { LIGHT_IDS, LIGHT_UNIT, lightingStore, TOON_CUTS } from "@/lib/lighting";
import { constrain, IDENTITY, toQuat, type PoseData } from "@/lib/poseMath";
import { poseStore, usePoseStore } from "@/lib/poseStore";
import { OutlineMaterial } from "./outlineMaterial";
import { BodyMover } from "./BodyMover";
import { buildRig, NO_JOINT, type Rig, type RigJoint } from "./rig";

export const MODEL_URL = "/models/mannequin.glb";
const TARGET_HEIGHT = 1.8; // metres; the camera presets assume this
/** How quickly the figure eases into a newly loaded pose (higher = snappier). */
const POSE_EASE = 9;

const bufferSize = new Vector2();

function setCursor(el: HTMLElement, cursor: string) {
  el.style.cursor = cursor;
}

/**
 * Put the figure at (x, z) and measure how low it reaches at height 0.
 * Sampled while things move; exact, with a fresh hit-test mesh, once settled.
 * Returns that lowest point's height.
 */
function measureAt(place: Group, ground: Group, rig: Rig, x: number, z: number, exact: boolean) {
  place.position.set(x, 0, z);
  ground.position.y = 0;
  place.updateMatrixWorld(true);
  return rig.skin({ step: exact ? 1 : 6, updatePick: exact });
}

/** Raise (or lower) the whole figure by `height` metres. */
function raise(ground: Group, height: number) {
  ground.position.y = height;
}

/**
 * How low `pose` reaches when the figure isn't raised or lowered — without
 * showing it: pose the bones, skin, then put everything back this frame.
 * Lets an AI result like "float 45 cm" become an exact height.
 */
function measurePose(place: Group, ground: Group, rig: Rig, pose: PoseData): number {
  const snap = rig.snapshot();
  const at = place.position.clone();
  const height = ground.position.y;
  rig.applyRaw(pose);
  place.position.set(0, 0, 0);
  ground.position.y = 0;
  place.updateMatrixWorld(true);
  const lowest = rig.skin({ step: 2 });
  rig.restore(snap);
  place.position.copy(at);
  ground.position.y = height;
  place.updateMatrixWorld(true);
  return lowest;
}

export function Mannequin({
  onReady,
  outline = true,
  outlineWidth = 2.25,
  outlineColor = "#0d0d0f",
  bodyColor = "#e7e5e2",
}: {
  onReady?: () => void;
  outline?: boolean;
  /** Contour width in CSS pixels. */
  outlineWidth?: number;
  outlineColor?: string;
  bodyColor?: string;
}) {
  const { scene } = useGLTF(MODEL_URL);
  const place = useRef<Group>(null);
  const ground = useRef<Group>(null);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const { model, scale, offset, rig, setOutlineVisible, setOutlineWidth, setColors } = useMemo(() => {
    // Clone so posing never mutates the cached GLTF (and StrictMode double
    // mounts stay independent).
    const model = cloneSkinned(scene);
    const material = new MeshStandardMaterial({ color: "#e7e5e2", roughness: 0.58, metalness: 0 });
    const outlineMaterial = new OutlineMaterial();
    const skinned: SkinnedMesh[] = [];

    model.traverse((obj) => {
      if ((obj as Mesh).isMesh) {
        const mesh = obj as Mesh;
        mesh.material = material;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Bones move the mesh outside its rest-pose bounds once posed.
        mesh.frustumCulled = false;
        if ((mesh as SkinnedMesh).isSkinnedMesh) skinned.push(mesh as SkinnedMesh);
      }
    });

    // The Sketchfab export is in centimetres with wrapper transforms, so
    // measure the skinned result and normalise: 1.8m tall, feet on y=0.
    model.updateMatrixWorld(true);
    const box = new Box3();
    for (const mesh of skinned) box.expandByObject(mesh, true);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const scale = TARGET_HEIGHT / size.y;
    const offset: [number, number, number] = [-center.x * scale, -box.min.y * scale, -center.z * scale];

    // The rig adds a per-vertex joint attribute, so build it before the
    // outline hull copies the geometry.
    const rig = buildRig(model, material);

    // Contour shell: same skeleton, smoothed normals (so UV seams don't
    // split the hull into gaps), back faces only.
    const hulls: SkinnedMesh[] = [];
    const line = { px: 2.25 };
    for (const mesh of skinned) {
      const hull = new SkinnedMesh(toCreasedNormals(mesh.geometry, Math.PI), outlineMaterial);
      hull.bind(mesh.skeleton, mesh.bindMatrix);
      hull.frustumCulled = false;
      hull.renderOrder = 1;
      hull.raycast = () => {};
      // Keep the line width in true pixels across resizes and DPR changes.
      hull.onBeforeRender = (renderer) => {
        renderer.getDrawingBufferSize(bufferSize);
        outlineMaterial.uniforms.resolution.value.copy(bufferSize);
        outlineMaterial.uniforms.width.value = line.px * renderer.getPixelRatio();
      };
      mesh.add(hull);
      hulls.push(hull);
    }
    const setOutlineVisible = (visible: boolean) => hulls.forEach((h) => (h.visible = visible));
    const setOutlineWidth = (px: number) => {
      line.px = px;
    };
    const setColors = (body: string, contour: string) => {
      material.color.set(body);
      outlineMaterial.uniforms.color.value.set(contour);
    };
    return { model, scale, offset, rig, setOutlineVisible, setOutlineWidth, setColors };
  }, [scene]);

  useEffect(() => setOutlineVisible(outline), [outline, setOutlineVisible]);
  useEffect(() => setOutlineWidth(outlineWidth), [outlineWidth, setOutlineWidth]);
  useEffect(() => setColors(bodyColor, outlineColor), [bodyColor, outlineColor, setColors]);

  useEffect(() => {
    if (rig) poseStore.setFrames(rig.frames);
  }, [rig]);

  useEffect(() => {
    if (!rig) return;
    poseStore.setMeasurer((pose) =>
      place.current && ground.current ? measurePose(place.current, ground.current, rig, pose) : null,
    );
    return () => poseStore.setMeasurer(null);
  }, [rig]);

  useTint(rig);
  useToonShading(rig);
  usePoseDriver(rig, place, ground);
  const handlers = usePosingGestures(rig);

  // place: where the figure stands (world metres) · ground: rests it on the
  // floor · inner group: normalises the model's own units.
  return (
    <>
      <group ref={place}>
        <group ref={ground}>
          <group position={offset} scale={scale}>
            <primitive object={model} {...handlers} />
          </group>
        </group>
      </group>
      {rig && <PivotMarker rig={rig} />}
      {rig && <BodyMover rig={rig} />}
    </>
  );
}

useGLTF.preload(MODEL_URL);

/* ------------------------------------------------------------------------ */

/**
 * Eases bones and position toward the store's pose, then sets the height:
 * - grounded (default): the lowest point rests on the floor, so kneeling or
 *   crouching just works
 * - floating: the figure holds its saved height; posing moves only limbs
 * Switching between the two eases instead of jumping.
 */
function usePoseDriver(
  rig: Rig | null,
  place: React.RefObject<Group | null>,
  ground: React.RefObject<Group | null>,
) {
  const last = useRef<{ pose: unknown; settled: boolean; floating: boolean }>({
    pose: null,
    settled: false,
    floating: false,
  });
  const xz = useRef(new Vector2());
  const xzTarget = useRef(new Vector2());
  const height = useRef(0);

  useFrame((_, dt) => {
    const p = place.current;
    const g = ground.current;
    if (!rig || !p || !g) return;
    const { pose, instant, dragging } = poseStore.get();
    if (pose === last.current.pose && last.current.settled) return;

    const k = 1 - Math.exp(-dt * POSE_EASE);
    let moving = rig.drive(pose, instant, dt, POSE_EASE);
    const [tx, th, tz] = pose.root ?? [0, 0, 0];
    xzTarget.current.set(tx, tz);
    if (instant || xz.current.distanceTo(xzTarget.current) < 1e-4) xz.current.copy(xzTarget.current);
    else {
      xz.current.lerp(xzTarget.current, k);
      moving = true;
    }

    const floating = !!pose.floating;
    const settledLimbs = !moving && !dragging;
    const lowest = measureAt(p, g, rig, xz.current.x, xz.current.y, settledLimbs);
    const target = floating ? th : -lowest;
    // Grounded height tracks the limbs exactly during a drag; a mode switch
    // or a newly loaded pose eases instead of jumping.
    const snap = instant && floating === last.current.floating;
    if (snap || Math.abs(height.current - target) < 1e-4) height.current = target;
    else {
      height.current += (target - height.current) * k;
      moving = true;
    }
    raise(g, height.current);

    const settled = !moving && !dragging;
    poseStore.reportFooting(lowest, height.current, settled);
    last.current = { pose, settled, floating };
  });
}

/** Hover and selection highlight on the body itself. */
function useTint(rig: Rig | null) {
  useEffect(() => {
    if (!rig) return;
    const apply = () => rig.setTint(poseStore.get());
    apply();
    return poseStore.subscribe(apply);
  }, [rig]);
}

/**
 * Ambient light received by a surface at "ambient" 1 (environment + sky),
 * relative to its colour. Places the toon cut-offs above the shadow floor.
 */
const AMBIENT_RECEIVED = 0.55;

/** Lighting's value-study mode → the body shader's bands. */
function useToonShading(rig: Rig | null) {
  useEffect(() => {
    if (!rig) return;
    const apply = () => {
      const { shading, ambient, lights } = lightingStore.get();
      const strongest = Math.max(0.01, ...LIGHT_IDS.map((id) => (lights[id].on ? lights[id].intensity : 0)));
      // Light received from the strongest light, square on (Lambert /π).
      const full = (strongest * LIGHT_UNIT) / Math.PI;
      const floor = ambient * AMBIENT_RECEIVED;
      rig.setToon(
        shading === "two" ? 2 : shading === "three" ? 3 : 0,
        [floor + TOON_CUTS.two * full, floor + TOON_CUTS.threeLow * full, floor + TOON_CUTS.threeHigh * full],
        ambient,
      );
    };
    apply();
    return lightingStore.subscribe(apply);
  }, [rig]);
}

/**
 * Direct manipulation: press a body part and drag. The point you grabbed
 * follows the pointer, rotating the part about its joint. Shift-drag twists
 * it around its own length instead.
 */
function usePosingGestures(rig: Rig | null) {
  const { camera, gl } = useThree();
  const getState = useThree((s) => s.get);
  const tools = useMemo(
    () => ({ raycaster: new Raycaster(), ndc: new Vector2(), hit: new Vector3(), plane: new Plane() }),
    [],
  );

  const jointAt = (e: ThreeEvent<PointerEvent>): RigJoint | null => {
    if (!rig || e.object !== rig.pick || !e.face) return null;
    const { a, b, c } = e.face;
    const ja = rig.vertexJoint[a];
    const jb = rig.vertexJoint[b];
    const idx = ja === jb || ja === rig.vertexJoint[c] ? ja : jb === rig.vertexJoint[c] ? jb : ja;
    return idx === NO_JOINT ? null : rig.joints[idx];
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const { dragging, viewOnly } = poseStore.get();
    if (dragging) return;
    if (viewOnly) return setCursor(gl.domElement, "");
    const j = jointAt(e);
    poseStore.hover(j?.id ?? null, j ? { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY } : null);
    setCursor(gl.domElement, j ? "grab" : "");
  };

  const onPointerOut = () => {
    if (poseStore.get().dragging) return;
    poseStore.hover(null);
    setCursor(gl.domElement, "");
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    // Right-drag still pans; with the interface hidden, every drag orbits.
    if (e.button !== 0 || !rig || poseStore.get().viewOnly) return;
    const joint = jointAt(e);
    if (!joint) return;
    e.stopPropagation();
    const frame = rig.frames[joint.id];
    if (!frame) return;

    // Hold the camera still while posing; orbiting resumes on release.
    const cc = getState().controls as unknown as CameraControlsImpl | null;
    if (cc) cc.enabled = false;
    poseStore.select(joint.id);
    poseStore.hover(null);
    poseStore.setDragging(true);
    poseStore.beginEdit();
    setCursor(gl.domElement, "grabbing");

    const { bone } = joint;
    const pivot0 = bone.getWorldPosition(new Vector3());
    const grabOffset = e.point.clone().sub(pivot0);
    const facing = camera.getWorldDirection(new Vector3());
    tools.plane.setFromNormalAndCoplanarPoint(facing, e.point);
    const parentQ = bone.parent!.getWorldQuaternion(new Quaternion());
    const parentInv = parentQ.clone().invert();
    const start = new Quaternion().fromArray(poseStore.get().pose[joint.id] ?? IDENTITY);
    // Current world direction of the part, for twisting.
    const segment = joint.tip.getWorldPosition(new Vector3()).sub(pivot0).normalize();
    const rect = gl.domElement.getBoundingClientRect();
    const pivotScreen = pivot0.clone().project(camera);
    const toScreen = (x: number, y: number) =>
      Math.atan2(y - (rect.top + (1 - pivotScreen.y) * 0.5 * rect.height), x - (rect.left + (pivotScreen.x + 1) * 0.5 * rect.width));
    const startAngle = toScreen(e.nativeEvent.clientX, e.nativeEvent.clientY);
    const swing = new Quaternion();
    const next = new Quaternion();

    const move = (ev: PointerEvent) => {
      if (ev.shiftKey) {
        // Twist: circle the pointer around the joint. Clockwise on screen
        // turns clockwise as seen by the viewer.
        const angle = toScreen(ev.clientX, ev.clientY) - startAngle;
        const away = segment.dot(facing) > 0 ? 1 : -1;
        swing.setFromAxisAngle(segment, angle * away);
      } else {
        tools.ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
        tools.raycaster.setFromCamera(tools.ndc, camera);
        if (!tools.raycaster.ray.intersectPlane(tools.plane, tools.hit)) return;
        const pivot = bone.getWorldPosition(new Vector3());
        swing.setFromUnitVectors(grabOffset.clone().normalize(), tools.hit.sub(pivot).normalize());
      }
      // World-space rotation → parent space, applied on top of where we started.
      next.copy(parentInv).multiply(swing).multiply(parentQ).multiply(start);
      poseStore.setJoint(joint.id, constrain(joint.id, toQuat(next), frame));
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (cc) cc.enabled = true;
      poseStore.setDragging(false);
      poseStore.endEdit();
      setCursor(gl.domElement, "");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return { onPointerMove, onPointerOut, onPointerDown };
}

/** A small ring at the selected joint's pivot: "this is what it turns around". */
function PivotMarker({ rig }: { rig: Rig }) {
  const selected = usePoseStore((s) => s.selected);
  const anchor = useRef<Group>(null);
  const joint = selected ? rig.byId[selected] : undefined;

  useFrame(() => {
    if (!joint || !anchor.current?.parent) return;
    joint.bone.getWorldPosition(anchor.current.position);
    anchor.current.parent.worldToLocal(anchor.current.position);
  });

  if (!joint) return null;
  return (
    <group ref={anchor}>
      <Html center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
        <div className="pivot-marker" />
      </Html>
    </group>
  );
}
