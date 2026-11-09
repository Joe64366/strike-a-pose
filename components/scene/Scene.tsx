"use client";

import {
  CameraControls,
  Environment,
  Grid,
  Lightformer,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { DoubleSide, type DirectionalLight, type PerspectiveCamera } from "three";
import { Suspense, useCallback, useEffect, useRef } from "react";
import { poseStore } from "@/lib/poseStore";
import { OUTLINE_PX, stagePalette, useScheme, useSettings } from "@/lib/settings";
import { ORBIT_TARGET, VIEW_PRESETS, type ViewPreset, type ViewRequest } from "@/lib/views";
import { Mannequin } from "./Mannequin";

/** Key light offset from the figure: mostly overhead, so the shadow pools under the feet. */
const KEY_LIGHT_OFFSET = [1.2, 8, 1.6] as const;

export interface SceneProps {
  viewRequest: ViewRequest | null;
  /** Fired when the user starts orbiting/panning/zooming by hand. */
  onUserInteract: () => void;
  onReady?: () => void;
  /** Pixels covered by UI on the left; the figure stays centred in what's left. */
  leftInset?: number;
  /** Cel-shaded contour around the figure. */
  outline?: boolean;
}

export default function Scene({
  viewRequest,
  onUserInteract,
  onReady,
  leftInset = 0,
  outline = true,
}: SceneProps) {
  const scheme = useScheme();
  const settings = useSettings();
  const c = stagePalette(settings.background, scheme);
  const initial = VIEW_PRESETS.front.position;

  return (
    <Canvas
      // PCF (soft PCF was removed from three); shadow-radius softens it.
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: 35, position: initial, near: 0.05, far: 100 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      aria-label="3D posing stage. Drag the body to pose it; drag around it to orbit, right-drag to pan, scroll to zoom."
      // A click on empty space (not a drag) clears the joint selection.
      onPointerMissed={() => poseStore.select(null)}
    >
      <color attach="background" args={[c.bg]} />
      <fog attach="fog" args={[c.bg, 10, 30]} />

      <hemisphereLight args={["#ffffff", c.ground, 0.7]} />
      <KeyLight />
      <directionalLight position={[-4, 3, -3]} intensity={0.45} />
      {/* Soft studio reflections, generated locally (no HDR download). */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={1.6} position={[0, 5, 4]} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[-5, 2, -2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={0.6} position={[5, 2, -2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
      </Environment>

      {settings.grid && (
        <Grid
          position={[0, 0.001, 0]}
          args={[40, 40]}
          infiniteGrid
          cellSize={0.25}
          cellThickness={0.6}
          cellColor={c.cell}
          sectionSize={1}
          sectionThickness={1}
          sectionColor={c.section}
          fadeDistance={26}
          fadeStrength={1.6}
          // Visible from underneath too, so worm's-eye views keep a reference plane.
          side={DoubleSide}
        />
      )}

      {/* Invisible floor that only shows the figure's shadow. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]} receiveShadow>
        <planeGeometry args={[2 * 12, 2 * 12]} />
        <shadowMaterial transparent opacity={c.shadowOpacity} />
      </mesh>

      <Suspense fallback={null}>
        <Mannequin onReady={onReady} outline={outline} outlineWidth={OUTLINE_PX[settings.outlineWeight]} />
      </Suspense>

      <Rig viewRequest={viewRequest} onUserInteract={onUserInteract} />
      <StageOffset inset={leftInset} />
    </Canvas>
  );
}

/** The shadow-casting light travels with the figure so its shadow never clips. */
function KeyLight() {
  const light = useRef<DirectionalLight>(null);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const [x, , z] = poseStore.get().pose.root ?? [0, 0, 0];
    l.position.set(x + KEY_LIGHT_OFFSET[0], KEY_LIGHT_OFFSET[1], z + KEY_LIGHT_OFFSET[2]);
    l.target.position.set(x, 0, z);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      position={KEY_LIGHT_OFFSET}
      intensity={1.5}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.02}
      shadow-radius={6}
    >
      <orthographicCamera attach="shadow-camera" args={[-2.5, 2.5, 2.5, -2.5, 0.5, 20]} />
    </directionalLight>
  );
}

/**
 * Shifts the projection centre right by half the sidebar so the figure sits
 * in the middle of the visible stage. Eased per frame, so it glides with the
 * sidebar instead of jumping when it opens or closes.
 */
function StageOffset({ inset }: { inset: number }) {
  const current = useRef(inset);

  useFrame(({ camera, size }, delta) => {
    const cam = camera as PerspectiveCamera;
    const target = inset;
    // Exponential approach ≈ critically damped feel, frame-rate independent.
    current.current += (target - current.current) * (1 - Math.exp(-delta * 14));
    if (Math.abs(target - current.current) < 0.1) current.current = target;

    const shift = -current.current / 2;
    const view = cam.view;
    if (view && view.offsetX === shift && view.fullWidth === size.width && view.fullHeight === size.height) return;
    cam.setViewOffset(size.width, size.height, shift, 0, size.width, size.height);
  });

  return null;
}

/** Owns the camera: left-drag orbits, right-drag pans, wheel zooms. */
function Rig({ viewRequest, onUserInteract }: Pick<SceneProps, "viewRequest" | "onUserInteract">) {
  const controls = useRef<CameraControls>(null);
  const getSize = useThree((s) => s.get);

  /**
   * Camera position + target for a preset, framed on the figure wherever it
   * stands (and however high it's lifted), pulled back on portrait screens
   * so the arms fit.
   */
  const presetLookAt = useCallback(
    (preset: ViewPreset): [number, number, number, number, number, number] => {
      const { width, height } = getSize().size;
      const aspect = width / Math.max(height, 1);
      const pullBack = aspect < 1 ? Math.min(1.5, 0.8 / aspect) : 1;
      const [rx, , rz] = poseStore.get().pose.root ?? [0, 0, 0];
      // Aim halfway up a lift, so both the figure and its floor shadow stay in frame.
      const ry = poseStore.get().floorGap / 2;
      const [x, y, z] = VIEW_PRESETS[preset].position;
      const [tx, ty, tz] = ORBIT_TARGET;
      return [
        rx + tx + (x - tx) * pullBack,
        ry + ty + (y - ty) * pullBack,
        rz + tz + (z - tz) * pullBack,
        rx + tx,
        ry + ty,
        rz + tz,
      ];
    },
    [getSize],
  );

  useEffect(() => {
    controls.current?.setLookAt(...presetLookAt("front"), false);
  }, [presetLookAt]);

  useEffect(() => {
    if (!viewRequest || !controls.current) return;
    // Animates from wherever the camera is right now, so a preset tapped
    // mid-transition simply re-targets instead of jumping.
    controls.current.setLookAt(...presetLookAt(viewRequest.preset), true);
  }, [viewRequest, presetLookAt]);

  useEffect(() => {
    const cc = controls.current;
    if (!cc) return;
    // controlstart only fires for user input, never for setLookAt.
    cc.addEventListener("controlstart", onUserInteract);
    return () => cc.removeEventListener("controlstart", onUserInteract);
  }, [onUserInteract]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={0.8}
      maxDistance={9}
      // Full sphere: straight down to straight up, including under the
      // floor for extreme low angles. (Stops at the poles rather than
      // flipping over, so the horizon never turns upside down.)
      minPolarAngle={0}
      maxPolarAngle={Math.PI}
      smoothTime={0.22}
      draggingSmoothTime={0.08}
    />
  );
}
