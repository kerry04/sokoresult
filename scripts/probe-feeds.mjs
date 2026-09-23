// Live probe of every feed in scrape-news.ts — reports status, items, latency.
const FEEDS = [
  ["Standard Media", "https://www.standardmedia.co.ke/rss/headlines.php"],
  ["Standard Politics", "https://www.standardmedia.co.ke/rss/politics.php"],
  ["Standard Sports", "https://www.standardmedia.co.ke/rss/sports.php"],
  ["Standard Business", "https://www.standardmedia.co.ke/rss/business.php"],
  ["Standard Entertainment", "https://www.standardmedia.co.ke/rss/entertainment.php"],
  ["Nation Africa", "https://nation.africa/kenya/rss.xml"],
  ["Business Daily", "https://www.businessdailyafrica.com/bd/rss.xml"],
  ["Citizen Digital", "https://citizen.digital/feed"],
  ["Tuko News", "https://www.tuko.co.ke/rss/all.rss"],
  ["Kenyans.co.ke", "https://www.kenyans.co.ke/feeds/news"],
  ["Pulse Live Kenya", "https://www.pulse.co.ke/rss"],
  ["Nairobi Wire", "https://nairobiwire.com/feed"],
  ["Viral Tea", "https://viraltea.co.ke/feed/"],
  ["AllAfrica Kenya", "https://allafrica.com/tools/headlines/rdf/kenya/headlines.rdf"],
  ["Ghafla", "https://www.ghafla.com/ke/feed/"],
  ["Capital FM", "https://www.capitalfm.co.ke/news/feed/"],
  ["Capital Business", "https://www.capitalfm.co.ke/business/feed/"],
  ["Capital Sports", "https://www.capitalfm.co.ke/sports/feed/"],
  ["Kahawa Tungu", "https://kahawatungu.com/feed/"],
  ["BBC Africa", "https://feeds.bbci.co.uk/news/world/africa/rss.xml"],
];

async function probe([source, url]) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SokoResultBot/1.0; +https://sokoresult.com)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    const ms = Date.now() - t0;
    if (!res.ok) return { source, ok: false, why: `HTTP ${res.status}`, ms };
    const xml = await res.text();
    const items = (xml.match(/<item[\s>]/gi) || []).length + (xml.match(/<entry[\s>]/gi) || []).length;
    const looksXml = /<(rss|feed|rdf)[\s>]/i.test(xml.slice(0, 500));
    if (items === 0 || !looksXml)
      return { source, ok: false, why: items === 0 ? "no <item>/<entry> (probably HTML error page)" : "not an RSS doc", ms };
    return { source, ok: true, items, ms };
  } catch (e) {
    return { source, ok: false, why: String(e.message || e).slice(0, 80), ms: Date.now() - t0 };
  }
}

const results = await Promise.all(FEEDS.map(probe));
const good = results.filter((r) => r.ok);
const bad = results.filter((r) => !r.ok);
console.log(`=== HEALTHY (${good.length}/${results.length}) ===`);
good.sort((a, b) => b.items - a.items).forEach((r) => console.log(`  ✔ ${r.source.padEnd(24)} ${String(r.items).padStart(3)} items  ${r.ms}ms`));
console.log(`=== BROKEN (${bad.length}) ===`);
bad.forEach((r) => console.log(`  ✘ ${r.source.padEnd(24)} ${r.why}  ${r.ms}ms`));
