import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface PricePoint {
  yes_price: number;
  recorded_at: string;
}

interface SignalRow {
  signal_prob: number;
  confidence: number;
  news_count: number;
  social_count: number;
  computed_at: string;
}

interface SignalHistoryPoint {
  signal_prob: number;
  computed_at: string;
}

interface Props {
  marketId: string;
  points: PricePoint[];
  currentYesPrice: number;
  height?: number;
  className?: string;
}

/**
 * AI vs market chart. Two honest series:
 * - Market: the real crowd price from price_history (solid line).
 * - Soko model: the real model estimate. When market_signal_history exists it
 *   draws the true model line; until the migration is applied it draws the
 *   single current estimate as a dashed "model now" line — never invented
 *   historical model points.
 */
export function AiVsMarketChart({
  marketId,
  points,
  currentYesPrice,
  height = 220,
  className,
}: Props) {
  const [signal, setSignal] = useState<SignalRow | null>(null);
  const [signalHistory, setSignalHistory] = useState<SignalHistoryPoint[] | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [W, setW] = useState<number>(800);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: s } = await supabase
        .from("market_signals")
        .select("signal_prob, confidence, news_count, social_count, computed_at")
        .eq("market_id", marketId)
        .maybeSingle();
      if (cancelled) return;
      setSignal((s as SignalRow | null) ?? null);
      // History table may not exist yet (migration staged, not applied).
      try {
        const { data: h, error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- staged table not yet in generated DB types
          .from("market_signal_history" as any)
          .select("signal_prob, computed_at")
          .eq("market_id", marketId)
          .order("computed_at", { ascending: true })
          .limit(500);
        if (cancelled) return;
        if (!error && h) setSignalHistory(h as unknown as SignalHistoryPoint[]);
      } catch {
        /* table missing — fall back to the single current estimate */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [marketId]);

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

  const model = useMemo(() => {
    if (!signal) return null;
    const hasHistory = signalHistory && signalHistory.length >= 2;
    return {
      prob: Number(signal.signal_prob),
      confidence: Number(signal.confidence),
      news: signal.news_count,
      social: signal.social_count,
      computedAt: signal.computed_at,
      history: hasHistory ? signalHistory : null,
    };
  }, [signal, signalHistory]);

  const H = height;
  const padX = 40;
  const padY = 20;
  const innerW = Math.max(50, W - padX * 2);
  const innerH = H - padY * 2;

  const geom = useMemo(() => {
    if (!points || points.length < 2) return null;
    const marketVals = points.map((p) => Number(p.yes_price));
    const t0 = new Date(points[0].recorded_at).getTime();
    const t1 = new Date(points[points.length - 1].recorded_at).getTime();
    const span = Math.max(1, t1 - t0);

    const modelVals =
      model?.history && model.history.length >= 2
        ? model.history.map((h) => Number(h.signal_prob))
        : model
          ? [model.prob]
          : [];
    const all = [...marketVals, ...modelVals];
    const minRaw = Math.min(...all);
    const maxRaw = Math.max(...all);
    const pad = Math.max(0.03, (maxRaw - minRaw) * 0.2);
    const min = Math.max(0, minRaw - pad);
    const max = Math.min(1, maxRaw + pad);
    const range = Math.max(0.001, max - min);

    const xFor = (t: number) => padX + ((t - t0) / span) * innerW;
    const yFor = (v: number) => padY + (1 - (v - min) / range) * innerH;
    const smooth = (vals: number[], times: number[]) => {
      const pts = vals.map((v, i) => [xFor(times[i]), yFor(v)] as const);
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
    };

    const marketTimes = points.map((p) => new Date(p.recorded_at).getTime());
    const marketPath = smooth(marketVals, marketTimes);

    let modelPath = "";
    let modelTimes: number[] = [];
    if (model?.history && model.history.length >= 2) {
      modelTimes = model.history.map((h) => new Date(h.computed_at).getTime());
      modelPath = smooth(
        model.history.map((h) => Number(h.signal_prob)),
        modelTimes,
      );
    }

    return { marketVals, marketPath, modelPath, modelTimes, xFor, yFor, min, max, range, t1 };
  }, [points, model, innerW, innerH]);

  const edge = model ? model.prob - currentYesPrice : null;
  const edgePts = edge !== null ? edge * 100 : null;

  const signalAge = useMemo(() => {
    if (!model?.computedAt) return null;
    const mins = Math.max(
      0,
      Math.round((Date.now() - new Date(model.computedAt).getTime()) / 60000),
    );
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const h = Math.round(mins / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  }, [model]);

  if (!geom) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{ height }}
        role="img"
        aria-label="Not enough price data"
      >
        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
          Not enough price data yet
        </div>
      </div>
    );
  }

  const lastMarket = geom.marketVals[geom.marketVals.length - 1];
  const change = lastMarket - geom.marketVals[0];
  const up = change > 0.005;
  const down = change < -0.005;
  const marketColor = up
    ? "oklch(0.78 0.22 150)"
    : down
      ? "oklch(0.65 0.24 25)"
      : "oklch(0.65 0.02 280)";
  const modelColor = "oklch(0.72 0.14 300)";

  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = geom.min + (geom.range * i) / 4;
    return { v, y: geom.yFor(v) };
  });

  const stepX = innerW / Math.max(1, geom.marketVals.length - 1);
  const updateHover = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left;
    const i = Math.round((x - padX) / stepX);
    setHover(i >= 0 && i < geom.marketVals.length ? i : null);
  };

  const hoverPt =
    hover !== null
      ? {
          x: padX + hover * stepX,
          y: geom.yFor(geom.marketVals[hover]),
          v: geom.marketVals[hover],
          t: points[hover].recorded_at,
        }
      : null;

  return (
    <div className={className}>
      {/* Legend + edge */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5 rounded" style={{ background: marketColor }} />
            Market (crowd)
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0 w-5 border-t-2 border-dashed"
              style={{ borderColor: modelColor }}
            />
            Soko model
          </span>
        </div>
        {edgePts !== null && (
          <span
            className={cn(
              "text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full",
              edgePts > 0.5
                ? "bg-success/15 text-success"
                : edgePts < -0.5
                  ? "bg-destructive/15 text-destructive"
                  : "bg-muted text-muted-foreground",
            )}
            style={{ fontFamily: "var(--font-nums)" }}
            title="Soko model estimate minus current market price"
          >
            {edgePts > 0 ? "+" : ""}
            {edgePts.toFixed(1)} pts model edge
          </span>
        )}
      </div>

      <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          shapeRendering="geometricPrecision"
          style={{ display: "block", touchAction: "pan-y" }}
          role="img"
          aria-label="Market price versus Soko model estimate"
          onMouseMove={(e) => updateHover(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setHover(null)}
          onTouchStart={(e) => {
            if (e.touches.length)
              updateHover(e.touches[0].clientX, e.currentTarget.getBoundingClientRect());
          }}
          onTouchMove={(e) => {
            if (e.touches.length)
              updateHover(e.touches[0].clientX, e.currentTarget.getBoundingClientRect());
          }}
          onTouchEnd={() => setHover(null)}
        >
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
                fontFamily="var(--font-nums)"
                fill="oklch(0.7 0.02 280)"
              >
                {Math.round(t.v * 100)}
              </text>
            </g>
          ))}

          {/* Market line */}
          <path
            d={geom.marketPath}
            fill="none"
            stroke={marketColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Model: true history line, or dashed "now" estimate */}
          {model && geom.modelPath ? (
            <path
              d={geom.modelPath}
              fill="none"
              stroke={modelColor}
              strokeWidth="1.75"
              strokeDasharray="6 4"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : model ? (
            <g>
              <line
                x1={padX}
                x2={W - padX}
                y1={geom.yFor(model.prob)}
                y2={geom.yFor(model.prob)}
                stroke={modelColor}
                strokeWidth="1.75"
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={W - padX} cy={geom.yFor(model.prob)} r="3.5" fill={modelColor} />
            </g>
          ) : null}

          {hoverPt && (
            <g>
              <line
                x1={hoverPt.x}
                x2={hoverPt.x}
                y1={padY}
                y2={H - padY}
                stroke="oklch(0.7 0.02 280 / 0.35)"
                strokeWidth="1"
              />
              <circle
                cx={hoverPt.x}
                cy={hoverPt.y}
                r="4"
                fill={marketColor}
                stroke="oklch(0.1 0 0)"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>

        {hoverPt && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] shadow-lg"
            style={{
              left: Math.min(Math.max(hoverPt.x + 12, 8), W - 150),
              top: Math.max(hoverPt.y - 54, 4),
            }}
          >
            <div className="tabular-nums font-semibold" style={{ fontFamily: "var(--font-nums)" }}>
              {(hoverPt.v * 100).toFixed(1)}%
            </div>
            <div className="text-muted-foreground">
              {new Date(hoverPt.t).toLocaleString("en-KE", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        )}
      </div>

      {/* Model provenance footer */}
      {model ? (
        <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-muted-foreground">
          <span>
            Soko model{" "}
            <span
              className="font-semibold text-foreground tabular-nums"
              style={{ fontFamily: "var(--font-nums)" }}
            >
              {(model.prob * 100).toFixed(1)}%
            </span>
          </span>
          <span>·</span>
          <span>confidence {Math.round(model.confidence * 100)}%</span>
          <span>·</span>
          <span>
            {model.news} news · {model.social} social signals
          </span>
          {signalAge && (
            <>
              <span>·</span>
              <span>computed {signalAge}</span>
            </>
          )}
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-muted-foreground">
          Model signal not available yet — check back after the next signal run.
        </div>
      )}
      <p className="mt-1 text-[10px] text-muted-foreground/70">
        The Soko model estimates from news &amp; social signals. It&apos;s a research signal, not
        financial advice.
      </p>
    </div>
  );
}
