"use client";

import { useSyncExternalStore } from "react";
import type { SolveRequest } from "./ai/targets";
import type { JointId } from "./joints";
import { isIdentity, type PoseData, type Quat, type RigFrames, type RootPosition } from "./poseMath";

/**
 * Live posing state shared by the 3D scene, the inspector and the studio.
 * Kept outside React so dragging can update 60×/s without re-rendering the
 * whole tree; components subscribe to just the slice they need.
 */
interface PoseState {
  /** What the figure should show. The scene eases toward it unless `instant`. */
  pose: PoseData;
  instant: boolean;
  selected: JointId | null;
  hovered: JointId | null;
  /** Pointer position (client px) for the hover label. */
  hoverAt: { x: number; y: number } | null;
  dragging: boolean;
  frames: RigFrames;
  /** Height of the figure's lowest point above the floor, in metres. */
  floorGap: number;
  /** Interface hidden: the figure can be viewed but not posed. */
  viewOnly: boolean;
}

type CommitHandler = (prev: PoseData, next: PoseData) => void;

let state: PoseState = {
  pose: {},
  instant: false,
  selected: null,
  hovered: null,
  hoverAt: null,
  dragging: false,
  frames: {},
  floorGap: 0,
  viewOnly: false,
};
const listeners = new Set<() => void>();
let commitHandler: CommitHandler | null = null;
let editStart: PoseData | null = null;

/**
 * Live vertical measurements from the scene, updated every moving frame.
 * Not reactive (it changes too often); read it in event handlers.
 * - lowestAtZero: lowest point's height if the figure weren't raised or lowered
 * - height: how far the figure is currently raised (+) or lowered (−)
 */
const footing = { lowestAtZero: 0, height: 0 };

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Supplied by the scene: lowest point of a pose at height 0, measured off-screen. */
let measurer: ((pose: PoseData) => number | null) | null = null;
/** Supplied by the scene: places hands and gaze on the real skeleton (see poseSolver). */
let solver: ((pose: PoseData, request: SolveRequest) => PoseData) | null = null;

function set(patch: Partial<PoseState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const poseStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Show a saved pose (eases into it). */
  load(pose: PoseData) {
    editStart = null;
    set({ pose, instant: false });
  },

  setFrames(frames: RigFrames) {
    set({ frames });
  },
  select(selected: JointId | null) {
    if (selected !== state.selected) set({ selected });
  },
  hover(hovered: JointId | null, hoverAt: PoseState["hoverAt"] = null) {
    set({ hovered, hoverAt });
  },
  setDragging(dragging: boolean) {
    set({ dragging });
  },
  /** View-only: clears the selection and hover so nothing is highlighted. */
  setViewOnly(viewOnly: boolean) {
    set(viewOnly ? { viewOnly, selected: null, hovered: null, hoverAt: null } : { viewOnly });
  },

  /** Start an edit transaction (a drag, or a slider gesture). */
  beginEdit() {
    editStart ??= state.pose;
  },
  /** Live update during an edit: applied immediately, not yet saved. */
  setJoint(id: JointId, q: Quat) {
    this.beginEdit();
    const pose = { ...state.pose };
    if (isIdentity(q)) delete pose[id];
    else pose[id] = q;
    set({ pose, instant: true });
  },
  /**
   * Live update of where the figure is: [x, height, z], and whether it
   * floats (height used as-is) or sticks to the floor (height ignored;
   * the scene rests the lowest point on the floor).
   */
  setPlacement(root: RootPosition, floating: boolean) {
    this.beginEdit();
    const pose = { ...state.pose };
    const r = root.map(round3) as RootPosition;
    if (!floating) r[1] = 0;
    if (r.every((v) => Math.abs(v) < 1e-4)) delete pose.root;
    else pose.root = r;
    if (floating) pose.floating = true;
    else delete pose.floating;
    set({ pose, instant: true });
  },

  /** Where the figure is right now, as [x, height, z] (height is live). */
  placement(): RootPosition {
    const [x, , z] = state.pose.root ?? [0, 0, 0];
    return [x, footing.height, z];
  },
  /** The height that puts the lowest point `gap` metres above the floor. */
  heightForGap(gap: number) {
    return gap - footing.lowestAtZero;
  },
  setMeasurer(fn: typeof measurer) {
    measurer = fn;
  },
  /** Lowest point of `pose` (not the shown one) at height 0, or null if the scene isn't ready. */
  measureLowest(pose: PoseData): number | null {
    return measurer ? measurer(pose) : null;
  },
  setSolver(fn: typeof solver) {
    solver = fn;
  },
  /** `pose` with named hand targets and gaze placed, or as-is if the scene isn't ready. */
  solve(pose: PoseData, request: SolveRequest): PoseData {
    return solver ? solver(pose, request) : pose;
  },
  /** Called by the scene with fresh measurements. */
  reportFooting(lowestAtZero: number, height: number, settled: boolean) {
    footing.lowestAtZero = lowestAtZero;
    footing.height = height;
    const gap = round3(Math.max(0, lowestAtZero + height));
    // Reactive readout: exact once settled, otherwise only on visible change.
    if (gap !== state.floorGap && (settled || Math.abs(gap - state.floorGap) > 0.005)) set({ floorGap: gap });
  },
  /** Replace the whole pose as one undoable, saved edit. */
  replace(pose: PoseData) {
    const prev = state.pose;
    editStart = null;
    set({ pose, instant: false });
    commitHandler?.(prev, pose);
  },
  /** Finish the transaction: hands (before, after) to the studio to save. */
  endEdit() {
    const prev = editStart;
    editStart = null;
    if (prev && prev !== state.pose) commitHandler?.(prev, state.pose);
  },
  onCommit(handler: CommitHandler | null) {
    commitHandler = handler;
  },
};

export function usePoseStore<T>(selector: (s: PoseState) => T): T {
  return useSyncExternalStore(
    poseStore.subscribe,
    () => selector(state),
    () => selector(state),
  );
}
