/**
 * Starter prompts shown above the prompt box on a new pose. A spread of
 * moods, actions and levels (standing, floor, airborne) so any five feel
 * varied. Short enough to read at a glance.
 */
export const PROMPT_IDEAS = [
  "Crying on knees",
  "Mid-sprint, leaning forward",
  "Sitting cross-legged, reading",
  "Looking back over shoulder",
  "Superhero landing",
  "Jumping for joy",
  "Waving hello",
  "Thinking, hand on chin",
  "Bowing politely",
  "Arms crossed, unimpressed",
  "Leaning on a wall, relaxed",
  "Dramatic sword slash",
  "Throwing a punch",
  "High kick",
  "Ballerina on one leg",
  "Yoga warrior pose",
  "Lying on back, stargazing",
  "Curled up, hugging knees",
  "Kneeling in prayer",
  "Victory, arms raised",
  "Falling backwards",
  "Sneaking on tiptoes",
  "Pointing into the distance",
  "Hands on hips, confident",
  "Shrugging, palms up",
  "Stretching after waking up",
  "Tired, slumped in a chair",
  "Running away scared",
  "Celebrating a goal",
  "Reaching up to a high shelf",
  "Tying a shoe",
  "Proposing on one knee",
  "Archer drawing a bow",
  "Basketball jump shot",
  "Dancing, arms flowing",
  "Saluting at attention",
  "Covering face, embarrassed",
  "Sitting on the edge, legs dangling",
  "Mid-air backflip",
  "Holding a phone, texting",
] as const;

export const IDEAS_SHOWN = 5;

/** Five ideas, none of which are in `avoid` (so a new set always looks new). */
export function dealIdeas(avoid: readonly string[] = []): string[] {
  const pool = PROMPT_IDEAS.filter((p) => !avoid.includes(p));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, IDEAS_SHOWN);
}
