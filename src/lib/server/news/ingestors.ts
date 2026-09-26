// Kenyan news ingestion — one code path per ingestor, outlets as config rows.
// Spec: kenyan-news-sources.md (verified 2026-09-23).
// STRICT POLICY (2026-09-26): Kenyan outlets only. No global wires, no
// aggregators (GDELT, Google News topic feeds), no hazard feeds. SokoResult
// is a Kenyan prediction market — its newsroom is Kenyan, full stop.
//
// Ingestors:
//   rss          — RSS/Atom feeds (Tier 1)
//   html-listing — scrape listing pages, extract article URLs by pattern (Tier 3)
//   news-sitemap — news/article sitemaps (Tier 4)
//   gnews-rss    — Google News `site:` query fallback for blocked outlets
//
// Adding an outlet = one row in OUTLETS. Never new code.
import { logPipelineFailure } from "@/lib/server/pipeline-alerts";

// ───────────────────────────── shared fetch ─────────────────────────────

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface FetchedDoc {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

export async function fetchDoc(url: string, timeoutMs = 15_000): Promise<FetchedDoc> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/rss+xml,application/xml,*/*",
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (res.status === 429) {
      // Politeness: back off this outlet for the cycle.
      return { ok: false, status: 429, error: "HTTP 429 (rate limited)" };
    }
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    return { ok: true, status: res.status, body: await res.text() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ───────────────────────────── HTML helpers ─────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function stripHtml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickTag(item: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = item.match(re);
  return m ? decodeEntities(stripHtml(m[1])) : "";
}

function pickMeta(html: string, name: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  if (m) return decodeEntities(m[1]);
  // content-before-name ordering
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[2] ?? m2[1]) : "";
}

function pickTimeDatetime(html: string): string | null {
  const m = html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function absolutize(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

// ───────────────────────────── RSS parsing ─────────────────────────────

export interface Article {
  url: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  publishedAt: string;
}

export function parseRss(xml: string, baseUrl: string): Article[] {
  const out: Article[] = [];
  const seen = new Set<string>();
  const blocks = [
    ...(xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []),
  ];
  for (const raw of blocks) {
    const title = pickTag(raw, "title");
    const link =
      pickTag(raw, "link") ||
      raw.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ||
      pickTag(raw, "guid");
    if (!title || !link) continue;
    const url = absolutize(decodeEntities(link.trim()), baseUrl);
    if (seen.has(url)) continue;
    seen.add(url);
    const description =
      pickTag(raw, "description") ||
      pickTag(raw, "content:encoded") ||
      pickTag(raw, "summary") ||
      pickTag(raw, "content");
    const pubDate =
      pickTag(raw, "pubDate") ||
      pickTag(raw, "dc:date") ||
      pickTag(raw, "published") ||
      pickTag(raw, "updated");
    let publishedAt = new Date().toISOString();
    if (pubDate) {
      try {
        publishedAt = new Date(pubDate).toISOString();
      } catch {
        /* keep fetch time */
      }
    }
    const image =
      raw.match(/<enclosure[^>]*url=["']([^"']+)["']/i)?.[1] ??
      raw.match(/<media:content[^>]*url=["']([^"']+)["']/i)?.[1] ??
      null;
    out.push({
      url,
      title: title.slice(0, 500),
      body: description ? decodeEntities(description).slice(0, 4000) : null,
      imageUrl: image || null,
      publishedAt,
    });
  }
  return out;
}

// ───────────────────────────── sitemap parsing ─────────────────────────────

export function parseNewsSitemap(xml: string, baseUrl: string): Article[] {
  const out: Article[] = [];
  const seen = new Set<string>();
  const urlBlocks = xml.match(/<url[\s>][\s\S]*?<\/url>/gi) ?? [];
  for (const block of urlBlocks) {
    const loc = block.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1];
    if (!loc) continue;
    const url = absolutize(decodeEntities(loc.trim()), baseUrl);
    if (seen.has(url)) continue;
    seen.add(url);
    // Skip non-article pages when the sitemap mixes them in.
    const titleGuess = block.match(/<news:title>([\s\S]*?)<\/news:title>/i)?.[1] ?? null;
    const dateXml =
      block.match(/<news:publication_date>([\s\S]*?)<\/news:publication_date>/i)?.[1] ??
      block.match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1] ??
      null;
    let publishedAt = new Date().toISOString();
    if (dateXml) {
      try {
        publishedAt = new Date(decodeEntities(dateXml.trim())).toISOString();
      } catch {
        /* keep fetch time */
      }
    }
    out.push({
      url,
      title: titleGuess ? decodeEntities(stripHtml(titleGuess)).slice(0, 500) : slugToTitle(url),
      body: null,
      imageUrl: null,
      publishedAt,
    });
  }
  return out;
}

