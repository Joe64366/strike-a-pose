import { useId } from "react";

/**
 * App mark: three curled blades turning around a centre, a gesture caught
 * mid-spin. Abstract on purpose (no figure): it's the energy of striking a
 * pose, not a picture of one. Drawn straight on whatever's behind it (no
 * tile); the indigo, blue and violet hold up on light and dark.
 */
const BLADE = "M16 16.2 C 11 14.2, 9.6 8, 13.4 2.8 C 15 7.6, 18.6 11.4, 16 16.2 Z";
const COLORS: [string, string][] = [
  ["#5e5ce6", "#8e8cff"],
  ["#0a84ff", "#5ac8fa"],
  ["#bf5af2", "#e08cff"],
];

export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        {COLORS.map(([from, to], i) => (
          <linearGradient key={i} id={`${id}-${i}`} gradientUnits="userSpaceOnUse" x1="16" y1="16" x2="14" y2="2">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        ))}
      </defs>
      {COLORS.map((_, i) => (
        <path key={i} d={BLADE} fill={`url(#${id}-${i})`} opacity={0.92} transform={`rotate(${i * 120} 16 16)`} />
      ))}
    </svg>
  );
}
