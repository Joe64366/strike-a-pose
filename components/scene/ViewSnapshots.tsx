"use client";

import { useFrame, type RootState } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { PerspectiveCamera, Vector4 } from "three";
import { viewSnapshots, type SnapshotView } from "@/lib/cameraViews";
import { perspective } from "@/lib/perspective";
import { createFisheyePass, disposeFisheyePass, renderFisheye, type FisheyePass } from "./PerspectiveRig";
import { prepareSnapshot } from "./snapshotPrep";

/** Thumbnail size (the menu shows them 16:10), rendered at 2× and scaled down. */
const THUMB_W = 192;
const THUMB_H = 120;
const SUPERSAMPLE = 2;
/** Angles drawn per frame, so a menu full of them never stalls a frame. */
const PER_FRAME = 3;

interface Job {
  views: SnapshotView[];
  done: Record<string, string>;
  resolve: (shots: Record<string, string>) => void;
}

/**
 * Renders camera-angle thumbnails from the live scene: each saved angle seen
 * through its own camera (and the fish-eye lens, if it was taken with it),
 * with the current pose, lighting and colours. Drawn in a corner of the
 * canvas just before the frame renders and copied out, so it goes through
 * exactly the same pipeline as the stage itself (tone mapping, shadows) and
 * the frame then paints over it before anything reaches the screen.
 */
export function ViewSnapshots() {
  const jobs = useRef<Job[]>([]);
  const lens = useRef<FisheyePass | null>(null);

  useEffect(() => {
    viewSnapshots.register((views) => new Promise((resolve) => jobs.current.push({ views: [...views], done: {}, resolve })));
    return () => {
      viewSnapshots.register(null);
      if (lens.current) disposeFisheyePass(lens.current);
      lens.current = null;
    };
  }, []);

  // Priority 0: before the frame itself renders (default render or the lens's).
  useFrame((state) => {
    const job = jobs.current[0];
    if (!job) return;
    const batch = job.views.splice(0, PER_FRAME);
    if (batch.some((v) => v.fisheye) && !lens.current) lens.current = createFisheyePass(512);
    Object.assign(job.done, shoot(state, batch, lens.current));
    if (!job.views.length) {
      jobs.current.shift();
      job.resolve(job.done);
    }
  });

  return null;
}

/* ------------------------------------------------------------- rendering */

const thumbCamera = new PerspectiveCamera(35, THUMB_W / THUMB_H, 0.05, 100);
const savedViewport = new Vector4();
const savedScissor = new Vector4();
let out: HTMLCanvasElement | null = null;

function shoot(state: RootState, views: SnapshotView[], lens: FisheyePass | null): Record<string, string> {
  const { gl, scene, camera } = state;
  const canvas = gl.domElement;
  const dpr = gl.getPixelRatio();
  // Device pixels to render; never more than the canvas holds.
  const w = Math.min(THUMB_W * SUPERSAMPLE, canvas.width);
  const h = Math.min(THUMB_H * SUPERSAMPLE, canvas.height);
  if (!out) {
    out = document.createElement("canvas");
    out.width = THUMB_W;
    out.height = THUMB_H;
  }
  const ctx = out.getContext("2d");
  if (!ctx) return {};

  const main = camera as PerspectiveCamera;
  thumbCamera.fov = main.fov ?? 35;
  thumbCamera.near = main.near;
  thumbCamera.far = main.far;
  thumbCamera.updateProjectionMatrix();

  gl.getViewport(savedViewport);
  gl.getScissor(savedScissor);
  const scissorWas = gl.getScissorTest();
  const restore = prepareSnapshot(scene);
  const shots: Record<string, string> = {};
  try {
    // Bottom-left corner, in CSS pixels (the renderer scales by its pixel ratio).
    gl.setRenderTarget(null);
    gl.setViewport(0, 0, w / dpr, h / dpr);
    gl.setScissor(0, 0, w / dpr, h / dpr);
    gl.setScissorTest(true);
    for (const view of views) {
      thumbCamera.position.set(...view.position);
      thumbCamera.lookAt(...view.target);
      thumbCamera.updateMatrixWorld();
      if (view.fisheye && lens) {
        renderFisheye(lens, gl, scene, thumbCamera, {
          halfAngle: (perspective.get().curvature * Math.PI) / 180,
          aspect: THUMB_W / THUMB_H,
          centerX: 0.5,
        });
      } else {
        gl.render(scene, thumbCamera);
      }
      ctx.drawImage(canvas, 0, canvas.height - h, w, h, 0, 0, THUMB_W, THUMB_H);
      shots[view.id] = out.toDataURL("image/jpeg", 0.8);
    }
  } finally {
    restore();
    gl.setScissorTest(scissorWas);
    gl.setScissor(savedScissor);
    gl.setViewport(savedViewport);
  }
  return shots;
}
