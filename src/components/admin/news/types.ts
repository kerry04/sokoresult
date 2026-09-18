export interface SourceHealth {
  source: string;
  last_fetch_at: string | null;
  last_success_at: string | null;
  articles_24h: number;
  consecutive_failures: number;
  last_error: string | null;
  status: "active" | "stale" | "down";
  updated_at: string;
}

export interface TrendingKeyword {
  keyword: string;
  mentions_1h: number;
  mentions_prev_1h: number;
  growth: number;
  avg_sentiment: number;
  velocity: number;
  lifecycle: "emerging" | "rising" | "peaking" | "declining" | string;
  confidence: number;
  trend_score: number;
  social_mentions_6h: number;
  category: string | null;
  sample_article_ids: string[] | null;
  updated_at: string;
}

export interface SocialPost {
  id: string;
  keyword: string;
  platform: string;
  text: string;
  author: string | null;
  post_url: string;
  posted_at: string;
  engagement: number;
  sentiment: number | null;
}

export interface MarketSuggestion {
  id: string;
  topic: string;
  suggested_question: string;
  suggested_yes_price: number;
  suggested_category: string;
  suggested_close_at: string | null;
  ai_reasoning: string | null;
  confidence: number;
  status: string;
  auto_generated: boolean;
  trend_score: number;
  news_count: number;
  created_at: string;
  used_market_id: string | null;
  // Quant fields (nullable for legacy rows)
  initial_probability: number | null;
  edge_score: number;
  horizon: "short" | "medium" | "long" | null;
  event_type: string | null;
  key_entities: string[] | null;
  cluster_key: string | null;
  resolution_criteria: string | null;
}

export interface NewsArticleRow {
  id: string;
  title: string;
  body: string | null;
  source: string;
  url: string;
  category: string | null;
  sentiment_score: number | null;
  published_at: string;
  processed: boolean;
  topics: string[] | null;
  relevant_keywords: string[] | null;
  entities: unknown;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}
