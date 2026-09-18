import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

interface AnimatedSparklineProps {
  /** Seed value (0..1) used to deterministically initialise the series */
  seed: number;
  className?: string;
  height?: number;
  /** Trend direction: up biases drift positive, down negative */
  trend?: "up" | "down";
  /** Number of points held in the rolling window */
  points?: number;
  /** ms between ticks */
  interval?: number;
}

/**
 * A live-ticking sparkline. Renders a deterministic initial series (so SSR
 * and client agree, no hydration mismatch), then once mounted + in view
 * starts ticking new prices into the right edge — line and gradient slide
 * left in real time, like a trading terminal.
 */
export function AnimatedSparkline({
  seed,
  className,
  height = 64,
  trend = "up",
  points = 42,
  interval = 700,
}: AnimatedSparklineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.2 });

  // Deterministic initial series — uses a seeded PRNG so SSR === CSR.
  const [series, setSeries] = useState<number[]>(() => buildDeterministic(seed, points, trend));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !inView) return;
    const id = window.setInterval(() => {
      setSeries((prev) => {
        const last = prev[prev.length - 1];
        const bias = trend === "up" ? 0.004 : -0.004;
        const next = clamp(last + bias + (Math.random() - 0.5) * 0.045, 0.05, 0.95);
        return [...prev.slice(1), next];
      });
    }, interval);
    return () => window.clearInterval(id);
  }, [mounted, inView, trend, interval]);

  const W = 300;
  const H = height;
  const stepX = W / (series.length - 1);
  const minV = Math.min(...series);
  const maxV = Math.max(...series);
  const range = Math.max(0.0001, maxV - minV);
  const pad = 6;
  const ys = series.map((p) => pad + (1 - (p - minV) / range) * (H - pad * 2));
  const path = ys.map((y, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${path} L${W},${H} L0,${H} Z`;
  const lastX = (series.length - 1) * stepX;
  const lastY = ys[ys.length - 1];

  const stroke = trend === "up" ? "oklch(0.78 0.22 150)" : "oklch(0.65 0.24 25)";
  const gradId = `spark-${trend}-${Math.round(seed * 1000)}`;

  return (
    <div ref={ref} className={className} style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} style={{ transition: "d 0.6s ease-out" }} />
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{ transition: "d 0.6s ease-out" }}
        />
        <circle cx={lastX} cy={lastY} r="2.4" fill={stroke} style={{ transition: "cx 0.6s, cy 0.6s" }} />
        <circle
          cx={lastX}
          cy={lastY}
          r="6"
          fill={stroke}
          opacity="0.25"
          style={{ transition: "cx 0.6s, cy 0.6s" }}
        >
          <animate attributeName="r" values="4;10;4" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.35;0;0.35" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Mulberry32 — tiny deterministic PRNG so server & client match. */
function rng(seed: number) {
  let a = Math.floor(seed * 1e9) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDeterministic(seed: number, n: number, trend: "up" | "down") {
  const r = rng(seed);
  const out: number[] = [];
  let v = clamp(seed, 0.15, 0.85);
  const drift = (trend === "up" ? 1 : -1) * 0.003;
  for (let i = 0; i < n; i++) {
    v = clamp(v + drift + (r() - 0.5) * 0.05, 0.05, 0.95);
    out.push(v);
  }
  return out;
}

/** Deterministic % change derived from seed + trend, stable across SSR/CSR. */
export function deriveChangePct(seed: number, trend: "up" | "down") {
  const r = rng(seed + 0.137);
  const mag = 0.4 + r() * 6.8;
  return trend === "up" ? mag : -mag;
}
