/**
 * Demo-mode local database — an in-memory store persisted to data/local-db.json.
 * Zero native dependencies, human-inspectable, seeded with random markets,
 * bot traders, price history, and a news tape on first boot.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { executeLmsrTrade, lmsrPrices } from "./lmsr";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "local-db.json");

export interface DemoDB {
  tables: Record<string, any[]>;
  meta: { seeded_at: string; version: number; secret: string; ph_id: number };
}

let _db: DemoDB | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Small deterministic-ish PRNG so seeds are varied but stable per boot file. */
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dbGet(table: string): any[] {
  const tables = _db?.tables;
  if (!tables) return [];
  return (tables[table] ??= []);
}

export function dbPut(table: string, rows: any[]) {
  if (!_db) return;
  _db.tables[table] = rows;
  scheduleSave();
}

export function scheduleSave() {
  if (!_db || _saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    saveNow();
  }, 250);
}

export function saveNow() {
  if (!_db) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(_db));
  } catch (e) {
    console.error("[demo-store] save failed", e);
  }
}

export async function ensureStore(): Promise<DemoDB> {
  if (_db) return _db;
  try {
    if (fs.existsSync(DATA_FILE)) {
      _db = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as DemoDB;
      return _db;
    }
  } catch (e) {
    console.error("[demo-store] failed to read data file, reseeding", e);
  }
  _db = { tables: {}, meta: { seeded_at: "", version: 1, secret: randomUUID() + randomUUID(), ph_id: 0 } };
  seed();
  _db.meta.seeded_at = new Date().toISOString();
  saveNow();
  console.log("[demo-store] seeded fresh demo data →", DATA_FILE);
  return _db;
}

// ───────────────────────────────────── seeding ──────────────────────────────

interface MarketSpec {
  question: string;
  category: string;
  market_type: "binary" | "multi";
  initialProb?: number;
  probs?: number[];
  days: number;
  keywords: string[];
  description: string;
}

