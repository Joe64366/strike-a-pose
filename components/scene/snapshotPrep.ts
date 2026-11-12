import type { Object3D } from "three";

/**
 * Camera-angle thumbnails show the figure and stage only: no drawing aids
 * (fish-eye guides, light bulbs, the body mover's ring) and no selection
 * tint. Helpers carry `userData={NO_SNAPSHOT}`; anything else that needs
 * setting aside registers a step that returns its own undo.
 */
export const NO_SNAPSHOT = { noSnapshot: true } as const;

type Step = () => () => void;
const steps = new Set<Step>();

export function registerSnapshotStep(step: Step) {
  steps.add(step);
  return () => {
    steps.delete(step);
  };
}

/** Set everything aside for a snapshot; returns the undo. */
export function prepareSnapshot(scene: Object3D): () => void {
  const hidden: Object3D[] = [];
  scene.traverse((o) => {
    if (o.userData.noSnapshot && o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  });
  const undos = [...steps].map((step) => step());
  return () => {
    for (const o of hidden) o.visible = true;
    for (const undo of undos) undo();
  };
}
