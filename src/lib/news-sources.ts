// Static catalog of sources powering the news feed. Used for the Sources tab
// to give users transparency into where headlines come from.
// Kept in sync with FEEDS in src/routes/api/public/hooks/scrape-news.ts
// (live probe 2026-09-23 — dead feeds removed, replacements added).

export type SourceMethod = "RSS" | "Scrape";

export interface NewsSourceEntry {
  source: string; // exact value stored in raw_news_data.source for matching
  display: string; // pretty name for the UI
  method: SourceMethod;
}

export const NEWS_SOURCES: NewsSourceEntry[] = [
  // Kenya mainstream & high-traffic
  { source: "Standard Media", display: "The Standard", method: "RSS" },
  { source: "Standard Politics", display: "Standard Politics", method: "RSS" },
  { source: "Standard Sports", display: "Standard Sports", method: "RSS" },
  { source: "Standard Business", display: "Standard Business", method: "RSS" },
  { source: "Standard Entertainment", display: "Standard Entertainment", method: "RSS" },
  { source: "Nation Africa", display: "Nation Africa", method: "RSS" },
  { source: "Business Daily", display: "Business Daily", method: "RSS" },
  { source: "The Eastleigh Voice", display: "The Eastleigh Voice", method: "RSS" },
  // Kenya fast / viral
  { source: "Tuko News", display: "Tuko.co.ke", method: "RSS" },
  { source: "Kenyans.co.ke", display: "Kenyans.co.ke", method: "RSS" },
  { source: "Nairobi Wire", display: "Nairobi Wire", method: "RSS" },
  { source: "Nairobi Gazette", display: "Nairobi Gazette", method: "RSS" },
  // Kenya entertainment / lifestyle
  { source: "Ghafla", display: "Ghafla", method: "RSS" },
  { source: "Kahawa Tungu", display: "Kahawa Tungu", method: "RSS" },
  // Africa
  { source: "BBC Africa", display: "BBC Africa", method: "RSS" },
  { source: "Premium Times", display: "Premium Times", method: "RSS" },
  { source: "Punch Nigeria", display: "Punch Nigeria", method: "RSS" },
  { source: "Vanguard Nigeria", display: "Vanguard Nigeria", method: "RSS" },
  // Tech / business
  { source: "TechCabal", display: "TechCabal", method: "RSS" },
];
