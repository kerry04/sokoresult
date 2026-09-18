import { motion, useInView } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

interface LiveChartProps {
  /** Total animated points (default 48). */
  count?: number;
  /** Frame at which the NEWS event fires (0..count). */
  newsAt?: number;
  /** YES probability before news (0..1). */
  startPrice?: number;
  /** YES probability immediately after news jump. */
  jumpTo?: number;
  /** Final probability the line drifts to. */
  endPrice?: number;
  className?: string;
  height?: number;
  /** Loop the whole animation. */
  loop?: boolean;
  /** Loop period in ms. */
  duration?: number;
}

/**
 * Live, deterministic price-action chart with:
 *  - animated polyline that draws left→right
 *  - matching volume bars
 *  - NEWS event marker that drops in mid-way and the price shoots up
 *  - live-ticking headline price + dot at the leading edge
 *
 * All motion is driven by an internal frame counter so it stays smooth and
 * cheap (one rAF per chart, only when in view).
 */
export function LiveChart({
  count = 60,
  newsAt = 36,
  startPrice = 0.42,
  jumpTo = 0.62,
  endPrice = 0.74,
  className,
  height = 200,
  loop = true,
  duration = 6500,
}: LiveChartProps) {
  // Build the full target series once (deterministic random walk).
  const series = useMemo(() => buildSeries(count, newsAt, startPrice, jumpTo, endPrice), [
    count,
    newsAt,
    startPrice,
    jumpTo,
    endPrice,
  ]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inView = useInView(wrapRef, { once: false, amount: 0.25 });

  const [progress, setProgress] = useState(0); // 0..1
  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    let start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      let p = Math.min(1, elapsed / duration);
      setProgress(p);
      if (p >= 1) {
        if (loop) {
          // brief pause then restart
          setTimeout(() => {
            start = performance.now();
            raf = requestAnimationFrame(tick);
          }, 900);
          return;
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, duration, loop]);

  // Chart geometry
  const W = 600;
  const H = height;
  const padX = 28;
  const padTop = 18;
  const padBottom = 46; // leave room for volume bars
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  // How many points to reveal based on progress.
  const revealed = Math.max(2, Math.floor(progress * series.length));
  const visible = series.slice(0, revealed);

  const stepX = innerW / (series.length - 1);

  // Y range covers the whole series so the line doesn't rescale mid-animation.
  const minV = Math.min(...series);
  const maxV = Math.max(...series);
  const range = Math.max(0.001, maxV - minV);
  const yFor = (v: number) => padTop + (1 - (v - minV) / range) * innerH;

  const linePts = visible.map((v, i) => `${padX + i * stepX},${yFor(v)}`);
  const linePath = "M" + linePts.join(" L");
  const areaPath =
    linePath +
    ` L${padX + (visible.length - 1) * stepX},${padTop + innerH}` +
    ` L${padX},${padTop + innerH} Z`;

  const lastIdx = visible.length - 1;
  const lastX = padX + lastIdx * stepX;
  const lastY = yFor(visible[lastIdx]);

  // Headline price (KSh)
  const priceKsh = Math.round(visible[lastIdx] * 100);

  // News marker becomes active once revealed reaches newsAt
  const newsRevealed = revealed >= newsAt;
  const newsX = padX + newsAt * stepX;
  const newsY = yFor(series[newsAt]);

  // pts delta (from start)
  const ptsDelta = Math.round((visible[lastIdx] - series[0]) * 100);

  // Y-axis ticks
  const ticks = [0.4, 0.5, 0.6, 0.7];

  return (
    <div ref={wrapRef} className={className}>
      {/* Header row: question, live price, +pts */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground line-clamp-1">
          Will William Ruto win 2027 election?
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 text-success border border-success/30 px-2 py-0.5 text-[10px] font-semibold uppercase shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          Live
        </span>
      </div>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="font-mono text-4xl sm:text-5xl font-bold text-success tabular-nums">
          KSh {priceKsh}
        </span>
        <span className={"font-mono text-sm tabular-nums " + (ptsDelta >= 0 ? "text-success" : "text-destructive")}>
          {ptsDelta >= 0 ? "+" : ""}
          {ptsDelta}pts
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
        <defs>
          <linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.78 0.22 150)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="oklch(0.78 0.22 150)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lc-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.78 0.22 150)" />
            <stop offset="100%" stopColor="oklch(0.85 0.22 150)" />
          </linearGradient>
          <filter id="lc-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Y grid + tick labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padX}
              x2={W - padX}
              y1={yFor(t)}
              y2={yFor(t)}
              stroke="oklch(0.95 0.01 280 / 0.06)"
              strokeWidth="1"
            />
            <text
              x={padX - 6}
              y={yFor(t) + 3}
              textAnchor="end"
              fontSize="9"
              fill="oklch(0.65 0.02 280)"
              fontFamily="var(--font-mono)"
            >
              KSh {Math.round(t * 100)}
            </text>
          </g>
        ))}

        {/* Volume bars (revealed in step with the line) */}
        {visible.map((v, i) => {
          const barH = 4 + ((v - minV) / range) * 24 + (i === newsAt ? 8 : 0);
          const x = padX + i * stepX - stepX * 0.32;
          const fill = i >= newsAt ? "oklch(0.78 0.22 150 / 0.55)" : "oklch(0.55 0.22 305 / 0.45)";
          return (
            <rect
              key={i}
              x={x}
              y={H - padBottom + 8 - barH}
              width={Math.max(2, stepX * 0.62)}
              height={barH}
              rx={1}
              fill={fill}
            />
          );
        })}

        {/* Vertical NEWS guide */}
        {newsRevealed && (
          <line
            x1={newsX}
            x2={newsX}
            y1={padTop}
            y2={H - padBottom + 8}
            stroke="oklch(0.74 0.22 350)"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.7"
          />
        )}

        {/* Area + line */}
        <path d={areaPath} fill="url(#lc-area)" />
        <path
          d={linePath}
          fill="none"
          stroke="url(#lc-line)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#lc-glow)"
          vectorEffect="non-scaling-stroke"
        />

        {/* Leading dot */}
        <circle cx={lastX} cy={lastY} r="6" fill="oklch(0.78 0.22 150)" opacity="0.25">
          <animate attributeName="r" values="5;9;5" dur="1.4s" repeatCount="indefinite" />
        </circle>
        <circle cx={lastX} cy={lastY} r="3" fill="oklch(0.85 0.22 150)" />

        {/* News pin */}
        {newsRevealed && (
          <g style={{ transformOrigin: `${newsX}px ${newsY}px` }}>
            <circle cx={newsX} cy={newsY} r="4" fill="oklch(0.74 0.22 350)" />
            <circle cx={newsX} cy={newsY} r="4" fill="none" stroke="oklch(0.74 0.22 350)" strokeWidth="1.5" opacity="0.55">
              <animate attributeName="r" values="4;14;4" dur="1.6s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0;0.6" dur="1.6s" repeatCount="indefinite" />
            </circle>
          </g>
        )}
      </svg>

      {/* Floating NEWS badge that animates in over the news pin */}
      <div className="relative" style={{ height: 0 }}>
        {newsRevealed && (
          <motion.div
            key={`news-${Math.floor(progress * 10)}`}
            initial={{ opacity: 0, y: 8, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
            className="absolute"
            style={{
              left: `calc(${(newsX / W) * 100}% - 30px)`,
              top: `calc(-1 * ${height}px + ${newsY - 28}px)`,
            }}
          >
            <div className="rounded-md bg-accent-pink/20 border border-accent-pink/50 backdrop-blur px-2 py-0.5 text-[10px] font-mono font-bold text-accent-pink shadow-[0_0_12px_-2px_color-mix(in_oklab,var(--accent-pink)_70%,transparent)] whitespace-nowrap">
              NEWS +17pts
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ──────────── Helpers ──────────── */

function buildSeries(
  n: number,
  newsAt: number,
  startP: number,
  jumpTo: number,
  endP: number,
): number[] {
  // Seeded pseudo-random so the chart is stable between renders
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let v: number;
    if (i < newsAt) {
      // gentle drift around startP
      const t = i / Math.max(1, newsAt - 1);
      v = startP + (jumpTo - 0.04 - startP) * t * 0.4 + (rand() - 0.5) * 0.025;
    } else if (i === newsAt) {
      v = jumpTo; // the jump
    } else {
      // climb toward endP after news
      const t = (i - newsAt) / Math.max(1, n - newsAt - 1);
      v = jumpTo + (endP - jumpTo) * Math.pow(t, 0.8) + (rand() - 0.5) * 0.02;
    }
    out.push(Math.max(0.05, Math.min(0.95, v)));
  }
  return out;
}
