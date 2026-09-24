import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Deterministic PRNG so every market gets a stable, unique price path. */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const N = 56; // points in the rolling window
const TICK_MS = 850;

function buildInitial(rand: () => number, probability: number): number[] {
  const pts: number[] = [probability];
  for (let i = 1; i < N; i++) {
    const prev = pts[pts.length - 1];
    const v = prev + (rand() - 0.5) * 0.035 + (probability - prev) * 0.12;
    pts.push(Math.min(0.97, Math.max(0.03, v)));
  }
  return pts.reverse(); // oldest → newest, ending at ~probability
}

interface Props {
  /** Stable per-market seed — the same market always draws the same path. */
  seed: string;
  /** Current YES probability (0..1); the walk mean-reverts toward it. */
  probability: number;
  height?: number;
  className?: string;
  /** Compact variant for tight spaces (fewer gridlines, no dots). */
  compact?: boolean;
}

/**
 * Live market line: a rolling random-walk rendered as an SVG path with
 * per-segment up/down coloring, a restrained glow, and pulse dots that
 * travel along the line. All colors resolve through theme CSS variables,
 * so it adapts to dark/light automatically. Static when the user prefers
 * reduced motion.
 */
export function MarketChart({
  seed,
  probability,
  height = 132,
  className,
  compact = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dotARef = useRef<SVGCircleElement | null>(null);
  const dotBRef = useRef<SVGCircleElement | null>(null);
  const [W, setW] = useState(640);
  const reduced = useReducedMotion();
  const randRef = useRef<() => number>(null as unknown as () => number);
  if (randRef.current === null) randRef.current = mulberry32(hashSeed(seed));

  const [points, setPoints] = useState<number[]>(() => buildInitial(randRef.current, probability));

  // Measure container for crisp 1:1 rendering.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setW((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Live tick: append a small fluctuation, mean-reverting to the real price.
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setPoints((prev) => {
        const rand = randRef.current;
        const last = prev[prev.length - 1];
        const next = Math.min(
          0.97,
          Math.max(0.03, last + (rand() - 0.48) * 0.022 + (probability - last) * 0.07),
        );
        return [...prev.slice(1), next];
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [reduced, probability]);

  const geom = useMemo(() => {
    const padX = 4;
    const padY = 10;
    const innerW = Math.max(40, W - padX * 2);
    const innerH = height - padY * 2;
    const minRaw = Math.min(...points);
    const maxRaw = Math.max(...points);
    const pad = Math.max(0.015, (maxRaw - minRaw) * 0.25);
    const min = Math.max(0, minRaw - pad);
    const max = Math.min(1, maxRaw + pad);
    const range = Math.max(0.02, max - min);
    const x = (i: number) => padX + (i / (points.length - 1)) * innerW;
    const y = (v: number) => padY + (1 - (v - min) / range) * innerH;
    return { padX, padY, innerW, innerH, x, y, min, max };
  }, [points, W, height]);

  // Traveling pulse dots — positioned imperatively at 60fps, no re-renders.
  useEffect(() => {
    if (reduced || compact) return;
    let raf = 0;
    const start = performance.now();
    const css = (name: string, fb: string) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fb;
    };
    const up = css("--success", "#00E676");
    const down = css("--destructive", "#FF5252");
    const place = (el: SVGCircleElement | null, phase: number, now: number) => {
      if (!el) return;
      const t = ((now - start) / 1000) * 0.09 + phase; // slow drift across the line
      const f = t % 1;
      const fi = f * (points.length - 1);
      const i0 = Math.floor(fi);
      const i1 = Math.min(points.length - 1, i0 + 1);
      const frac = fi - i0;
      const cx = geom.x(i0) + (geom.x(i1) - geom.x(i0)) * frac;
      const cy = geom.y(points[i0]) + (geom.y(points[i1]) - geom.y(points[i0])) * frac;
      el.setAttribute("cx", cx.toFixed(1));
      el.setAttribute("cy", cy.toFixed(1));
      el.style.fill = points[i1] >= points[i0] ? up : down;
      el.setAttribute("opacity", (0.35 + 0.65 * Math.sin(f * Math.PI)).toFixed(2));
    };
    const loop = (now: number) => {
      place(dotARef.current, 0, now);
      place(dotBRef.current, 0.45, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced, compact, points, geom]);

  const segments = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; dir: 1 | -1 | 0 }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const d = points[i + 1] - points[i];
      out.push({
        x1: geom.x(i),
        y1: geom.y(points[i]),
        x2: geom.x(i + 1),
        y2: geom.y(points[i + 1]),
        dir: d > 0.0008 ? 1 : d < -0.0008 ? -1 : 0,
      });
    }
    return out;
  }, [points, geom]);

  const areaPath = useMemo(() => {
    const top = segments
      .map((s, i) => `${i === 0 ? "M" : "L"}${s.x1.toFixed(1)},${s.y1.toFixed(1)}`)
      .join(" ");
    const last = segments[segments.length - 1];
    const first = segments[0];
    const baseY = geom.padY + geom.innerH;
    return `${top} L${last.x2.toFixed(1)},${last.y2.toFixed(1)} L${last.x2.toFixed(1)},${baseY} L${first.x1.toFixed(1)},${baseY} Z`;
  }, [segments, geom]);

  const gridYs = compact ? [] : [0.25, 0.5, 0.75].map((f) => geom.padY + geom.innerH * f);
  const lastUp = points[points.length - 1] >= points[points.length - 2];

  return (
    <div ref={containerRef} className={cn("w-full overflow-hidden", className)} style={{ height }}>
      <svg
        ref={svgRef}
        width={W}
        height={height}
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label="Live price movement"
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id={`mc-area-${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--color-success)" }} stopOpacity={0.14} />
            <stop offset="100%" style={{ stopColor: "var(--color-success)" }} stopOpacity={0} />
          </linearGradient>
        </defs>

        {gridYs.map((gy, i) => (
          <line
            key={i}
            x1={geom.padX}
            x2={W - geom.padX}
            y1={gy}
            y2={gy}
            style={{ stroke: "var(--color-border)" }}
            strokeOpacity={0.5}
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
        ))}

        <path d={areaPath} fill={`url(#mc-area-${seed})`} />

        <g
          style={{
            filter:
              "drop-shadow(0 0 5px color-mix(in srgb, var(--color-success) 30%, transparent))",
          }}
        >
          {segments.map((s, i) => (
            <line
              key={i}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              style={{
                stroke:
                  s.dir > 0
                    ? "var(--color-success)"
                    : s.dir < 0
                      ? "var(--color-destructive)"
                      : "var(--color-muted-foreground)",
              }}
              strokeOpacity={s.dir === 0 ? 0.45 : 0.95}
              strokeWidth={1.75}
              strokeLinecap="round"
            />
          ))}
        </g>

        {!reduced && !compact && (
          <g>
            <circle ref={dotARef} r={3} style={{ filter: "drop-shadow(0 0 4px currentColor)" }} />
            <circle
              ref={dotBRef}
              r={2.25}
              style={{ filter: "drop-shadow(0 0 4px currentColor)" }}
            />
          </g>
        )}

        {/* Live head tick on the newest point */}
        <circle
          cx={geom.x(points.length - 1)}
          cy={geom.y(points[points.length - 1])}
          r={3.25}
          style={{ fill: lastUp ? "var(--color-success)" : "var(--color-destructive)" }}
        >
          {!reduced && (
            <animate attributeName="r" values="3.25;5.5;3.25" dur="1.8s" repeatCount="indefinite" />
          )}
        </circle>
      </svg>
    </div>
  );
}
