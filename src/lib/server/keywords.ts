// Shared keyword sanitizer used by both the analyzer (on insert) and the
// trend computer (on aggregation). Goal: aggressively reject generic news
// vocabulary, prepositions, fillers, and single-word junk so that only
// meaningful entities, events, and specific topics drive trends.

const STOPWORDS = new Set<string>([
  // English fillers / function words
  "the","and","for","with","from","that","this","have","has","had","are","was","were",
  "will","would","could","should","you","your","they","their","them","but","not",
  "all","any","can","say","said","one","two","three","four","five","six","seven","eight","nine","ten",
  "after","over","into","out","more","than","what","who","how","why","when","where","whose","which","whom",
  "back","because","like","something","even","about","know","home","these","those",
  "thing","things","some","years","year","once","many","only","kids","kid","though",
  "need","someone","most","forward","just","idea","also","still","very","much","new",
  "old","big","small","good","bad","get","got","make","made","take","took","come","came",
  "goes","gone","being","been","does","did","doing","while","upon","such","each",
  "between","through","before","under","again","other","others","first","last","next",
  "way","ways","day","days","week","weeks","month","months","time","times","today",
  "yesterday","tomorrow","now","then","here","there","ever","never","yes","off","onto",
  "may","might","must","shall","let","lets","its","his","her","him","she","our","ours",
  "yours","mine","theirs","i","me","we","us",
  // Generic news vocabulary that pollutes trends
  "news","story","stories","report","reports","reporting","update","updates","updated",
  "article","articles","video","videos","photo","photos","image","images","picture",
  "exclusive","official","statement","statements","comment","comments","response","reaction",
  "alert","alerts","warning","warnings","breaking","latest","trending","viral",
  "leader","leaders","citizen","citizens","voter","voters","people","person","public",
  "man","woman","child","children","family","life","world","situation","matter",
  "issue","issues","case","cases","problem","problems","question","questions","answer",
  // Generic categories (these are categories, not topics)
  "politics","political","sports","sport","sporting","entertainment","entertain",
  "fashion","economy","economic","economics","business","businesses","financial","finance",
  "international","national","local","regional","global","domestic","foreign",
  // Generic geographic noise
  "kenya","kenyan","kenyans","africa","african","nairobi","city","cities","county","counties",
  "country","countries","state","states","region","regions","government","governments",
  // Generic verbs/nouns of action
  "plan","plans","planning","deal","deals","move","moves","push","pushes","drive","drives",
  "win","wins","winning","loss","losses","victory","defeat","threat","threats","fear","fears",
  "hope","hopes","help","helps","support","supports","launch","launches","launched",
  "open","opens","opened","close","closes","closed","start","starts","started","end","ends","ended",
  "say","says","saying","told","tell","tells","ask","asks","asked","find","finds","found",
  // Time markers
  "morning","evening","afternoon","night","midnight","noon","weekend","weekday",
  // Swahili common fillers
  "kama","ndio","hapana","leo","jana","kesho","huko","hapa","sana","tu","kwa","na",
  "ya","wa","la","za","mwa","mtu","watu","sasa","baadaye","jambo","mambo","ile","hiyo","hii",
  // Web junk
  "https","http","www","com","html","htm","org","net","amp","quot","apos",
]);

export interface KeywordContext {
  /** Set of lowercased entity names (any type) extracted by the analyzer.
   *  Used to whitelist single-word keywords that are proper nouns. */
  entityNames?: Set<string>;
}

/**
 * Normalize and validate a keyword. Returns the cleaned form, or null if
 * the input should be discarded.
 *
 * Rules:
 *  - lowercase, collapse whitespace, strip punctuation except internal
 *    hyphens/apostrophes
 *  - 4–60 chars
 *  - not all-numeric
 *  - not a stopword
 *  - single-word keywords are only allowed if they appear in entityNames
 *    (i.e. the analyzer flagged them as a proper noun) OR they're long
 *    enough (>=8 chars) and not stopwords
 */
export function sanitizeKeyword(
  raw: string | null | undefined,
  ctx?: KeywordContext,
): string | null {
  if (!raw) return null;
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (cleaned.length < 4 || cleaned.length > 60) return null;
  if (/^[\d\s'-]+$/.test(cleaned)) return null;

  const words = cleaned.split(" ").filter(Boolean);
  if (words.length === 0) return null;

  // Reject if every word is a stopword
  if (words.every((w) => STOPWORDS.has(w))) return null;

  // Multi-word phrases: keep if at least one word is meaningful
  if (words.length >= 2) {
    // Strip leading/trailing stopwords ("the new policy" -> "new policy")
    while (words.length > 0 && STOPWORDS.has(words[0])) words.shift();
    while (words.length > 0 && STOPWORDS.has(words[words.length - 1])) words.pop();
    if (words.length === 0) return null;
    if (words.length === 1) {
      // Fell through to single-word path
      return sanitizeSingle(words[0], ctx);
    }
    const phrase = words.join(" ");
    if (phrase.length < 4) return null;
    return phrase;
  }

  return sanitizeSingle(words[0], ctx);
}

function sanitizeSingle(word: string, ctx?: KeywordContext): string | null {
  if (STOPWORDS.has(word)) return null;
  // Allow single word if it was tagged as an entity (proper noun)
  if (ctx?.entityNames?.has(word)) return word;
  // Otherwise require length >= 6 (e.g. "mulamwah", "harambee" are fine,
  // but "deal", "loss", "win", "kcb" get filtered — KCB will come back via entityNames)
  if (word.length >= 6) return word;
  return null;
}

/** Sanitize a list, dedupe, and drop nulls. */
export function sanitizeKeywords(
  raws: Array<string | null | undefined>,
  ctx?: KeywordContext,
): string[] {
  const out = new Set<string>();
  for (const r of raws) {
    const k = sanitizeKeyword(r, ctx);
    if (k) out.add(k);
  }
  return Array.from(out);
}
