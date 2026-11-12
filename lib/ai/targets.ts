/**
 * Named goals the model can pick instead of writing raw angles. Choosing
 * "hand on the face" is easy for a language model; working out the three
 * shoulder and elbow angles that put it there is not. So the model names
 * the goal and code does the geometry:
 *   - REACHES: where a hand goes (solved on the real skeleton, see
 *     components/scene/poseSolver.ts)
 *   - GAZES: where the face points (neck and head turned to match)
 *
 * The descriptions are written into the system prompt.
 */

export const REACHES = {
  none: "you write this arm's angles",
  overhead: "arm straight up above the head (cheering, stretching, reaching high, raising a hand)",
  raised: "hand up beside the head, elbow bent (waving, hi, oath, answering a question)",
  forward: "arm straight out in front at shoulder height (pointing, reaching, offering, stop)",
  face: "palm over the face (crying, facepalm, hiding)",
  eyes: "at the eyes (wiping tears, rubbing eyes)",
  mouth: "at the mouth (shush, blowing a kiss, eating, gasp)",
  chin: "under the chin (thinking)",
  forehead: "on the forehead (headache, shading the eyes)",
  top_of_head: "on top of the head (despair, disbelief, scratching)",
  back_of_head: "behind the head (relaxed, embarrassed)",
  ear: "at the ear (phone call, listening)",
  chest: "on the chest, same side",
  heart: "over the heart (character's left chest: pledge, love, shock)",
  stomach: "on the stomach",
  hip: "on the hip (akimbo, confident, impatient)",
  opposite_shoulder: "on the other shoulder (self-hug, cold, comfort)",
  crossed: "arms crossed over the chest (give it to both hands)",
  hug_knees: "arms wrapped around the knees (give it to both hands; sitting with knees up)",
  knee: "resting on the knee, same side",
  lap: "resting on the thigh, same side",
  floor: "on the ground (pushing up, leaning on a hand)",
  prayer: "palms together in front of the chest (give it to both hands)",
} as const;
export type Reach = keyof typeof REACHES;
export const REACH_IDS = Object.keys(REACHES) as Reach[];

export const GAZES = {
  none: "you write the neck and head angles",
  forward: "level, straight ahead",
  down: "head bowed, looking down",
  up: "looking up",
  left: "turned to the character's left",
  right: "turned to the character's right",
  over_left_shoulder: "looking back over the left shoulder",
  over_right_shoulder: "looking back over the right shoulder",
  at_left_hand: "looking at the left hand (phone, book, object held)",
  at_right_hand: "looking at the right hand",
} as const;
export type Gaze = keyof typeof GAZES;
export const GAZE_IDS = Object.keys(GAZES) as Gaze[];

/** What the solver is asked to do for one pose. */
export interface SolveRequest {
  leftReach: Reach;
  rightReach: Reach;
  gaze: Gaze;
}
