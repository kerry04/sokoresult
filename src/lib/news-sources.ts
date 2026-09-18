// Static catalog of sources powering the news feed. Used for the Sources tab
// to give users transparency into where headlines come from.

export type SourceMethod = "RSS" | "Scrape";

export interface NewsSourceEntry {
  source: string; // exact value stored in raw_news_data.source for matching
  display: string; // pretty name for the UI
  method: SourceMethod;
}

export const NEWS_SOURCES: NewsSourceEntry[] = [
  // Mainstream & high-traffic
  { source: "Standard Media", display: "The Standard", method: "RSS" },
  { source: "Standard Politics", display: "Standard Politics", method: "RSS" },
  { source: "Standard Sports", display: "Standard Sports", method: "RSS" },
  { source: "Standard Business", display: "Standard Business", method: "RSS" },
  { source: "Standard Entertainment", display: "Standard Entertainment", method: "RSS" },
  { source: "Nation Africa", display: "Nation Africa", method: "RSS" },
  { source: "Business Daily", display: "Business Daily", method: "RSS" },
  { source: "Citizen Digital", display: "Citizen Digital", method: "RSS" },
  // Fast / viral
  { source: "Tuko News", display: "Tuko.co.ke", method: "RSS" },
  { source: "Kenyans.co.ke", display: "Kenyans.co.ke", method: "RSS" },
  { source: "Pulse Live Kenya", display: "Pulse Live", method: "RSS" },
  { source: "Nairobi Wire", display: "Nairobi Wire", method: "RSS" },
  { source: "Viral Tea", display: "Viral Tea", method: "RSS" },
  // Aggregators
  { source: "AllAfrica Kenya", display: "AllAfrica Kenya", method: "RSS" },
  // Entertainment / lifestyle
  { source: "Ghafla", display: "Ghafla", method: "RSS" },
  // Niche
  { source: "Capital FM", display: "Capital FM", method: "RSS" },
  { source: "Capital Business", display: "Capital Business", method: "RSS" },
  { source: "Capital Sports", display: "Capital Sports", method: "RSS" },
  { source: "Kahawa Tungu", display: "Kahawa Tungu", method: "RSS" },
  // Africa
  { source: "BBC Africa", display: "BBC Africa", method: "RSS" },
];
