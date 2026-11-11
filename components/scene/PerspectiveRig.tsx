"use client";

import { useFrame, useThree } from "@react-three/fiber";
import type CameraControlsImpl from "camera-controls";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferGeometry,
  CubeCamera,
  Float32BufferAttribute,
  HalfFloatType,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Matrix3,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLCubeRenderTarget,
  type PerspectiveCamera,
} from "three";
import type { CameraView } from "@/lib/cameraViews";
import { AXIS_COLORS, fisheyeViews, perspective, usePerspective, usePerspectiveUi, type PerspectiveSettings } from "@/lib/perspective";
import { poseStore } from "@/lib/poseStore";

/** Chest height of the 1.8 m figure. */
const CENTER_Y = 0.95;
/** Half the height the frame should hold (figure half-height plus margin). */
const FRAME_HALF = 1.2;
/** Guide lines run this far each way (inside the camera's far plane). */
const GUIDE_LENGTH = 60;
/** Pieces per half-line (see `fan`). */
const SEGMENTS = 24;
const HORIZON_RADIUS = 85;

const deg = (d: number) => (d * Math.PI) / 180;

function figurePoint(): Vector3 {
  const { pose, floorGap } = poseStore.get();
  const [x, , z] = pose.root ?? [0, 0, 0];
  return new Vector3(x, CENTER_Y + floorGap, z);
}

/* ------------------------------------------------------------- the rig */

/** The fish-eye lens mode: framing, guides and the lens itself. */
export function PerspectiveRig() {
  const p = usePerspective();
  const on = usePerspectiveUi((s) => s.on);
  const aim = usePerspectiveUi((s) => s.aim);
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null;
  const wasOn = useRef(false);

  // Frame the camera when the lens turns on or its settings change.
  useEffect(() => {
    if (controls) applyMode(controls, on, perspective.get(), wasOn);
  }, [on, aim, controls]);

  return (
    <>
      {on && p.guides && <Guides settings={p} />}
      {on && <FisheyeLens halfAngle={deg(p.curvature)} />}
    </>
  );
}

/**
 * On: carry on from the fish-eye angle you last left (or, the first time,
 * close in from your eye level so the curvature shows on the figure),
 * keeping the direction you were looking from. Off: remember the fish-eye
 * angle, then go back to the view you had before. A saved camera angle can
 * ask to be landed on instead (fisheyeViews.setPending). Each pose keeps its
 * own lens, so opening another pose can switch it on or off too.
 */
function applyMode(cc: CameraControlsImpl, on: boolean, p: PerspectiveSettings, wasOn: React.RefObject<boolean>) {
  const requested = fisheyeViews.takePending();
  // Opening another pose: the pose being left already kept this angle.
  const switchedPose = fisheyeViews.takeSwitch();
  const go = (v: CameraView) => void cc.setLookAt(...v.position, ...v.target, true);
  if (!on) {
    if (wasOn.current) {
      if (!switchedPose) fisheyeViews.remember(currentView(cc));
      if (requested) go(requested);
      else void cc.reset(true);
    }
    wasOn.current = false;
    return;
  }
  const turningOn = !wasOn.current;
  if (turningOn) cc.saveState();
  wasOn.current = true;
  const resume = requested ?? (turningOn ? fisheyeViews.last() : null);
  if (resume) return go(resume);

  // Curvature or eye level changed: re-frame, keeping your direction.
  const f = figurePoint();
  const az = cc.azimuthAngle;
  const reach = (FRAME_HALF * 0.85) / Math.tan(deg(p.curvature) * 0.62);
  const dy = p.eye - f.y;
  const dh = Math.sqrt(Math.max(reach * reach - dy * dy, 0.6 * 0.6));
  void cc.setLookAt(f.x + Math.sin(az) * dh, p.eye, f.z + Math.cos(az) * dh, f.x, f.y, f.z, true);
}

