import type { StatItem } from "./MarketStats";

/**
 * Preview markets used ONLY when the database has zero open markets, so the
 * featured carousel can be evaluated as a visual prototype. These are NOT
 * real markets: no trades, no volume, no resolution. The carousel prefers
 * real open markets whenever any exist, and preview items are tagged
 * `demo: true` so the UI marks them as preview.
 */
export interface CarouselMarket {
  id: string;
  slug: string;
  question: string;
  category: string;
  yes_price: number; // 0..1
  no_price: number; // 0..1
  stats: StatItem[];
  closesLabel: string;
  seed: string;
  demo?: boolean;
}

export const DEMO_MARKETS: CarouselMarket[] = [
  {
    id: "demo-meth-haul",
    slug: "demo-meth-haul",
    question:
      "Will Kenyan officials destroy the recovered Sh8.2 billion methamphetamine haul before October 15, 2026?",
    category: "Politics",
    yes_price: 0.5,
    no_price: 0.5,
    stats: [
      { label: "Volume", value: "KSh 2.4M", tone: "flat" },
      { label: "24h", value: "+4.8%", tone: "up" },
      { label: "Liquidity", value: "KSh 680K", tone: "flat" },
    ],
    closesLabel: "Oct 15, 2026",
    seed: "demo-meth-haul",
    demo: true,
  },
  {
    id: "demo-inflation",
    slug: "demo-inflation",
    question: "Will Kenya's inflation rate fall below 5% before December 2026?",
    category: "Economics",
    yes_price: 0.62,
    no_price: 0.38,
    stats: [
      { label: "Volume", value: "KSh 1.1M", tone: "flat" },
      { label: "24h", value: "+2.1%", tone: "up" },
      { label: "Liquidity", value: "KSh 340K", tone: "flat" },
    ],
    closesLabel: "Dec 31, 2026",
    seed: "demo-inflation",
    demo: true,
  },
  {
    id: "demo-harambee-stars",
    slug: "demo-harambee-stars",
    question: "Will Harambee Stars qualify for AFCON 2027?",
    category: "Sports",
    yes_price: 0.71,
    no_price: 0.29,
    stats: [
      { label: "Volume", value: "KSh 3.8M", tone: "flat" },
      { label: "24h", value: "-1.6%", tone: "down" },
      { label: "Liquidity", value: "KSh 920K", tone: "flat" },
    ],
    closesLabel: "End of qualifiers",
    seed: "demo-harambee-stars",
    demo: true,
  },
];
