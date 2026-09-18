// Apify "Tweet Scraper V2" client.
// Actor: apidojo/tweet-scraper
// We use the run-sync-get-dataset-items endpoint so we get tweets back in one
// HTTP call, no polling. Each call costs ~1 actor-second + per-tweet usage on
// the free tier (≈ 5K tweets/mo free).

export interface ApifyTweet {
  text: string;
  author: string | null; // "@handle"
  url: string;
  postedAt: string; // ISO
  likes: number;
  retweets: number;
  replies: number;
}

interface RawApifyItem {
  id?: string;
  url?: string;
  text?: string;
  fullText?: string;
  createdAt?: string;
  author?: { userName?: string; screenName?: string };
  user?: { userName?: string; screenName?: string };
  likeCount?: number;
  favoriteCount?: number;
  retweetCount?: number;
  replyCount?: number;
}

const ENDPOINT =
  "https://api.apify.com/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items";

export async function fetchApifyTweets(
  keyword: string,
  maxItems: number,
  signal: AbortSignal,
): Promise<ApifyTweet[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return [];

  const input = {
    searchTerms: [keyword],
    maxItems,
    sort: "Latest",
    tweetLanguage: "en",
  };

  const res = await fetch(`${ENDPOINT}?token=${encodeURIComponent(token)}`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(`Apify HTTP ${res.status}`);
  }

  const data = (await res.json()) as RawApifyItem[];
  const out: ApifyTweet[] = [];
  for (const t of data ?? []) {
    const text = (t.fullText ?? t.text ?? "").trim();
    if (!text) continue;
    const handle =
      t.author?.userName ?? t.author?.screenName ?? t.user?.userName ?? t.user?.screenName ?? null;
    out.push({
      text: text.slice(0, 500),
      author: handle ? `@${handle.replace(/^@/, "")}` : null,
      url: t.url ?? "",
      postedAt: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
      likes: t.likeCount ?? t.favoriteCount ?? 0,
      retweets: t.retweetCount ?? 0,
      replies: t.replyCount ?? 0,
    });
  }
  return out;
}

export function apifyEnabled(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN);
}
