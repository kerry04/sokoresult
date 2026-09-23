// Static catalog of sources powering the news feed. Used for the Sources tab
// to give users transparency into where headlines come from.
// Kept in sync with OUTLETS in src/lib/server/news/ingestors.ts
// (spec: kenyan-news-sources.md, verified 2026-09-23).

export type SourceMethod = "RSS" | "Scrape" | "Sitemap" | "Google News";

export interface NewsSourceEntry {
  source: string; // exact value stored in raw_news_data.source for matching
  display: string; // pretty name for the UI
  method: SourceMethod;
}

export const NEWS_SOURCES: NewsSourceEntry[] = [
  // Tier 1 — RSS
  { source: "Standard Media", display: "The Standard (Headlines)", method: "RSS" },
  { source: "Standard Kenya", display: "The Standard (Kenya)", method: "RSS" },
  { source: "Standard Politics", display: "The Standard (Politics)", method: "RSS" },
  { source: "Standard Business", display: "The Standard (Business)", method: "RSS" },
  { source: "Standard Sports", display: "The Standard (Sports)", method: "RSS" },
  { source: "Standard Entertainment", display: "The Standard (Entertainment)", method: "RSS" },
  { source: "Standard World", display: "The Standard (World)", method: "RSS" },
  { source: "KBC News", display: "KBC News", method: "RSS" },
  { source: "Nairobi News", display: "Nairobi News", method: "RSS" },
  { source: "Kahawa Tungu", display: "Kahawa Tungu", method: "RSS" },
  { source: "Kenyans.co.ke", display: "Kenyans.co.ke", method: "RSS" },
  { source: "Capital FM", display: "Capital FM", method: "RSS" },
  // Tier 3 — HTML listing scrape
  { source: "Citizen Digital", display: "Citizen Digital", method: "Scrape" },
  { source: "The Star", display: "The Star", method: "Scrape" },
  { source: "Mpasho", display: "Mpasho News", method: "Scrape" },
  // Tier 4 — sitemaps
  { source: "Pulse Kenya", display: "Pulse Kenya", method: "Sitemap" },
  { source: "Business Daily", display: "Business Daily", method: "Sitemap" },
  { source: "The EastAfrican", display: "The EastAfrican", method: "Sitemap" },
  // Tier 2 — blocked; Google News fallback
  { source: "Nation", display: "Nation.Africa", method: "Google News" },
  { source: "Tuko News", display: "Tuko.co.ke", method: "Google News" },
];
