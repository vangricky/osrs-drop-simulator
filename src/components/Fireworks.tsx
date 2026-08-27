import { useState } from "react";

// OSRS palette (matches index.css's --color-osrs-* tokens) as raw "r,g,b"
// triples so each burst's CSS can build both a solid dot color and a
// translucent glow from the same value.
const COLORS = ["255,183,0", "255,63,63", "79,143,255", "63,255,63", "255,152,31", "255,183,0"];
const PARTICLES_PER_BURST = 14;

interface Burst {
  id: number;
  leftPct: number;
  topPct: number;
  color: string;
  delayMs: number;
}

/**
 * A one-shot fireworks show: a handful of staggered bursts at randomized
 * positions, each a rising trail -> flash -> radiating colored particles,
 * playing once (no looping) like a real firework rather than a continuous
 * effect. Pure CSS animation, same technique as Unlock/PrestigeCelebration's
 * single-color particle burst, just multiplied across several positions,
 * colors, and a launch trail for a proper "fireworks" read rather than one
 * static sparkle burst.
 */
export default function Fireworks({ count = 6 }: { count?: number }) {
  // Lazy initializer: the random layout is generated exactly once per mount
  // and never recomputed (there's no dependency it should react to — each
  // fireworks show is a fresh mount anyway, gated by the caller's own
  // condition), unlike useMemo(() => ..., [count]) computing this via an
  // impure Math.random() call inside the render body itself.
  const [bursts] = useState<Burst[]>(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      leftPct: 12 + Math.random() * 76,
      topPct: 12 + Math.random() * 45,
      color: COLORS[i % COLORS.length],
      delayMs: i * 220 + Math.random() * 180,
    })),
  );

  return (
    // No z-index of its own — callers stack this by DOM order (mount it
    // before whatever should sit on top, e.g. a modal card given its own
    // explicit z-index) rather than this component assuming its context.
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {bursts.map((b) => (
        <div key={b.id} className="absolute h-0 w-0" style={{ left: `${b.leftPct}%`, top: `${b.topPct}%` }}>
          <span
            className="firework-trail absolute rounded-full"
            style={{ ["--fw-color" as string]: b.color, animationDelay: `${b.delayMs}ms` }}
          />
          <span
            className="firework-flash absolute rounded-full"
            style={{ ["--fw-color" as string]: b.color, animationDelay: `${b.delayMs + 450}ms` }}
          />
          {Array.from({ length: PARTICLES_PER_BURST }).map((_, j) => (
            <span
              key={j}
              className="firework-particle absolute rounded-full"
              style={{
                ["--fw-color" as string]: b.color,
                ["--angle" as string]: `${(360 / PARTICLES_PER_BURST) * j + (Math.random() * 12 - 6)}deg`,
                ["--dist" as string]: `${55 + Math.random() * 35}px`,
                animationDelay: `${b.delayMs + 450}ms`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
