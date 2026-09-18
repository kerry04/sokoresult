import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Newspaper } from "lucide-react";

export interface TapeItem {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86_400)}d`;
}

interface Props {
  items: TapeItem[];
  pulseKey?: number; // bump to trigger a glow pulse on new article
}

/**
 * Vertical "movie credits" tape that cycles headlines.
 * Each item shows for ~5s, slides up out, next slides up in.
 */
export function NewsTape({ items, pulseKey }: Props) {
  const [idx, setIdx] = useState(0);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 5000);
    return () => clearInterval(t);
  }, [items.length]);

  useEffect(() => {
    if (pulseKey === undefined) return;
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 1400);
    return () => clearTimeout(t);
  }, [pulseKey]);

  if (items.length === 0) {
    return (
      <div className="relative h-7 overflow-hidden rounded-md border border-dashed border-border/60 bg-muted/10 px-2 flex items-center text-[10px] text-muted-foreground/60 italic">
        <Newspaper className="h-3 w-3 mr-1.5 opacity-50" />
        Awaiting headlines…
      </div>
    );
  }

  const item = items[idx];

  return (
    <div
      className={`relative h-7 overflow-hidden rounded-md border bg-background/40 transition-all ${
        pulsing
          ? "border-primary/60 shadow-[0_0_18px_-2px_var(--color-primary)]"
          : "border-border/60"
      }`}
    >
      {/* top + bottom fade gradients */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-b from-background/80 to-transparent z-10" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-gradient-to-t from-background/80 to-transparent z-10" />

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -24, opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="absolute inset-0 flex items-center gap-2 px-2 text-[11px] hover:text-primary-foreground"
        >
          <Newspaper className="h-3 w-3 shrink-0 text-primary" />
          <span className="truncate flex-1 leading-none">{item.title}</span>
          <span className="font-mono text-[9px] text-muted-foreground shrink-0">
            {timeAgo(item.published_at)}
          </span>
        </motion.a>
      </AnimatePresence>
    </div>
  );
}
