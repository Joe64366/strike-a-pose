"use client";

import { Line } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import type CameraControlsImpl from "camera-controls";
import { useEffect, useMemo, useRef, useState } from "react";
import { Color, Quaternion, Raycaster, Vector2, Vector3, type Camera, type DirectionalLight, type Group } from "three";
import {
  anglesOf,
  describeDirection,
  LIGHT_IDS,
  LIGHT_INFO,
  LIGHT_UNIT,
  lightDirection,
  lightingStore,
  lightingUi,
  MAX_ELEVATION,
  MIN_ELEVATION,
  useLighting,
  useLightingUi,
  type LightId,
  type LightSpec,
} from "@/lib/lighting";
import { poseStore } from "@/lib/poseStore";
import { LensHtml } from "./LensHtml";
import { lensMarkerScale, lensOn, pointerNdc, setPointerRay } from "./lens";
import { NO_SNAPSHOT } from "./snapshotPrep";
import { SHADOW_FAR_REACH, SHADOW_HALF_SIZE, SHADOW_NEAR_REACH, shadowBiasFor, shadowMapSize } from "./softShadows";

/** Chest height of the 1.8 m figure: what every light aims at. */
const CENTER_Y = 0.95;
/** Where the bulbs float, metres from the figure's centre. */
const HANDLE_RADIUS = 1.45;
/** Real light position (only matters for the shadow camera). */
const LIGHT_DISTANCE = 8;
/** Sky light at ambient 1; the environment reflections follow the same slider. */
const HEMI_AT_FULL = 1.25;
/** Bulb scale per metre of camera distance: keeps it ~20 px across on screen. */
const BULB_SCREEN_SCALE = 0.13;
const ACCENT = new Color("#0a84ff");
const noRaycast = () => {};

function figureCenter(out: Vector3) {
  const { pose, floorGap } = poseStore.get();
  const [x, , z] = pose.root ?? [0, 0, 0];
  return out.set(x, CENTER_Y + floorGap, z);
}

function setCursor(el: HTMLElement, cursor: string) {
  el.style.cursor = cursor;
}

const camAt = new Vector3();
/**
 * Turn a bulb's disc toward the viewer. Normally square to the screen (like a
 * billboard); through the fish-eye lens, toward the camera itself, since a
 * bulb out at the side of the lens's wide view would otherwise be seen edge-on.
 * (Its parent groups only move and scale, never turn.)
 */
function faceCamera(o: Group | null, camera: Camera) {
  if (!o) return;
  if (lensOn()) o.lookAt(camera.getWorldPosition(camAt));
  else o.quaternion.copy(camera.quaternion);
}

/**
 * The stage's lights: sky fill plus key, fill and rim, all aimed at the
 * figure and travelling with it. While the lighting panel is open, each
 * shows as a bulb you can drag around the figure.
 */
export function StageLights({ ground }: { ground: string }) {
  const lighting = useLighting();
  const open = useLightingUi((s) => s.open);
  return (
    <>
      <hemisphereLight color="#ffffff" groundColor={ground} intensity={lighting.ambient * HEMI_AT_FULL} />
      {LIGHT_IDS.map((id) => (
        <SceneLight key={id} spec={lighting.lights[id]} maxMapSize={id === "key" ? 2048 : 1024} />
      ))}
      {/* Through the fish-eye lens too: picking and labels go through it (lens.ts). */}
      {open && LIGHT_IDS.map((id) => <LightHandle key={id} id={id} spec={lighting.lights[id]} />)}
    </>
  );
}

function SceneLight({ spec, maxMapSize }: { spec: LightSpec; maxMapSize: number }) {
  const ref = useRef<DirectionalLight>(null);
  const center = useMemo(() => new Vector3(), []);
  const [dx, dy, dz] = lightDirection(spec.azimuth, spec.elevation);
  // Softness = shadow-map resolution (see softShadows.ts): coarser = softer.
  const mapSize = shadowMapSize(spec.softness, maxMapSize);

  // three keeps a shadow map at the size it was first made; drop it so the
  // next frame rebuilds it at the new size.
  useEffect(() => {
    const shadow = ref.current?.shadow;
    if (shadow?.map) {
      shadow.map.dispose();
      shadow.map = null;
    }
  }, [mapSize]);

  useFrame(() => {
    const l = ref.current;
    if (!l) return;
    figureCenter(center);
    l.position.set(center.x + dx * LIGHT_DISTANCE, center.y + dy * LIGHT_DISTANCE, center.z + dz * LIGHT_DISTANCE);
    l.target.position.copy(center);
    l.target.updateMatrixWorld();
  });

  // Always mounted (an "off" light just goes dark), so toggling never
  // forces the renderer to rebuild its shaders mid-interaction.
  return (
    <directionalLight
      ref={ref}
      color={spec.color}
      intensity={spec.on ? spec.intensity * LIGHT_UNIT : 0}
      castShadow={spec.on && spec.shadows && spec.intensity > 0}
      shadow-mapSize={[mapSize, mapSize]}
      // Shadows record the body's light-facing side (see Mannequin). Each
      // point is tested slightly closer to the light; softShadows.ts reads
      // `normalBias` as the base of that slope-scaled bias (about one texel,
      // more where the light only skims), so skin never shadows itself while
      // outlines stay exact.
      shadow-bias={0}
      shadow-normalBias={shadowBiasFor(mapSize)}
    >
      {/* From just in front of the figure (the light sits 8 m out) to well past
          it, so a low light's long shadow is never cut off (see softShadows.ts). */}
      <orthographicCamera
        attach="shadow-camera"
        args={[
          -SHADOW_HALF_SIZE,
          SHADOW_HALF_SIZE,
          SHADOW_HALF_SIZE,
          -SHADOW_HALF_SIZE,
          LIGHT_DISTANCE - SHADOW_NEAR_REACH,
          LIGHT_DISTANCE + SHADOW_FAR_REACH,
        ]}
      />
    </directionalLight>
  );
}

