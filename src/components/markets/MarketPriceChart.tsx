import { useEffect, useMemo, useRef, useState } from "react";

interface Point {
  yes_price: number;
  recorded_at: string;
}

interface Props {
  points: Point[];
  height?: number;
  className?: string;
}

/**
 * Crisp real-data price chart. Measures container width so the SVG renders
 * 1:1 with device pixels (no non-uniform stretch blur).
 */
export function MarketPriceChart({ points, height = 220, className }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [W, setW] = useState<number>(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w && Math.abs(w - W) > 0.5) setW(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = useMemo(() => {
    if (!points || points.length < 2) return null;
    const values = points.map((p) => Number(p.yes_price));
    const minRaw = Math.min(...values);
    const maxRaw = Math.max(...values);
    const pad = Math.max(0.02, (maxRaw - minRaw) * 0.15);
    const min = Math.max(0, minRaw - pad);
    const max = Math.min(1, maxRaw + pad);
    return { values, min, max, range: Math.max(0.001, max - min) };
  }, [points]);

  if (!data) {
    return (
      <div ref={containerRef} className={className} style={{ height }} role="img" aria-label="Not enough price data">
        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
          Not enough price data yet
        </div>
      </div>
    );
  }

  const H = height;
  const padX = 40;
  const padY = 18;
  const innerW = Math.max(50, W - padX * 2);
  const innerH = H - padY * 2;

  const stepX = innerW / (data.values.length - 1);
  const yFor = (v: number) => padY + (1 - (v - data.min) / data.range) * innerH;

  const first = data.values[0];
  const last = data.values[data.values.length - 1];
  const change = last - first;
  const flat = Math.abs(change) < 0.005;
  const up = change > 0;
  const lineColor = flat ? "oklch(0.65 0.02 280)" : up ? "oklch(0.78 0.22 150)" : "oklch(0.65 0.24 25)";

  const linePath = useMemo(() => {
    const pts = data.values.map((v, i) => [padX + i * stepX, yFor(v)] as const);
    if (pts.length < 2) return "";
    let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, stepX, W]);

  const areaPath = `${linePath} L${(padX + (data.values.length - 1) * stepX).toFixed(2)},${(padY + innerH).toFixed(2)} L${padX},${(padY + innerH).toFixed(2)} Z`;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = data.min + (data.range * i) / ticks;
    return { v, y: yFor(v) };
  });

  const updateHoverFromClientX = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left;
    const i = Math.round((x - padX) / stepX);
    if (i >= 0 && i < data.values.length) setHover(i);
    else setHover(null);
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) =>
    updateHoverFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
  const onTouch = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 0) return;
    updateHoverFromClientX(e.touches[0].clientX, e.currentTarget.getBoundingClientRect());
  };

  const hoverPoint =
    hover !== null
      ? { x: padX + hover * stepX, y: yFor(data.values[hover]), v: data.values[hover], t: points[hover].recorded_at }
      : null;

  const gradId = up ? "mpc-up" : flat ? "mpc-flat" : "mpc-down";

  return (
    <div ref={containerRef} className={className} style={{ position: "relative", width: "100%" }}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        shapeRendering="geometricPrecision"
        style={{ display: "block", touchAction: "pan-y" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={onTouch}
        onTouchMove={onTouch}
        onTouchEnd={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.32" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padX}
              x2={W - padX}
              y1={t.y}
              y2={t.y}
              stroke="oklch(0.95 0.01 280 / 0.06)"
              strokeWidth="1"
              shapeRendering="crispEdges"
            />
            <text
              x={padX - 8}
              y={t.y + 4}
              textAnchor="end"
              fontSize="11"
              fontFamily="var(--font-mono)"
              fill="oklch(0.7 0.02 280)"
              style={{ textRendering: "geometricPrecision" }}
            >
              {Math.round(t.v * 100)}
            </text>
          </g>
        ))}

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {hoverPoint && (
          <g>
            <line
              x1={hoverPoint.x}
              x2={hoverPoint.x}
              y1={padY}
              y2={padY + innerH}
              stroke="oklch(0.95 0.01 280 / 0.25)"
              strokeWidth="1"
              strokeDasharray="3 3"
              shapeRendering="crispEdges"
            />
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r="5" fill={lineColor} opacity="0.25" />
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r="3" fill={lineColor} />
          </g>
        )}
      </svg>

      {hoverPoint && (
        <div
          className="absolute pointer-events-none rounded-md border border-border bg-popover px-2 py-1 text-[11px] shadow-card"
          style={{
            left: `min(calc(${(hoverPoint.x / W) * 100}% + 8px), calc(100% - 130px))`,
            top: 8,
          }}
        >
          <div className="font-mono tabular-nums text-foreground font-semibold">
            KSh {Math.round(hoverPoint.v * 100)}
          </div>
          <div className="text-muted-foreground text-[10px]">
            {new Date(hoverPoint.t).toLocaleString("en-KE", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      )}
    </div>
  );
}
