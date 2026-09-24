import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";

/**
 * Compact Soko-model-vs-market readout for cards and the hero.
 * Restrained by design: a small model probability plus the edge in points.
 * Renders nothing when there is no model signal yet — no invented data.
 */
export function ModelEdge({
  yesPrice,
  signalProb,
  confidence,
  className,
}: {
  yesPrice: number;
  signalProb: number | null | undefined;
  confidence?: number | null | undefined;
  className?: string;
}) {
  const { t } = useLang();
  if (signalProb === null || signalProb === undefined) return null;
  const edge = (signalProb - yesPrice) * 100;
  const modelPct = Math.round(signalProb * 100);
  const tone =
    edge > 0.5 ? "text-success" : edge < -0.5 ? "text-destructive" : "text-muted-foreground";

  return (
    <div
      className={cn("flex items-center gap-2 text-[11px]", className)}
      title={
        `Soko model estimate from news & social signals` +
        (confidence !== null && confidence !== undefined
          ? ` (confidence ${Math.round(confidence * 100)}%)`
          : "") +
        `. Research signal, not financial advice.`
      }
    >
      <span className="text-muted-foreground">{t("model.label")}</span>
      <span className="num font-bold tabular-nums text-foreground">{modelPct}%</span>
      <span className={cn("num font-semibold tabular-nums", tone)}>
        {edge > 0 ? "+" : edge < 0 ? "−" : ""}
        {Math.abs(edge).toFixed(1)} {t("model.pts")}
      </span>
    </div>
  );
}
