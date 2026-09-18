import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/server/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { logPipelineFailure } from "@/lib/server/pipeline-alerts";

// Kenyan + African news RSS sources — only sources confirmed to deliver stories
const FEEDS: Array<{ source: string; url: string; defaultCategory?: string }> = [
  // === Mainstream & high-traffic ===
  { source: "Standard Media", url: "https://www.standardmedia.co.ke/rss/headlines.php" },
  { source: "Standard Politics", url: "https://www.standardmedia.co.ke/rss/politics.php", defaultCategory: "politics" },
  { source: "Standard Sports", url: "https://www.standardmedia.co.ke/rss/sports.php", defaultCategory: "sports" },
  { source: "Standard Business", url: "https://www.standardmedia.co.ke/rss/business.php", defaultCategory: "economics" },
  { source: "Standard Entertainment", url: "https://www.standardmedia.co.ke/rss/entertainment.php", defaultCategory: "entertainment" },
  { source: "Nation Africa", url: "https://nation.africa/kenya/rss.xml" },
  { source: "Business Daily", url: "https://www.businessdailyafrica.com/bd/rss.xml", defaultCategory: "economics" },
  { source: "Citizen Digital", url: "https://citizen.digital/feed" },
  // === Fast digital / viral / breaking ===
  { source: "Tuko News", url: "https://www.tuko.co.ke/rss/all.rss" },
  { source: "Kenyans.co.ke", url: "https://www.kenyans.co.ke/feeds/news" },
  { source: "Pulse Live Kenya", url: "https://www.pulse.co.ke/rss" },
  { source: "Nairobi Wire", url: "https://nairobiwire.com/feed" },
  { source: "Viral Tea", url: "https://viraltea.co.ke/feed/" },
  // === Aggregators ===
  { source: "AllAfrica Kenya", url: "https://allafrica.com/tools/headlines/rdf/kenya/headlines.rdf" },
  // === Entertainment / lifestyle ===
  { source: "Ghafla", url: "https://www.ghafla.com/ke/feed/", defaultCategory: "entertainment" },
  // === Niche ===
  { source: "Capital FM", url: "https://www.capitalfm.co.ke/news/feed/" },
  { source: "Capital Business", url: "https://www.capitalfm.co.ke/business/feed/", defaultCategory: "economics" },
  { source: "Capital Sports", url: "https://www.capitalfm.co.ke/sports/feed/", defaultCategory: "sports" },
  { source: "Kahawa Tungu", url: "https://kahawatungu.com/feed/" },
  // === Africa coverage ===
  { source: "BBC Africa", url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml" },
];

const KENYA_KEYWORDS = ["kenya", "kenyan", "nairobi", "mombasa", "kisumu", "ruto", "raila", "harambee", "mpesa", "m-pesa", "iebc", "shilling", "ksh"];

// Buzzword-based auto-categorization. Order matters: first match wins for ties,
// but we score per category and pick the highest.
const CATEGORY_BUZZWORDS: Record<string, string[]> = {
  politics: [
    "ruto", "raila", "gachagua", "uhuru", "kenyatta", "odinga", "uda", "odm", "azimio",
    "mp ", "senator", "governor", "cabinet", "cs ", "parliament", "national assembly",
    "iebc", "ballot", "election", "referendum", "impeach", "bill", "gazette", "policy",
    "presiden", "minister", "speaker", "constitution", "protest", "demo ", "maandamano",
    "duale", "kindiki", "mudavadi", "wetangula", "kalonzo", "matiangi", "haki",
  ],
  sports: [
    "harambee stars", "afcon", "cecafa", "kpl", "fkf", "world cup", "premier league",
    "fixture", "goal", "striker", "coach", "match", "tournament", "olympic", "marathon",
    "athletic", "rugby", "shujaa", "boxing", "kabaddi", "fifa", "uefa", "caf ",
    "sevens", "gor mahia", "afc leopards", "kcb fc", "tusker fc", "ipl", "cricket",
    "f1", "formula", "kipchoge", "kipyegon", "rudisha", "obiri", "chebet",
  ],
  entertainment: [
    "diamond", "bahati", "size 8", "akothee", "khaligraph", "nyashinski", "sauti sol",
    "wasafi", "bongo", "music", "song", "album", "single ", "video", "celeb", "drama",
    "movie", "netflix", "showmax", "concert", "festival", "premiere", "wedding",
    "engagement", "girlfriend", "boyfriend", "exposed", "leaked", "scandal", "dating",
    "relationship", "instagram", "tiktok", "viral", "youtube", "actor", "actress",
    "socialite", "kim k", "huddah", "vera sidika", "amber ray", "mulamwah", "eric omondi",
  ],
  economics: [
    "shilling", "ksh", "kes ", "inflation", "gdp", "treasury", "cbk", "central bank",
    "kra", "tax ", "budget", "loan", "debt", "imf", "world bank", "stocks", "nse ",
    "shares", "dividend", "profit", "revenue", "earnings", "bank ", "equity", "kcb",
    "safaricom", "mpesa", "m-pesa", "fuel price", "petrol", "diesel", "epra",
    "manufactur", "export", "import", "tariff", "investment", "investor", "startup",
    "fintech", "economy", "economic", "trade ", "market cap", "ipo ",
  ],
};

function categorizeFromText(title: string, body: string): string | null {
  const text = (title + " " + body).toLowerCase();
  let best: { cat: string; score: number } | null = null;
  for (const [cat, words] of Object.entries(CATEGORY_BUZZWORDS)) {
    let score = 0;
    for (const w of words) {
      // word can already include a trailing space for word-boundary intent
      if (text.includes(w)) score += w.length > 5 ? 2 : 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { cat, score };
  }
  return best ? best.cat : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripHtml(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
}

function pickTag(item: string, tag: string): string {
  // NOTE: must use [\\s\\S] inside the template literal so the RegExp sees \s\S
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = item.match(re);
  return m ? decodeEntities(stripHtml(m[1])) : "";
}

function pickAtomLink(item: string): string {
  // Atom: <link href="..." rel="alternate"/>
  const m = item.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? m[1] : "";
}

function pickImage(item: string): string {
  const enc = item.match(/<enclosure[^>]*url=["']([^"']+)["']/i);
  if (enc) return enc[1];
  const media = item.match(/<media:content[^>]*url=["']([^"']+)["']/i);
  if (media) return media[1];
  const img = item.match(/<img[^>]*src=["']([^"']+)["']/i);
  if (img) return img[1];
  return "";
}

interface ParsedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  image: string;
}

function parseRss(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  // RSS <item> blocks
  const itemRe = /<item[\s>][\s\S]*?<\/item>/gi;
  const itemMatches = xml.match(itemRe) ?? [];
  for (const raw of itemMatches) {
    const title = pickTag(raw, "title");
    const link = pickTag(raw, "link") || pickAtomLink(raw);
    const description = pickTag(raw, "description") || pickTag(raw, "content:encoded") || pickTag(raw, "summary");
    const pubDate = pickTag(raw, "pubDate") || pickTag(raw, "dc:date") || pickTag(raw, "published") || new Date().toISOString();
    const image = pickImage(raw);
    if (title && link) items.push({ title, link, description, pubDate, image });
  }
  // Atom <entry> blocks
  const entryRe = /<entry[\s>][\s\S]*?<\/entry>/gi;
  const entryMatches = xml.match(entryRe) ?? [];
  for (const raw of entryMatches) {
    const title = pickTag(raw, "title");
    const link = pickAtomLink(raw) || pickTag(raw, "id");
    const description = pickTag(raw, "summary") || pickTag(raw, "content");
    const pubDate = pickTag(raw, "updated") || pickTag(raw, "published") || new Date().toISOString();
    const image = pickImage(raw);
    if (title && link) items.push({ title, link, description, pubDate, image });
  }
  return items;
}

function isKenyanRelevant(title: string, body: string): boolean {
  const t = (title + " " + body).toLowerCase();
  return KENYA_KEYWORDS.some((k) => t.includes(k));
}

async function recordHealth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  source: string,
  fetchStarted: string,
  success: boolean,
  error: string | null,
  insertedCount: number,
) {
  const { data: prev } = await admin
    .from("source_health")
    .select("consecutive_failures, articles_24h, last_success_at")
    .eq("source", source)
    .maybeSingle();
  const prevFails = (prev?.consecutive_failures as number | undefined) ?? 0;
  const prevArticles = (prev?.articles_24h as number | undefined) ?? 0;
  const prevSuccess = (prev?.last_success_at as string | undefined) ?? null;
  const fails = success ? 0 : prevFails + 1;
  let status: "active" | "stale" | "down" = "active";
  if (fails >= 3) status = "down";
  else if (!success) status = "stale";
  await admin.from("source_health").upsert(
    {
      source,
      last_fetch_at: fetchStarted,
      last_success_at: success ? fetchStarted : prevSuccess,
      consecutive_failures: fails,
      articles_24h: prevArticles + insertedCount,
      last_error: success ? null : error,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source" },
  );
}

export const Route = createFileRoute("/api/public/hooks/scrape-news")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const results: Array<{ source: string; fetched: number; inserted: number; error?: string }> = [];

        for (const feed of FEEDS) {
          const fetchStarted = new Date().toISOString();
          try {
            const res = await fetch(feed.url, {
              headers: {
                "User-Agent": "Mozilla/5.0 (compatible; SokoResultBot/1.0; +https://sokoresult.com)",
                "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
              },
              signal: AbortSignal.timeout(15_000),
              redirect: "follow",
            });
            if (!res.ok) {
              await recordHealth(admin, feed.source, fetchStarted, false, `HTTP ${res.status}`, 0);
              results.push({ source: feed.source, fetched: 0, inserted: 0, error: `HTTP ${res.status}` });
              continue;
            }
            const xml = await res.text();
            const items = parseRss(xml);

            const isKenyaFeed = !feed.source.includes("BBC");
            const filtered = items.filter((it) =>
              isKenyaFeed || isKenyanRelevant(it.title, it.description),
            );

            const rows = filtered.slice(0, 25).map((it) => {
              let publishedAt: string;
              try { publishedAt = new Date(it.pubDate).toISOString(); }
              catch { publishedAt = new Date().toISOString(); }
              return {
                source: feed.source,
                title: it.title.slice(0, 500),
                url: it.link,
                body: it.description.slice(0, 4000) || null,
                image_url: it.image || null,
                published_at: publishedAt,
                category: feed.defaultCategory ?? categorizeFromText(it.title, it.description) ?? null,
                processed: false,
              };
            });

            if (rows.length === 0) {
              await recordHealth(admin, feed.source, fetchStarted, true, null, 0);
              results.push({ source: feed.source, fetched: items.length, inserted: 0 });
              continue;
            }

            const { data, error } = await admin
              .from("raw_news_data")
              .upsert(rows, { onConflict: "source,url", ignoreDuplicates: true })
              .select("id");

            if (error) {
              await recordHealth(admin, feed.source, fetchStarted, false, error.message, 0);
              results.push({ source: feed.source, fetched: items.length, inserted: 0, error: error.message });
            } else {
              const inserted = data?.length ?? 0;
              await recordHealth(admin, feed.source, fetchStarted, true, null, inserted);
              results.push({ source: feed.source, fetched: items.length, inserted });
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await recordHealth(admin, feed.source, fetchStarted, false, msg, 0);
            await logPipelineFailure(admin, "scrape-news:feed", e, { source: feed.source });
            results.push({ source: feed.source, fetched: 0, inserted: 0, error: msg });
          }
        }

        return new Response(JSON.stringify({ ok: true, results }, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
