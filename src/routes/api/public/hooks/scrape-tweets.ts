import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/server/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { fetchApifyTweets, apifyEnabled } from "@/lib/server/apify-twitter";
import { scoreSentiment } from "@/lib/server/vader";

// Public Nitter mirrors. They go down often, so we try several until one works.
// Nitter exposes search RSS at: /search/rss?f=tweets&q=<keyword>
const NITTER_MIRRORS = [
  "https://nitter.net",
  "https://nitter.privacydev.net",
  "https://nitter.poast.org",
  "https://nitter.tiekoetter.com",
  "https://nitter.space",
];

interface Tweet {
  keyword: string;
  text: string;
  author: string | null;
  post_url: string;
  posted_at: string;
  engagement: number;
  sentiment: number;
  platform: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).trim();
}

function pick(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return null;
  const inner = m[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1] : inner;
}

function parseRss(xml: string, keyword: string): Tweet[] {
  const items = xml.split(/<item\b/i).slice(1);
  const out: Tweet[] = [];
  for (const chunk of items) {
    const item = "<item" + chunk.split(/<\/item>/i)[0] + "</item>";
    const link = pick(item, "link");
    const desc = pick(item, "description");
    const pub = pick(item, "pubDate");
    const creator = pick(item, "dc:creator") ?? pick(item, "author");
    if (!link || !desc) continue;
    const text = stripHtml(desc).slice(0, 500);
    if (!text) continue;
    out.push({
      keyword,
      text,
      author: creator ? creator.replace(/^@?/, "@") : null,
      post_url: link.replace(/https?:\/\/[^/]+\//, "https://twitter.com/"),
      posted_at: pub ? new Date(pub).toISOString() : new Date().toISOString(),
      engagement: 0,
      sentiment: scoreSentiment(text),
      platform: "twitter",
    });
  }
  return out;
}

async function fetchNitterRss(keyword: string, signal: AbortSignal): Promise<Tweet[]> {
  const q = encodeURIComponent(keyword);
  for (const base of NITTER_MIRRORS) {
    try {
      const res = await fetch(`${base}/search/rss?f=tweets&q=${q}`, {
        signal,
        headers: { "User-Agent": "Mozilla/5.0 SokoResultBot/1.0" },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml.includes("<item")) continue;
      const tweets = parseRss(xml, keyword);
      if (tweets.length > 0) return tweets;
    } catch {
      // try next mirror
    }
  }
  return [];
}

async function fetchApifyForKeyword(
  keyword: string,
  signal: AbortSignal,
  maxItems = 20,
): Promise<Tweet[]> {
  const raw = await fetchApifyTweets(keyword, maxItems, signal);
  return raw
    .filter((t) => t.url)
    .map((t) => ({
      keyword,
      text: t.text,
      author: t.author,
      post_url: t.url,
      posted_at: t.postedAt,
      engagement: t.likes + t.retweets + t.replies,
      sentiment: scoreSentiment(t.text),
      platform: "twitter",
    }));
}

async function logHealth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  source: string,
  ok: boolean,
  inserted: number,
  err?: string,
) {
  const now = new Date().toISOString();
  const patch = {
    source,
    last_fetch_at: now,
    last_success_at: ok ? now : undefined,
    articles_24h: inserted,
    consecutive_failures: ok ? 0 : undefined,
    last_error: ok ? null : (err ?? "unknown"),
    status: ok ? "active" : "down",
    updated_at: now,
  };
  await admin.from("source_health").upsert(patch, { onConflict: "source" });
}

export const Route = createFileRoute("/api/public/hooks/scrape-tweets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        try {
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // Pull top trending keywords; if none yet (empty trends), fall back to
        // top distinct keywords from recent articles so we still get tweets.
        const { data: trends } = await admin
          .from("trending_keywords")
          .select("keyword, trend_score")
          .order("trend_score", { ascending: false })
          .limit(15);

        let keywords = (trends ?? []).map((t) => t.keyword).filter((k) => k.length >= 3);

        if (keywords.length === 0) {
          // Fallback: pull recent articles' keywords directly
          const since = new Date(Date.now() - 24 * 3600_000).toISOString();
          const { data: rows } = await admin
            .from("raw_news_data")
            .select("relevant_keywords")
            .eq("processed", true)
            .gte("published_at", since)
            .limit(500);
          const counts = new Map<string, number>();
          for (const r of rows ?? []) {
            for (const k of (r.relevant_keywords ?? []) as string[]) {
              const lk = k.toLowerCase();
              if (lk.length < 3) continue;
              counts.set(lk, (counts.get(lk) ?? 0) + 1);
            }
          }
          keywords = [...counts.entries()]
            .filter(([, c]) => c >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([k]) => k);
        }

        if (keywords.length === 0) {
          return new Response(
            JSON.stringify({
              ok: true,
              message: "No keywords available yet — wait for analyzer to process more articles.",
              inserted: 0,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 50_000);
        const results: Array<{
          keyword: string;
          source: "nitter" | "apify" | "none";
          found: number;
          inserted: number;
          error?: string;
        }> = [];

        let nitterOK = 0;
        let nitterFail = 0;
        let apifyOK = 0;
        let apifyFail = 0;
        let totalInserted = 0;

        const APIFY_BUDGET = 5; // call Apify for at most top 5 keywords per run
        let apifyCalls = 0;
        const apifyOn = apifyEnabled();

        try {
          for (let i = 0; i < Math.min(10, keywords.length); i++) {
            const keyword = keywords[i];
            let tweets: Tweet[] = [];
            let usedSource: "nitter" | "apify" | "none" = "none";
            let lastErr: string | undefined;

            // 1) Try Nitter first
            try {
              tweets = await fetchNitterRss(keyword, controller.signal);
              if (tweets.length > 0) {
                usedSource = "nitter";
                nitterOK++;
              } else {
                nitterFail++;
              }
            } catch (e) {
              nitterFail++;
              lastErr = e instanceof Error ? e.message : String(e);
            }

            // 2) Fallback to Apify (top keywords only, budget capped)
            if (tweets.length === 0 && apifyOn && apifyCalls < APIFY_BUDGET) {
              try {
                apifyCalls++;
                tweets = await fetchApifyForKeyword(keyword, controller.signal, 20);
                if (tweets.length > 0) {
                  usedSource = "apify";
                  apifyOK++;
                } else {
                  apifyFail++;
                }
              } catch (e) {
                apifyFail++;
                lastErr = e instanceof Error ? e.message : String(e);
              }
            }

            if (tweets.length === 0) {
              results.push({ keyword, source: "none", found: 0, inserted: 0, error: lastErr });
              continue;
            }

            const slice = tweets.slice(0, 20);
            const { error: insErr, count } = await admin
              .from("social_posts")
              .upsert(slice, { onConflict: "post_url", count: "exact", ignoreDuplicates: true });

            if (insErr) {
              results.push({
                keyword,
                source: usedSource,
                found: slice.length,
                inserted: 0,
                error: insErr.message,
              });
              continue;
            }
            const inserted = count ?? 0;
            totalInserted += inserted;
            results.push({ keyword, source: usedSource, found: slice.length, inserted });
          }
        } finally {
          clearTimeout(timeout);
        }

        // Source health logging — one row per source
        await Promise.all([
          logHealth(
            admin,
            "twitter_nitter",
            nitterOK > 0,
            results.filter((r) => r.source === "nitter").reduce((a, b) => a + b.inserted, 0),
            nitterOK === 0 ? `All Nitter mirrors failed for ${nitterFail} keywords` : undefined,
          ),
          apifyOn
            ? logHealth(
                admin,
                "twitter_apify",
                apifyOK > 0,
                results.filter((r) => r.source === "apify").reduce((a, b) => a + b.inserted, 0),
                apifyOK === 0 && apifyCalls > 0 ? `Apify returned 0 for ${apifyFail} keywords` : undefined,
              )
            : Promise.resolve(),
        ]);

        return new Response(
          JSON.stringify(
            {
              ok: true,
              apify_enabled: apifyOn,
              keywordsTried: Math.min(10, keywords.length),
              totalInserted,
              nitterOK,
              apifyOK,
              apifyCalls,
              results,
            },
            null,
            2,
          ),
          { headers: { "Content-Type": "application/json" } },
        );
        } catch (e) {
          // Social pipeline must NEVER break the news loop. Always 200.
          const message = e instanceof Error ? e.message : String(e);
          return new Response(
            JSON.stringify({ ok: true, skipped: true, reason: message }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