/* --------------------------------------------------------------- handles */

/**
 * A light you can grab. The bulb sticks to the pointer on an invisible
 * sphere around the figure; dragging past the sphere's edge carries it on
 * around the back, so lighting from behind needs no camera move. Bulbs on
 * the far side draw faded, so you always know which side a light is on.
 */
function LightHandle({ id, spec }: { id: LightId; spec: LightSpec }) {
  const selected = useLightingUi((s) => s.selected === id);
  const dragging = useLightingUi((s) => s.dragging === id);
  const { camera, gl } = useThree();
  const getState = useThree((s) => s.get);
  const group = useRef<Group>(null);
  const bulb = useRef<Group>(null);
  const face = useRef<Group>(null);
  const [hot, setHot] = useState(false);
  const [behind, setBehind] = useState(false);
  const behindRef = useRef(false);
  const tmp = useMemo(() => ({ center: new Vector3(), cam: new Vector3() }), []);
  const dir = lightDirection(spec.azimuth, spec.elevation);
  const d = new Vector3(...dir);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    figureCenter(tmp.center);
    g.position.copy(tmp.center).addScaledVector(d, HANDLE_RADIUS);
    // Same size on screen however near or far the bulb is (and through the lens).
    bulb.current?.scale.setScalar(camera.position.distanceTo(g.position) * BULB_SCREEN_SCALE * lensMarkerScale(camera));
    faceCamera(face.current, camera);
    camera.getWorldPosition(tmp.cam).sub(tmp.center);
    const b = d.dot(tmp.cam) < 0;
    if (b !== behindRef.current) {
      behindRef.current = b;
      setBehind(b);
    }
  });

  // Arrowhead pointing from the bulb at the figure.
  const coneQ = useMemo(
    () => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(-dir[0], -dir[1], -dir[2])),
    [dir[0], dir[1], dir[2]], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const cc = getState().controls as unknown as CameraControlsImpl | null;
    if (cc) cc.enabled = false;
    lightingUi.set({ selected: id, dragging: id });
    setCursor(gl.domElement, "grabbing");

    const rect = gl.domElement.getBoundingClientRect();
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const center = figureCenter(new Vector3());
    const start = lightDirection(lightingStore.get().lights[id].azimuth, lightingStore.get().lights[id].elevation);
    // Which half of the sphere the bulb is on, seen from the camera.
    const toCam = camera.getWorldPosition(new Vector3()).sub(center);
    let side = start[0] * toCam.x + start[1] * toCam.y + start[2] * toCam.z >= 0 ? 1 : -1;
    let past = 0; // how far round the edge the pointer has carried it (radians)
    const c = new Vector3();
    const u = new Vector3();
    const v = new Vector3();
    const startX = e.nativeEvent.clientX;
    const startY = e.nativeEvent.clientY;
    let moved = false;

    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 3) return;
      moved = true;
      pointerNdc(ev.clientX, ev.clientY, rect, ndc);
      setPointerRay(raycaster, ndc, camera, rect.width / rect.height);
      const { origin, direction } = raycaster.ray;
      // Closest point on the pointer's ray to the figure's centre.
      c.copy(origin).addScaledVector(direction, center.clone().sub(origin).dot(direction));
      u.copy(c).sub(center);
      const r = u.length() / HANDLE_RADIUS;
      if (u.lengthSq() < 1e-10) u.set(0, 1, 0);
      u.normalize();
      if (origin.distanceTo(center) < HANDLE_RADIUS) {
        // The camera is inside the bulbs' sphere (the fish-eye lens works up
        // close): every ray meets it once ahead, right where you point.
        v.copy(u).multiplyScalar(r).addScaledVector(direction, Math.sqrt(Math.max(0, 1 - r * r)));
      } else if (r <= 1) {
        // On the sphere: the near face if the bulb is in front, the far face if behind.
        if (past > 0.35) side = -side; // came back in after going round the edge
        past = 0;
        v.copy(u).multiplyScalar(r).addScaledVector(direction, -side * Math.sqrt(1 - r * r));
      } else {
        // Beyond the edge: keep rolling round to the other side.
        past = Math.min(1, (r - 1) / 0.35) * (Math.PI / 2);
        v.copy(u).multiplyScalar(Math.cos(past)).addScaledVector(direction, side * Math.sin(past));
      }
      const { azimuth, elevation } = anglesOf(v.x, v.y, v.z);
      lightingStore.setLight(id, { azimuth: Math.round(azimuth), elevation: Math.round(elevation) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (cc) cc.enabled = true;
      lightingUi.set({ dragging: null });
      setCursor(gl.domElement, "");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const color = spec.on ? spec.color : "#8e8e93";
  const strong = hot || dragging || selected;
  const fade = behind && !dragging ? 0.45 : 1;
  const R = HANDLE_RADIUS;
  const overlay = { transparent: true, depthTest: false, depthWrite: false, toneMapped: false } as const;

  return (
    <group ref={group} userData={NO_SNAPSHOT}>
      <group ref={bulb}>
      {/* Generous grab target. */}
      <mesh
        renderOrder={30}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => {
          e.stopPropagation();
          if (!lightingUi.get().dragging) setCursor(gl.domElement, "grab");
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHot(true);
        }}
        onPointerOut={() => {
          setHot(false);
          if (!lightingUi.get().dragging) setCursor(gl.domElement, "");
        }}
      >
        <sphereGeometry args={[0.16, 16, 12]} />
        <meshBasicMaterial {...overlay} opacity={0} />
      </mesh>

      <group ref={face}>
        {spec.on && (
          <mesh renderOrder={20} raycast={noRaycast}>
            <circleGeometry args={[strong ? 0.17 : 0.135, 48]} />
            <meshBasicMaterial {...overlay} color={color} opacity={(strong ? 0.3 : 0.2) * fade} />
          </mesh>
        )}
        <mesh renderOrder={21} raycast={noRaycast}>
          <ringGeometry args={[0.068, selected ? 0.094 : 0.082, 48]} />
          <meshBasicMaterial {...overlay} color={selected ? ACCENT : "#ffffff"} opacity={fade} />
        </mesh>
        <mesh renderOrder={22} raycast={noRaycast}>
          <circleGeometry args={[0.06, 40]} />
          <meshBasicMaterial {...overlay} color={color} opacity={(spec.on ? 1 : 0.6) * fade} />
        </mesh>
      </group>

      {/* Arrowhead: which way the light shines. */}
      {spec.on && (
        <mesh position={[-dir[0] * 0.2, -dir[1] * 0.2, -dir[2] * 0.2]} quaternion={coneQ} renderOrder={22} raycast={noRaycast}>
          <coneGeometry args={[0.028, 0.075, 20]} />
          <meshBasicMaterial {...overlay} color={color} opacity={fade} />
        </mesh>
      )}
      <LensHtml position={[0, 0.2, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className={`light-badge ${selected ? "light-badge-on" : ""} ${behind && !dragging ? "opacity-60" : ""}`}>
          {LIGHT_INFO[id].name}
          {!spec.on && <span className="font-normal opacity-75"> · off</span>}
        </div>
      </LensHtml>
      </group>

      {/* The beam: a dashed line from the bulb toward the figure. */}
      {spec.on && (
        <Line
          points={[
            [-dir[0] * 0.12, -dir[1] * 0.12, -dir[2] * 0.12],
            [-dir[0] * R * 0.7, -dir[1] * R * 0.7, -dir[2] * R * 0.7],
          ]}
          color={color}
          lineWidth={1.4}
          dashed
          dashSize={0.06}
          gapSize={0.045}
          transparent
          opacity={0.75 * fade}
          depthTest={false}
          renderOrder={19}
        />
      )}

      {dragging && <OrbitGuides dir={dir} color={color} spec={spec} />}
    </group>
  );
}

/**
 * While dragging: the circle the light is travelling round at its height,
 * the arc from floor to overhead it could rise along, and where it is in words.
 */
function OrbitGuides({ dir, color, spec }: { dir: [number, number, number]; color: string; spec: LightSpec }) {
  const R = HANDLE_RADIUS;
  const { ring, arc } = useMemo(() => {
    const cx = -dir[0] * R;
    const cz = -dir[2] * R;
    const rc = R * Math.cos((spec.elevation * Math.PI) / 180);
    const ring: [number, number, number][] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      ring.push([cx + rc * Math.sin(a), 0, cz + rc * Math.cos(a)]);
    }
    const arc: [number, number, number][] = [];
    for (let e = MIN_ELEVATION; e <= MAX_ELEVATION; e += 3) {
      const p = lightDirection(spec.azimuth, e);
      arc.push([(p[0] - dir[0]) * R, (p[1] - dir[1]) * R, (p[2] - dir[2]) * R]);
    }
    return { ring, arc };
  }, [dir, R, spec.azimuth, spec.elevation]);

  return (
    <>
      <Line points={ring} color={color} lineWidth={1} transparent opacity={0.45} depthTest={false} renderOrder={18} />
      <Line points={arc} color={color} lineWidth={1} dashed dashSize={0.04} gapSize={0.04} transparent opacity={0.4} depthTest={false} renderOrder={18} />
      <LensHtml position={[0, -0.2, 0]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="light-readout">{describeDirection(spec.azimuth, spec.elevation)}</div>
      </LensHtml>
    </>
  );
}