const MARKET_SPECS: MarketSpec[] = [
  { question: "Will William Ruto win the 2027 Kenyan presidential election?", category: "politics", market_type: "binary", initialProb: 0.38, days: 320, keywords: ["ruto", "election", "presidency"], description: "Resolves YES if William Ruto is declared winner of the August 2027 presidential election per IEBC." },
  { question: "Will Raila Odinga endorse Ruto before August 2027?", category: "politics", market_type: "binary", initialProb: 0.22, days: 300, keywords: ["raila", "ruto", "endorsement"], description: "Resolves YES on a public, verified endorsement by Raila Odinga of Ruto's 2027 candidature." },
  { question: "Who will be the ODM presidential candidate for 2027?", category: "politics", market_type: "multi", probs: [0.34, 0.22, 0.19, 0.14, 0.11], days: 280, keywords: ["odm", "raila", "candidate"], description: "Resolves to the candidate formally nominated by ODM for the 2027 presidential race." },
  { question: "Will the Finance Bill 2027 pass parliament by June 2027?", category: "politics", market_type: "binary", initialProb: 0.55, days: 260, keywords: ["finance bill", "parliament", "taxes"], description: "Resolves YES if the Finance Bill receives presidential assent by 30 June 2027." },
  { question: "Will Kenya hold a constitutional referendum before 2028?", category: "politics", market_type: "binary", initialProb: 0.16, days: 480, keywords: ["referendum", "constitution"], description: "Resolves YES if a national referendum is officially held before 1 Jan 2028." },
  { question: "Will Harambee Stars qualify for AFCON 2027?", category: "sports", market_type: "binary", initialProb: 0.62, days: 200, keywords: ["harambee stars", "afcon", "football"], description: "Resolves YES if Kenya's national football team qualifies for the 2027 AFCON tournament." },
  { question: "Who will win the 2026/27 English Premier League?", category: "sports", market_type: "multi", probs: [0.30, 0.27, 0.24, 0.11, 0.08], days: 260, keywords: ["epl", "premier league", "football"], description: "Resolves to the club lifting the Premier League trophy at the end of the 2026/27 season." },
  { question: "Will Gor Mahia win the Kenyan Premier League this season?", category: "sports", market_type: "binary", initialProb: 0.48, days: 150, keywords: ["gor mahia", "kpl", "football"], description: "Resolves YES if Gor Mahia finish top of the Kenyan Premier League table." },
  { question: "Will Kenya win more than 5 golds at the Commonwealth Games?", category: "sports", market_type: "binary", initialProb: 0.35, days: 180, keywords: ["commonwealth", "athletics", "kenya"], description: "Resolves YES if Kenyan athletes win 6+ gold medals at the next Commonwealth Games." },
  { question: "Will Kenya reach the 2027 Rugby World Cup?", category: "sports", market_type: "binary", initialProb: 0.28, days: 300, keywords: ["rugby", "simbas", "world cup"], description: "Resolves YES if Kenya Simbas qualify for the 2027 Rugby World Cup." },
  { question: "Will a Kenyan film win an Oscar by 2029?", category: "entertainment", market_type: "binary", initialProb: 0.09, days: 500, keywords: ["oscar", "film", "nollywood"], description: "Resolves YES if a Kenyan production wins any Academy Award category." },
  { question: "Will Burna Boy headline a Nairobi stadium show in 2026?", category: "entertainment", market_type: "binary", initialProb: 0.44, days: 100, keywords: ["burna boy", "concert", "nairobi"], description: "Resolves YES if Burna Boy performs a headline stadium concert in Nairobi in 2026." },
  { question: "Who wins Big Brother Africa 2026?", category: "entertainment", market_type: "multi", probs: [0.28, 0.26, 0.24, 0.22], days: 90, keywords: ["big brother", "reality tv", "bba"], description: "Resolves to the housemate announced as winner at the finale." },
  { question: "Will Kenyan afrobeats hit 1B Spotify streams in 2026?", category: "entertainment", market_type: "binary", initialProb: 0.31, days: 110, keywords: ["afrobeats", "spotify", "music"], description: "Resolves YES on aggregated 2026 Kenyan afrobeats stream counts exceeding one billion." },
  { question: "Will KES/USD stay below 125 through March 2027?", category: "economics", market_type: "binary", initialProb: 0.58, days: 190, keywords: ["shilling", "kes", "forex"], description: "Resolves YES if the CBK daily rate never prints above KES 125/USD before 31 Mar 2027." },
  { question: "Will CBK cut the benchmark rate at its next meeting?", category: "economics", market_type: "binary", initialProb: 0.41, days: 45, keywords: ["cbk", "interest rates", "monetary policy"], description: "Resolves YES if the Central Bank of Kenya MPC lowers the CBR at its next announced meeting." },
  { question: "Will Kenya's 2026 GDP growth exceed 5.5%?", category: "economics", market_type: "binary", initialProb: 0.47, days: 380, keywords: ["gdp", "economy", "knbs"], description: "Resolves YES if KNBS reports 2026 annual real GDP growth above 5.5%." },
  { question: "Will fuel prices drop below KSh 175/litre in Nairobi before January?", category: "economics", market_type: "binary", initialProb: 0.33, days: 100, keywords: ["fuel", "epra", "petrol"], description: "Resolves YES if EPRA's monthly review prices super petrol below KSh 175/litre in Nairobi." },
];

const BOT_NAMES = [
  "Amina W.", "Kip C.", "Zawadi N.", "Brian O.", "Njeri M.", "Tunde A.", "Fatuma S.", "Jomo K.", "Wanjiru P.", "Otieno D.",
];

