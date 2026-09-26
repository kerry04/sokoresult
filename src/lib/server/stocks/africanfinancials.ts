// Parser for africanfinancials.com EOD price-list tables (NSE/NGX/GSE).
// The site's WAF blocks datacenter IPs (Vercel, Supabase), so a VM cron
// fetches the pages with curl and POSTs the raw HTML to the ingest-boards
// hook, which parses here and upserts into public.stock_boards.

export interface AFRow {
  ticker: string; // e.g. SCOM.NSE
  name: string;
  price: number;
  changePercent: number | null;
  volume: number | null;
  value: number | null;
  ytdPercent: number | null;
  sector: string | null;
  updated: string | null; // "Sep 25, 2026"
}

const FEEDS: Record<string, { prefix: string; suffix: string }> = {
  NSE: { prefix: "ke-", suffix: ".NSE" },
  NGX: { prefix: "ng-", suffix: ".NGX" },
  GSE: { prefix: "gh-", suffix: ".GSE" },
};

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/,/g, "").replace(/[+%]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function int(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseInt(s.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function parseAFTable(html: string, exchangeCode: string): AFRow[] {
  const feed = FEEDS[exchangeCode];
  if (!feed) return [];
  const out: AFRow[] = [];
  const trs = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  for (const m of trs) {
    const row = m[1];
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
      stripTags(c[1]),
    );
    // Columns: Company | Price | % Change | Value | Volume | YTD % | Sector | Updated
    if (cells.length < 5) continue;
    const price = num(cells[1]);
    if (price === null) continue;

    // Ticker: title="(SCOM.ke)" on the company link, or the /company/ke-scom/ slug.
    let ticker: string | null = null;
    const titleMatch = row.match(/title="[^"]*\(([A-Za-z0-9]+)\.[a-z]{2}\)/);
    if (titleMatch) ticker = titleMatch[1].toUpperCase() + feed.suffix;
    if (!ticker) {
      const slugMatch = row.match(
        new RegExp(`/company/${feed.prefix.replace("-", "\\-")}([a-z0-9]+)/`),
      );
      if (slugMatch) ticker = slugMatch[1].toUpperCase() + feed.suffix;
    }
    if (!ticker) continue;

    out.push({
      ticker,
      name: cells[0],
      price,
      changePercent: num(cells[2]),
      value: int(cells[3]),
      volume: int(cells[4]),
      ytdPercent: num(cells[5]),
      sector: cells[6] || null,
      updated: cells[7] || null,
    });
  }
  return out;
}