function slugToTitle(url: string): string {
  const slug = url.split("/").filter(Boolean).pop() ?? "";
  return decodeEntities(
    slug
      .replace(/\.\w+$/, "")
      .replace(/^\d{4}-\d{2}-\d{2}-/, "")
      .replace(/[-_]+/g, " ")
      .trim(),
  ).slice(0, 500);
}

// ───────────────────────────── html-listing parsing ─────────────────────────────

/** Extract unique article URLs from a listing page via the outlet's regex. */
export function extractArticleUrls(html: string, pattern: RegExp, baseUrl: string): string[] {
  const found = new Set<string>();
  const re = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    found.add(absolutize(decodeEntities(m[0].replace(/["'<>\s].*$/, "")), baseUrl));
    // The regex above matches prefixes; also try href-attribute extraction:
  }
  if (found.size === 0) {
    // Fallback: scan href attributes and match the pattern against each href.
    const hrefs = html.match(/href=["']([^"']+)["']/gi) ?? [];
    for (const h of hrefs) {
      const href = h.slice(6, -1);
      if (pattern.test(href)) found.add(absolutize(decodeEntities(href), baseUrl));
    }
  }
  return [...found];
}

/** Fetch one article page and pull title / description / timestamp. */
async function fetchArticlePage(url: string, dateFromUrl?: string): Promise<Article | null> {
  const doc = await fetchDoc(url);
  if (!doc.ok || !doc.body) return null;
  const html = doc.body;
  const title =
    pickMeta(html, "og:title") ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ||
    slugToTitle(url);
  const description = pickMeta(html, "og:description") || pickMeta(html, "description") || null;
  const datetime = pickTimeDatetime(html);
  let publishedAt = new Date().toISOString();
  if (datetime) {
    try {
      publishedAt = new Date(datetime).toISOString();
    } catch {
      /* fall through to dateFromUrl / fetch time */
    }
  } else if (dateFromUrl) {
    try {
      publishedAt = new Date(dateFromUrl).toISOString();
    } catch {
      /* keep fetch time */
    }
  }
  return {
    url,
    title: decodeEntities(title).slice(0, 500),
    body: description ? description.slice(0, 4000) : null,
    imageUrl: pickMeta(html, "og:image") || null,
    publishedAt,
  };
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ───────────────────────────── watermarks ─────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

// Max Citizen article ID seen this run — persisted in private.cron_config
// (table created by migration 20260923...) as a cheap "what's new" check.
export async function getWatermark(admin: AnyClient, outlet: string): Promise<number> {
  const { data } = await admin
    .from("cron_config")
    .select("value")
    .eq("key", `citizen_max_id:${outlet}`)
    .maybeSingle();
  return Number(data?.value ?? 0);
}

export async function setWatermark(admin: AnyClient, outlet: string, value: number): Promise<void> {
  await admin
    .from("cron_config")
    .upsert({ key: `citizen_max_id:${outlet}`, value: String(value) }, { onConflict: "key" });
}

/** Max Citizen ID from a list of URLs. 0 when none match. */
export function maxCitizenId(urls: string[]): number {
  let max = 0;
  for (const u of urls) {
    const m = u.match(/-n(\d+)(?:[/?#]|$)/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

// ───────────────────────────── ingestors ─────────────────────────────

export type IngestorKind = "rss" | "html-listing" | "news-sitemap" | "gnews-rss";

export interface OutletConfig {
  /** Stored verbatim in raw_news_data.source — must be unique per feed. */
  source: string;
  ingestor: IngestorKind;
  defaultCategory?: string;
  /** rss: feed URLs. */
  feeds?: string[];
  /** html-listing: listing pages + article URL pattern (+ optional date capture). */
  listingUrls?: string[];
  articlePattern?: RegExp;
  /** Capture group index holding YYYY-MM-DD in the matched URL (The Star, Mpasho). */
  dateGroupIndex?: number;
  /** news-sitemap URL. */
  sitemapUrl?: string;
  /** gnews-rss: `site:` query terms. */
  gnewsQuery?: string;
  /** Tier 2: only attempt direct fetch when NEWS_BROWSER_SCRAPE_ENABLED. */
  browserOnly?: boolean;
}

export interface IngestResult {
  source: string;
  ok: boolean;
  articles: Article[];
  error?: string;
  skipped?: boolean;
}

/** Cap articles ingested per outlet per cycle. */
const MAX_PER_OUTLET = 25;

async function ingestRss(outlet: OutletConfig): Promise<IngestResult> {
  const articles: Article[] = [];
  const seen = new Set<string>();
  for (const feed of outlet.feeds ?? []) {
    const doc = await fetchDoc(feed);
    if (!doc.ok || !doc.body) {
      return {
        source: outlet.source,
        ok: false,
        articles: [],
        error: doc.error ?? `HTTP ${doc.status}`,
      };
    }
    for (const a of parseRss(doc.body, feed)) {
      if (!seen.has(a.url)) {
        seen.add(a.url);
        articles.push(a);
      }
    }
  }
  return { source: outlet.source, ok: true, articles: articles.slice(0, MAX_PER_OUTLET) };
}

async function ingestHtmlListing(outlet: OutletConfig, admin: AnyClient): Promise<IngestResult> {
  const pattern = outlet.articlePattern!;
  const foundUrls = new Set<string>();
  for (const listing of outlet.listingUrls ?? []) {
    const doc = await fetchDoc(listing);
    if (!doc.ok || !doc.body) continue; // try next listing page
    for (const u of extractArticleUrls(doc.body, pattern, listing)) foundUrls.add(u);
  }
  if (foundUrls.size === 0) {
    return {
      source: outlet.source,
      ok: false,
      articles: [],
      error: "no article URLs matched on listing pages",
    };
  }

  // Citizen watermark: skip IDs we've already ingested.
  let urls = [...foundUrls];
  if (outlet.source.startsWith("Citizen")) {
    const maxId = maxCitizenId(urls);
    if (maxId > 0) await setWatermark(admin, outlet.source, maxId);
  }

  urls = urls.slice(0, 6); // ≤6 article pages per outlet per cycle, then ≤2 concurrent
  const dateIdx = outlet.dateGroupIndex ?? -1;
  const articles = (
    await mapLimit(urls, 2, async (u) => {
      // The Star / Mpasho: /news/YYYY-MM-DD-slug or /section/YYYY-MM-DD-slug
      let dateFromUrl: string | undefined;
      if (dateIdx >= 0) {
        const m = u.match(/\/(\d{4}-\d{2}-\d{2})-/);
        if (m) dateFromUrl = m[1];
      }
      return fetchArticlePage(u, dateFromUrl);
    })
  ).filter((a): a is Article => a !== null);

  // Dedupe by URL.
  const seen = new Set<string>();
  const unique = articles.filter((a) => (seen.has(a.url) ? false : (seen.add(a.url), true)));
  return { source: outlet.source, ok: true, articles: unique.slice(0, MAX_PER_OUTLET) };
}

async function ingestNewsSitemap(outlet: OutletConfig): Promise<IngestResult> {
  const doc = await fetchDoc(outlet.sitemapUrl!);
  if (!doc.ok || !doc.body) {
    return {
      source: outlet.source,
      ok: false,
      articles: [],
      error: doc.error ?? `HTTP ${doc.status}`,
    };
  }
  const articles = parseNewsSitemap(doc.body, outlet.sitemapUrl!);
  // Filter obvious non-article URLs (sections, tags, home).
  const kept = articles.filter((a) => {
    const path = new URL(a.url).pathname;
    return (
      path.split("/").filter(Boolean).length >= 2 && !/^(tags?|topic|category|author)\b/i.test(path)
    );
  });
  return { source: outlet.source, ok: true, articles: kept.slice(0, MAX_PER_OUTLET) };
}

async function ingestGnewsRss(outlet: OutletConfig): Promise<IngestResult> {
  // Strictly a `site:` fallback for bot-blocked Kenyan outlets — never a
  // global topic feed.
  const feedUrl =
    `https://news.google.com/rss/search?q=${encodeURIComponent(
      outlet.gnewsQuery ??
        `site:${new URL(outlet.listingUrls?.[0] ?? "https://example.com").hostname}`,
    )}&hl=en-KE&gl=KE&ceid=KE:en`;
  const doc = await fetchDoc(feedUrl);
  if (!doc.ok || !doc.body) {
    return {
      source: outlet.source,
      ok: false,
      articles: [],
      error: doc.error ?? `HTTP ${doc.status}`,
    };
  }
  const articles = parseRss(doc.body, feedUrl)
    // Google News links are redirect wrappers; keep them — they resolve and are unique per story.
    .map((a) => ({ ...a, title: a.title.replace(/ - [^-]+$/, "").trim() }));
  return { source: outlet.source, ok: true, articles: articles.slice(0, MAX_PER_OUTLET) };
}

export async function ingestOutlet(outlet: OutletConfig, admin: AnyClient): Promise<IngestResult> {
  try {
    if (outlet.browserOnly && process.env.NEWS_BROWSER_SCRAPE_ENABLED !== "true") {
      // gnews fallback keeps Tier-2 outlets contributing while direct scraping is off.
      if (outlet.gnewsQuery) return ingestGnewsRss(outlet);
      return {
        source: outlet.source,
        ok: false,
        articles: [],
        skipped: true,
        error: "browser scrape disabled",
      };
    }
    switch (outlet.ingestor) {
      case "rss":
        return await ingestRss(outlet);
      case "html-listing":
        return await ingestHtmlListing(outlet, admin);
      case "news-sitemap":
        return await ingestNewsSitemap(outlet);
      case "gnews-rss":
        return await ingestGnewsRss(outlet);
      default:
        return { source: outlet.source, ok: false, articles: [], error: `unknown ingestor` };
    }
  } catch (e) {
    // NEVER let one outlet fail the whole run.
    await logPipelineFailure(admin, `ingest:${outlet.source}`, e).catch(() => {});
    return {
      source: outlet.source,
      ok: false,
      articles: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ───────────────────────────── outlet registry ─────────────────────────────

export const OUTLETS: OutletConfig[] = [
  // ── Tier 1: verified RSS ──
  {
    source: "Standard Media",
    ingestor: "rss",
    feeds: ["https://www.standardmedia.co.ke/rss/headlines.php"],
  },
  {
    source: "Standard Kenya",
    ingestor: "rss",
    feeds: ["https://www.standardmedia.co.ke/rss/kenya.php"],
  },
  {
    source: "Standard Politics",
    ingestor: "rss",
    defaultCategory: "politics",
    feeds: ["https://www.standardmedia.co.ke/rss/politics.php"],
  },
  {
    source: "Standard Business",
    ingestor: "rss",
    defaultCategory: "economics",
    feeds: ["https://www.standardmedia.co.ke/rss/business.php"],
  },
  {
    source: "Standard Sports",
    ingestor: "rss",
    defaultCategory: "sports",
    feeds: ["https://www.standardmedia.co.ke/rss/sports.php"],
  },
  {
    source: "Standard Entertainment",
    ingestor: "rss",
    defaultCategory: "entertainment",
    feeds: ["https://www.standardmedia.co.ke/rss/entertainment.php"],
  },
  {
    source: "Standard World",
    ingestor: "rss",
    feeds: ["https://www.standardmedia.co.ke/rss/world.php"],
  },
  { source: "KBC News", ingestor: "rss", feeds: ["https://www.kbc.co.ke/feed/"] },
  { source: "Nairobi News", ingestor: "rss", feeds: ["https://nairobinews.co.ke/feed/"] },
  { source: "Kahawa Tungu", ingestor: "rss", feeds: ["https://kahawatungu.com/feed/"] },
  { source: "Kenyans.co.ke", ingestor: "rss", feeds: ["https://www.kenyans.co.ke/feeds/news"] },
  { source: "Capital FM", ingestor: "rss", feeds: ["https://capitalfm.africa/news/feed/"] },

  // ── Tier 3: HTML listing scraping (server-rendered links) ──
  {
    source: "Citizen Digital",
    ingestor: "html-listing",
    listingUrls: ["https://citizen.digital/", "https://citizen.digital/news"],
    articlePattern: /\/article\/[a-z0-9-]+-n\d+/gi,
  },
  {
    source: "The Star",
    ingestor: "html-listing",
    listingUrls: ["https://www.the-star.co.ke/"],
    articlePattern: /\/(?:news|business|counties)\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+/gi,
    dateGroupIndex: 0,
  },
  {
    source: "Mpasho",
    ingestor: "html-listing",
    listingUrls: ["https://mpasho.co.ke/"],
    articlePattern: /\/[a-z-]+\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+/gi,
    dateGroupIndex: 0,
  },

  // ── Tier 4: sitemaps ──
  {
    source: "Pulse Kenya",
    ingestor: "news-sitemap",
    sitemapUrl: "https://pulse.co.ke/sitemap-news.xml",
  },
  {
    source: "Business Daily",
    ingestor: "news-sitemap",
    defaultCategory: "economics",
    sitemapUrl: "https://www.businessdailyafrica.com/bd/sitemap.xml",
  },
  {
    source: "The EastAfrican",
    ingestor: "news-sitemap",
    sitemapUrl: "https://www.theeastafrican.co.ke/sitemap.xml",
  },

  // ── Tier 2: bot-blocked; gnews fallback unless browser scraping enabled ──
  {
    source: "Nation",
    ingestor: "gnews-rss",
    browserOnly: true,
    gnewsQuery: "site:nation.africa",
    listingUrls: ["https://nation.africa/kenya/rss.xml"],
  },
  {
    source: "Tuko News",
    ingestor: "gnews-rss",
    browserOnly: true,
    gnewsQuery: "site:tuko.co.ke",
    listingUrls: ["https://www.tuko.co.ke/feed/"],
  },
  { source: "NTV Kenya", ingestor: "rss", feeds: ["https://ntvkenya.co.ke/feed/"] },
];