const NEWS_TEMPLATES: Array<{ source: string; title: string; kw: string[]; cat: string; body: string }> = [
  { source: "Daily Nation", title: "IEBC clears voter registration drive ahead of 2027 polls", kw: ["ruto", "election", "presidency"], cat: "politics", body: "The electoral commission has kicked off a nationwide registration blitz, with analysts predicting record youth turnout." },
  { source: "The Standard", title: "Ruto rallies Mt Kenya bloc as 2027 arithmetic shifts", kw: ["ruto", "election", "endorsement"], cat: "politics", body: "The President held a series of consultative meetings in Nyeri and Meru over the weekend." },
  { source: "Citizen Digital", title: "Raila, Ruto to share stage at Nairobi forum — coalition talk intensifies", kw: ["raila", "endorsement", "odm"], cat: "politics", body: "Both leaders are scheduled to address the East African trade summit, fuelling speculation of a working pact." },
  { source: "Business Daily", title: "Parliament committee flags revenue shortfall in Finance Bill draft", kw: ["finance bill", "parliament", "taxes"], cat: "economics", body: "The budget committee warned the draft falls short of the deficit target by KSh 42 billion." },
  { source: "People Daily", title: "ODM grassroots elections land in Kisumu amid succession heat", kw: ["odm", "candidate", "raila"], cat: "politics", body: "Party officials moved to calm fears of a split as delegate conferences opened in the lake region." },
  { source: "Mozzart Sport Kenya", title: "Harambee Stars coach names 26-man squad for AFCON qualifiers", kw: ["harambee stars", "afcon", "football"], cat: "sports", body: "Two European-based midfielders return as Kenya open their qualifying campaign away in Kampala." },
  { source: "Citizen Digital", title: "Arsenal extend lead at the top after dramatic late winner", kw: ["epl", "premier league", "football"], cat: "sports", body: "A stoppage-time header keeps the Gunners two points clear with ten matches to play." },
  { source: "Gor Mahia FC", title: "Gor Mahia unbeaten in nine as title race heats up", kw: ["gor mahia", "kpl", "football"], cat: "sports", body: "K'Ogalo squeezed past relegation-threatened Nzoia 1-0 to keep pace at the summit." },
  { source: "Pulse Kenya", title: "Burna Boy teases 'Nairobi, we're coming' on Instagram Live", kw: ["burna boy", "concert", "nairobi"], cat: "entertainment", body: "The Afrobeats superstar hinted at an East African leg of his world tour during a late-night session." },
  { source: "Tuko", title: "Big Brother Africa housemates face first nomination showdown", kw: ["big brother", "reality tv", "bba"], cat: "entertainment", body: "Four housemates are up for eviction after a tense head-of-house challenge." },
  { source: "Business Daily", title: "Shilling firms to 121.4 against the dollar on diaspora inflows", kw: ["shilling", "kes", "forex"], cat: "economics", body: "CBK data shows the local unit has gained 3.1% quarter-on-quarter, its best run since 2019." },
  { source: "Reuters Africa", title: "Kenya's central bank holds rate, signals data-dependent stance", kw: ["cbk", "interest rates", "monetary policy"], cat: "economics", body: "The MPC kept the benchmark at its current level, with two members dissenting for a cut." },
  { source: "The Standard", title: "EPRA trims fuel prices by 72 cents in latest review", kw: ["fuel", "epra", "petrol"], cat: "economics", body: "Super petrol in Nairobi now retails at KSh 179.30, the third consecutive monthly decline." },
  { source: "KBC", title: "Kenya Simbas book decisive qualifier against Zimbabwe", kw: ["rugby", "simbas", "world cup"], cat: "sports", body: "A 29-18 win over Senegal sets up a winner-takes-all fixture for a World Cup slot." },
];