function currentView(cc: CameraControlsImpl): CameraView {
  return {
    position: cc.getPosition(new Vector3()).toArray() as CameraView["position"],
    target: cc.getTarget(new Vector3()).toArray() as CameraView["target"],
  };
}

/* -------------------------------------------------------------- guides */

/** Points on a ring around `c`, in the plane perpendicular to `d`. */
function ring(c: Vector3, d: Vector3, radius: number, count: number): Vector3[] {
  const a = Math.abs(d.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const u = new Vector3().crossVectors(d, a).normalize();
  const w = new Vector3().crossVectors(d, u).normalize();
  return Array.from({ length: count }, (_, i) => {
    const t = (i / count) * Math.PI * 2;
    return c.clone().addScaledVector(u, Math.cos(t) * radius).addScaledVector(w, Math.sin(t) * radius);
  });
}

function fan(d: Vector3, c: Vector3, count: number, color: string, out: { pos: number[]; col: number[] }) {
  const rgb = [parseInt(color.slice(1, 3), 16) / 255, parseInt(color.slice(3, 5), 16) / 255, parseInt(color.slice(5, 7), 16) / 255];
  // Each line is many short pieces, close together near the figure and
  // longer toward the distance: a single 120 m segment that passes behind
  // the camera doesn't clip reliably everywhere (and the fish-eye's six
  // capture cameras each see a different part of it).
  const steps: number[] = [];
  for (let k = -SEGMENTS; k <= SEGMENTS; k++) steps.push(Math.sign(k) * GUIDE_LENGTH * (k / SEGMENTS) ** 2);
  for (const p of ring(c, d, 1.35, count)) {
    for (let k = 0; k < steps.length - 1; k++) {
      const a = p.clone().addScaledVector(d, steps[k]);
      const b = p.clone().addScaledVector(d, steps[k + 1]);
      out.pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      out.col.push(...rgb, ...rgb);
    }
  }
}

const AXES: Record<"x" | "y" | "z", Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

/**
 * Guide lines as real 3D lines, parallel to the floor grid axes (plus the
 * horizon at eye height). Through the fish-eye lens they bow into the curves
 * of curvilinear perspective, like any other straight line in the scene.
 */
function Guides({ settings }: { settings: PerspectiveSettings }) {
  const aim = usePerspectiveUi((s) => s.aim);
  const camera = useThree((s) => s.camera);

  const { strong, horizon } = useMemo(() => {
    const c = figurePoint();
    const count = settings.dense ? 28 : 16;
    const build = (axes: ("x" | "y" | "z")[], n: number) => {
      const out = { pos: [] as number[], col: [] as number[] };
      for (const a of axes) fan(AXES[a], c, n, AXIS_COLORS[a], out);
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(out.pos, 3));
      g.setAttribute("color", new Float32BufferAttribute(out.col, 3));
      return g;
    };
    const ringPts: number[] = [];
    for (let i = 0; i < 256; i++) {
      const t = (i / 256) * Math.PI * 2;
      ringPts.push(c.x + Math.cos(t) * HORIZON_RADIUS, 0, c.z + Math.sin(t) * HORIZON_RADIUS);
    }
    const hg = new BufferGeometry();
    hg.setAttribute("position", new Float32BufferAttribute(ringPts, 3));
    const mat = (opacity: number, color?: string) =>
      new LineBasicMaterial({ vertexColors: !color, color, transparent: true, opacity, depthWrite: false, toneMapped: false, fog: false });
    return {
      strong: new LineSegments(build(["x", "z", "y"], count), mat(0.78)),
      horizon: new LineLoop(hg, mat(0.95, AXIS_COLORS.horizon)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.dense, aim]);

  useEffect(
    () => () => {
      for (const o of [strong, horizon]) {
        o.geometry.dispose();
        (o.material as LineBasicMaterial).dispose();
      }
    },
    [strong, horizon],
  );

  // The horizon is at the camera's own height, wherever it moves.
  useFrame(() => followHeight(horizon, camera.position.y));

  return (
    <>
      <primitive object={strong} renderOrder={5} />
      <primitive object={horizon} renderOrder={5} />
    </>
  );
}

function followHeight(o: LineLoop, y: number) {
  o.position.y = y;
}

/* ------------------------------------------------------------- fish-eye */

const FISHEYE_FRAGMENT = /* glsl */ `
  uniform samplerCube tCube;
  uniform mat3 rot;
  uniform float halfAngle;
  uniform float aspect;
  uniform vec2 center;
  uniform vec3 background;
  varying vec2 vUv;
  void main() {
    // Equidistant fish-eye: distance from the centre is proportional to the
    // angle off the lens axis (top edge = halfAngle).
    vec2 p = ( vUv - center ) * vec2( aspect, 1.0 ) * 2.0;
    float rho = length( p );
    float theta = rho * halfAngle;
    if ( theta > 3.14159 ) {
      gl_FragColor = vec4( background, 1.0 );
    } else {
      vec2 d = rho > 1e-6 ? p / rho : vec2( 0.0 );
      vec3 view = vec3( sin( theta ) * d.x, sin( theta ) * d.y, - cos( theta ) );
      gl_FragColor = vec4( textureCube( tCube, rot * view ).rgb, 1.0 );
    }
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function setLensUniforms(material: ShaderMaterial, camera: PerspectiveCamera, scene: Scene, size: Vector2, halfAngle: number) {
  const u = material.uniforms;
  u.rot.value.setFromMatrix4(camera.matrixWorld);
  u.halfAngle.value = halfAngle;
  u.aspect.value = size.x / Math.max(size.y, 1);
  // Optical centre follows the visible stage (it shifts right of the sidebar).
  const view = camera.view;
  u.center.value.set(view ? 0.5 - view.offsetX / view.fullWidth : 0.5, 0.5);
  const bg = scene.background as { r: number; g: number; b: number } | null;
  if (bg && "r" in bg) u.background.value.set(bg.r, bg.g, bg.b);
}

/**
 * A true curvilinear lens: the scene is captured in every direction from the
 * camera (a cube map), then re-projected through an equidistant fish-eye
 * mapping. Sharp at any curvature, and straight lines bow exactly as in
 * curvilinear perspective drawing.
 */
function FisheyeLens({ halfAngle }: { halfAngle: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;

  const { cube, cubeCamera, quadScene, quadCamera, material } = useMemo(() => {
    const cube = new WebGLCubeRenderTarget(1024, { type: HalfFloatType, generateMipmaps: false });
    const cubeCamera = new CubeCamera(0.05, 100, cube);
    const material = new ShaderMaterial({
      uniforms: {
        tCube: { value: cube.texture },
        rot: { value: new Matrix3() },
        halfAngle: { value: 1 },
        aspect: { value: 1 },
        center: { value: new Vector2(0.5, 0.5) },
        background: { value: new Vector3() },
      },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }",
      fragmentShader: FISHEYE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    const quadScene = new Scene();
    quadScene.add(new Mesh(new PlaneGeometry(2, 2), material));
    return { cube, cubeCamera, quadScene, quadCamera: new OrthographicCamera(-1, 1, 1, -1, 0, 1), material };
  }, []);

  useEffect(
    () => () => {
      cube.dispose();
      material.dispose();
    },
    [cube, material],
  );

  // Priority 1: we render the frame ourselves (the default render pauses).
  useFrame(() => {
    camera.updateMatrixWorld();
    cubeCamera.position.copy(camera.position);
    cubeCamera.update(gl, scene);

    setLensUniforms(material, camera, scene, gl.getDrawingBufferSize(new Vector2()), halfAngle);

    gl.setRenderTarget(null);
    gl.render(quadScene, quadCamera);
  }, 1);

  return null;
}
