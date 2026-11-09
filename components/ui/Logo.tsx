import { useId } from "react";

/**
 * App mark: a pictogram mid-"strike a pose" (arm flung up, hand on hip,
 * hip popped) on an indigo→blue tile with a soft top highlight. Thick,
 * rounded strokes so it still reads at favicon size.
 */
export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  const id = useId();
  const fill = `${id}-fill`;
  const shine = `${id}-shine`;
  const limb = { fill: "none", stroke: "#fff", strokeLinecap: "round", strokeLinejoin: "round" } as const;

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6e6bff" />
          <stop offset="1" stopColor="#0a84ff" />
        </linearGradient>
        <linearGradient id={shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${fill})`} />
      <rect width="32" height="32" rx="9" fill={`url(#${shine})`} />
      <circle cx="17.2" cy="7.4" r="2.6" fill="#fff" />
      <path {...limb} strokeWidth="2.7" d="M16.4 11.4 L14.6 18.2" />
      <path {...limb} strokeWidth="2.4" d="M16.6 12.2 L20.6 10.6 L23.2 6.2" />
      <path {...limb} strokeWidth="2.4" d="M16 12.4 L11.6 14.6 L14.4 17.4" />
      <path {...limb} strokeWidth="2.5" d="M14.6 18.2 L11.4 25.4" />
      <path {...limb} strokeWidth="2.5" d="M14.6 18.2 L19.2 21.2 L17.6 25.8" />
    </svg>
  );
}