function seed() {
  const rnd = mulberry(Date.now() & 0x7fffffff);
  const now = Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  _db!.meta.ph_id = 0;

  // ── Demo trader profiles ──
  const profiles: any[] = BOT_NAMES.map((name, i) => ({
    id: randomUUID(),
    display_name: name,
    avatar_url: null,
    kes_balance: Math.round((3_000_000 + rnd() * 12_000_000)),
    oko_balance: Math.round(rnd() * 5000),
    kyc_tier: 1,
    onboarded: true,
    referral_code: `BOT-${1000 + i}`,
    phone: null,
    current_streak: Math.floor(rnd() * 12),
    longest_streak: Math.floor(rnd() * 20) + 5,
    last_trade_date: iso(now - Math.floor(rnd() * 3) * 86_400_000),
    sound_enabled: true,
    country: "KE",
    status: "active",
    flag_reason: null,
    referred_by: null,
    created_at: iso(now - (30 + rnd() * 300) * 86_400_000),
    updated_at: iso(now),
  }));
  dbPut("profiles", profiles);
  dbPut("profiles_public", profiles.map((p) => ({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url })));
  dbPut("user_roles", []);
  dbPut("achievements", [
    { code: "first_trade", title: "First Blood", description: "Placed your first trade", icon: "🎯", tier: "bronze" },
    { code: "volume_10k", title: "Mkubwa", description: "Traded over KES 10,000 in volume", icon: "📈", tier: "silver" },
    { code: "volume_100k", title: "Whale Watch", description: "Traded over KES 100,000 in volume", icon: "🐋", tier: "gold" },
    { code: "streak_3", title: "On a Roll", description: "Traded 3 days in a row", icon: "🔥", tier: "bronze" },
    { code: "streak_7", title: "Unstoppable", description: "Traded 7 days in a row", icon: "⚡", tier: "silver" },
    { code: "politics_pro", title: "Bunge Watcher", description: "Traded 10 politics markets", icon: "🏛️", tier: "silver" },
    { code: "sports_savant", title: "Pitch Insider", description: "Traded 10 sports markets", icon: "⚽", tier: "silver" },
    { code: "profit_1k", title: "In the Green", description: "Realized KES 1,000 in profit", icon: "💰", tier: "gold" },
    { code: "commentator", title: "Voice of the Soko", description: "Posted your first comment", icon: "💬", tier: "bronze" },
    { code: "early_bird", title: "Early Bird", description: "Traded within 24h of signing up", icon: "🌅", tier: "bronze" },
  ]);
  dbPut("user_achievements", []);

  // ── Markets + outcomes ──
  const markets: any[] = [];
  const outcomesAll: any[] = [];
  MARKET_SPECS.forEach((spec, i) => {
    const id = randomUUID();
    const b = spec.market_type === "multi" ? 1000 : 750;
    const slug = spec.question.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
    const m: any = {
      id,
      question: spec.question,
      slug,
      description: spec.description,
      category: spec.category,
      market_type: spec.market_type,
      status: "open",
      auto_resolve_enabled: false,
      initial_liquidity_cents: 1_000_000,
      initial_prob: spec.market_type === "binary" ? spec.initialProb : (spec.probs?.[0] ?? 0.5),
      liquidity_b: b,
      keywords: spec.keywords,
      image_url: null,
      resolution_source: "Official public sources; verified by SokoResult desk",
      resolved_outcome: null,
      resolved_outcome_id: null,
      pending_resolution: null,
      q_yes: 0,
      q_no: 0,
      yes_price: 0,
      no_price: 0,
      volume_cents: Math.round((150_000 + rnd() * 3_500_000) * 100),
      trader_count: 12 + Math.floor(rnd() * 280),
      closes_at: iso(now + spec.days * 86_400_000),
      created_at: iso(now - (5 + rnd() * 60) * 86_400_000),
      updated_at: iso(now),
    };
    if (spec.market_type === "binary") {
      const initProb = spec.initialProb ?? 0.5;
      m.q_yes = b * Math.log(initProb);
      m.q_no = b * Math.log(1 - initProb);
      const [py, pn] = lmsrPrices(b, [m.q_yes, m.q_no]);
      m.yes_price = py;
      m.no_price = pn;
    } else {
      const labels = spec.probs!.map((_, j) => OUTCOME_LABELS[i][j]);
      labels.forEach((label, j) => {
        outcomesAll.push({
          id: randomUUID(),
          market_id: id,
          label,
          slug: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          price: spec.probs![j],
          q: b * Math.log(spec.probs![j]),
          sort_order: j,
          image_url: null,
          is_winner: null,
          created_at: iso(now),
        });
      });
      m.yes_price = spec.probs![0];
      m.no_price = 1 - spec.probs![0];
    }
    markets.push(m);
  });
  dbPut("markets", markets);
  dbPut("market_outcomes", outcomesAll);

  // ── Bot trades through the real engine (prices drift naturally) ──
  const botIds = profiles.map((p) => p.id);
  for (let i = 0; i < 90; i++) {
    const m = markets[Math.floor(rnd() * markets.length)];
    const userId = botIds[Math.floor(rnd() * botIds.length)];
    let outcomeId: string | null = null;
    let outcome: string | undefined;
    if (m.market_type === "multi") {
      const outs = outcomesAll.filter((o) => o.market_id === m.id);
      outcomeId = outs[Math.floor(rnd() * outs.length)].id;
    } else {
      outcome = rnd() < Number(m.yes_price) ? "YES" : "NO";
    }
    executeLmsrTrade(
      { get: dbGet, put: dbPut },
      {
        marketId: m.id,
        outcome,
        outcomeId,
        side: "BUY",
        quantity: 2 + Math.floor(rnd() * 38),
        userId,
        enforceBalance: false,
      },
    );
  }

  // ── 30 days of price history ending at current prices ──
  const hist: any[] = [];
  let phId = 0;
  for (const m of markets) {
    const target = Number(m.yes_price);
    const points = 48;
    // walk backwards from target, then reverse so it's forward in time
    let v = target;
    const vals = [v];
    for (let i = 1; i < points; i++) {
      v = Math.min(0.94, Math.max(0.04, v - (rnd() - 0.48) * 0.035));
      vals.unshift(v);
    }
    vals[vals.length - 1] = target;
    vals.forEach((p, i) => {
      hist.push({
        id: ++phId,
        market_id: m.id,
        yes_price: Math.round(p * 10_000) / 10_000,
        recorded_at: iso(now - (points - 1 - i) * (30 / points) * 86_400_000),
      });
    });
  }
  _db!.meta.ph_id = phId;
  dbPut("price_history", hist);

  // ── News tape + trending keywords + signals ──
  dbPut("raw_news_data", NEWS_TEMPLATES.map((n, i) => ({
    id: randomUUID(),
    title: n.title,
    body: n.body,
    source: n.source,
    url: "#",
    image_url: null,
    category: n.cat,
    published_at: iso(now - Math.floor(20 + rnd() * 4000) * 60_000),
    processed: true,
    sentiment_score: Math.round((rnd() * 2 - 1) * 100) / 100,
    topics: n.kw,
    relevant_keywords: n.kw,
    entities: null,
    analyze_attempts: 1,
    last_error: null,
    created_at: iso(now - i * 3_600_000),
  })));
  dbPut("trending_keywords", [
    { keyword: "ruto", trend_score: 94.2, mentions_1h: 4120, updated_at: iso(now) },
    { keyword: "afcon", trend_score: 88.7, mentions_1h: 3810, updated_at: iso(now) },
    { keyword: "shilling", trend_score: 81.3, mentions_1h: 2210, updated_at: iso(now) },
    { keyword: "finance bill", trend_score: 76.9, mentions_1h: 1870, updated_at: iso(now) },
    { keyword: "epl", trend_score: 72.5, mentions_1h: 1610, updated_at: iso(now) },
    { keyword: "burna boy", trend_score: 64.1, mentions_1h: 980, updated_at: iso(now) },
    { keyword: "cbk", trend_score: 58.8, mentions_1h: 740, updated_at: iso(now) },
    { keyword: "gor mahia", trend_score: 52.4, mentions_1h: 610, updated_at: iso(now) },
  ]);
  dbPut("market_signals", markets.map((m) => ({
    market_id: m.id,
    signal_prob: m.yes_price,
    confidence: Math.round(rnd() * 40 + 40) / 100,
    avg_sentiment: Math.round((rnd() * 1.6 - 0.8) * 100) / 100,
    news_count: Math.floor(rnd() * 14),
    social_count: Math.floor(rnd() * 400),
    velocity: Math.round((rnd() - 0.5) * 2 * 100) / 100,
    computed_at: iso(now),
  })));
  dbPut("system_settings", [
    { key: "hourly_trade_cap_cents", value: "5000000", updated_at: iso(now) },
    { key: "notional_cap_cents", value: "25000000", updated_at: iso(now) },
    { key: "signup_bonus_cents", value: "1000000", updated_at: iso(now) },
  ]);
  dbPut("admin_alerts", []);
  dbPut("notifications", []);
  dbPut("comments", []);
  dbPut("support_tickets", []);
  dbPut("support_ticket_messages", []);
  dbPut("support_ticket_attachments", []);
  dbPut("market_suggestions", []);
  dbPut("social_posts", []);
  dbPut("source_health", [{ source: "demo-seed", last_run: iso(now), status: "ok", items_fetched: 14, error: null }]);
  dbPut("treasury_snapshot", [{ id: randomUUID(), total_float_cents: 48_600_000_00, liability_cents: 41_200_000_00, taken_at: iso(now) }]);
  dbPut("user_sessions", []);
  dbPut("users", []);
  dbPut("storage_objects", []);
  dbPut("kyc_submissions", []);
  dbPut("orders", []);
  dbPut("positions", dbGet("positions"));
  dbPut("trades", dbGet("trades"));
  dbPut("transactions", dbGet("transactions"));
}

const OUTCOME_LABELS: Record<number, string[]> = {
  2: ["Raila Odinga", "Martha Karua", "Kalonzo Musyoka", "Fred Matiang'i", "Other"],
  6: ["Arsenal", "Liverpool", "Manchester City", "Chelsea", "Other"],
  12: ["Housemate A", "Housemate B", "Housemate C", "Housemate D"],
};
