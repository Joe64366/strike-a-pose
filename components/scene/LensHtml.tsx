"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, type ComponentProps } from "react";
import { useViewFlip } from "@/lib/viewFlip";
import { lensCalculatePosition, lensOn } from "./lens";

/**
 * drei's Html, placed through the fish-eye lens when it's on. drei hides a
 * label once its point is behind the camera; through the lens such points
 * can still be on screen (it sees more than 180° across), so the label only
 * hides then without the lens.
 */
export function LensHtml({ children, ...props }: ComponentProps<typeof Html>) {
  const inner = useRef<HTMLDivElement>(null);
  const behind = useRef(false);
  // In mirror view the stage (labels included) is flipped; flip the text back so it reads.
  const flipped = useViewFlip();

  useFrame(() => showLabel(inner.current, !behind.current || lensOn()));

  return (
    <Html
      {...props}
      calculatePosition={lensCalculatePosition}
      onOcclude={(hidden) => {
        behind.current = hidden;
      }}
    >
      <div ref={inner} style={flipped ? { transform: "scaleX(-1)" } : undefined}>
        {children}
      </div>
    </Html>
  );
}

function showLabel(el: HTMLDivElement | null, show: boolean) {
  const display = show ? "" : "none";
  if (el && el.style.display !== display) el.style.display = display;
}
