import type { Transition } from "motion/react";

/** Critically damped house spring: no overshoot, ~0.35s response. */
export const spring: Transition = { type: "spring", bounce: 0, duration: 0.35 };

/** Slightly quicker for small elements (chips, rows, toasts). */
export const springSnappy: Transition = { type: "spring", bounce: 0, duration: 0.25 };
