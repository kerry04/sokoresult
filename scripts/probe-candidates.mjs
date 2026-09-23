// Candidates to replace the 7 dead feeds.
const CANDIDATES = [
  ["Citizen Digital (www path)", "https://www.citizen.digital/rss"],
  ["Citizen (ki/citizen path)", "https://citizen.digital/ki/feed"],
  ["The Star Kenya", "https://www.the-star.co.ke/rss/feed_1.xml"],
  ["The Star (rss/)", "https://www.the-star.co.ke/rss/"],
  ["People Daily", "https://www.pd.co.ke/rss/"],
  ["K24 TV", "https://www.k24tv.co.ke/feed/"],
  ["Mpasho News", "https://mpasho.co.ke/feed/"],
  ["Daily Active (tech)", "https://www.dnight.co.ke/feed/"],
  ["Techpoint Africa", "https://techpoint.africa/feed/"],
  ["TechCabal", "https://techcabal.com/feed/"],
  ["Premium Times", "https://www.premiumtimesng.com/feed"],
  ["Punch Nigeria", "https://punchng.com/feed/"],
  ["Daily Monitor Uganda", "https://www.monitor.co.ug/uganda/rss.xml"],
  ["The Eastleigh Voice", "https://eastleighvoice.co.ke/feed"],
  ["Mt Kenya Times", "https://www.mtkenyatimes.co.ke/feed/"],
  ["Kenya News Agency", "https://kenyanews.go.ke/feed/"],
  ["ZNBC Zambia", "https://www.znbc.co.zm/feed/"],
  ["Vanguard Nigeria", "https://www.vanguardngr.com/feed/"],
  ["The Herald Zimbabwe", "https://www.herald.co.zw/feed/"],
  [" Nation Sports", "https://nation.africa/kenya/sports/rss.xml"],
  ["Nation Politics", "https://nation.africa/kenya/politics/rss.xml"],
  ["Tuko (news path)", "https://www.tuko.co.ke/rss/news.rss"],
  ["Nairobi Gazette", "https://nairobiwire.com/category/news/feed"],
  ["CIO Africa", "https://www.cio.com/africa/feed/"],
  ["African Arguments", "https://africanarguments.org/feed/"],
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
      return { source, ok: false, why: items === 0 ? "no items (HTML?)" : "not RSS", ms };
    return { source, ok: true, items, ms };
  } catch (e) {
    return { source, ok: false, why: String(e.message || e).slice(0, 60), ms: Date.now() - t0 };
  }
}

const results = await Promise.all(CANDIDATES.map(probe));
const good = results.filter((r) => r.ok);
console.log(`=== HEALTHY (${good.length}/${results.length}) ===`);
good.sort((a, b) => b.items - a.items).forEach((r) => console.log(`  ✔ ${r.source.padEnd(28)} ${String(r.items).padStart(3)} items  ${r.ms}ms  `));
console.log(`=== BROKEN ===`);
results.filter((r) => !r.ok).forEach((r) => console.log(`  ✘ ${r.source.padEnd(28)} ${r.why}`));
