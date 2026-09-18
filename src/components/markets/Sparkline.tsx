interface SparklineProps {
  points: number[]; // values 0..1 (YES probability)
  className?: string;
  height?: number;
  /** When true (default) draws straight segments for a jagged terminal look. */
  jagged?: boolean;
}

/**
 * Renders a single line for the dominant outcome:
 * - If latest YES probability >= 0.5, plot YES (green, trending up = good).
 * - Otherwise plot NO (red), mirrored so a rising NO probability rises visually.
 */
export function Sparkline({ points, className, height = 96, jagged = true }: SparklineProps) {
  if (points.length < 2) return <div className={className} style={{ height }} />;

  const latest = points[points.length - 1];
  const showYes = latest >= 0.5;
  const series = showYes ? points : points.map((p) => 1 - p);
  const color = showYes ? "oklch(0.78 0.22 150)" : "oklch(0.65 0.24 25)";
  const gradId = `spark-${showYes ? "yes" : "no"}-${Math.round(series.length * 13 + latest * 1000)}`;

  const W = 300;
  const H = height;
  const padY = 6;
  const stepX = W / (series.length - 1);

  // Normalize to local min/max so the line uses the full vertical space (jagged feel)
  const minV = Math.min(...series);
  const maxV = Math.max(...series);
  const range = Math.max(0.0001, maxV - minV);
  const pts = series.map((p, i) => {
    const x = i * stepX;
    const y = padY + (1 - (p - minV) / range) * (H - padY * 2);
    return [x, y] as const;
  });

  let line: string;
  if (jagged) {
    line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
  } else {
    line = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      line += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
    }
  }
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: "100%", height, display: "block" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.55" />
          <stop offset="55%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Last-point dot for a "live" terminal feel */}
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r={2.4}
        fill={color}
      />
    </svg>
  );
}
