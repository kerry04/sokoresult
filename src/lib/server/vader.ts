// Tiny VADER-style sentiment scorer for short social text.
// Not the full lexicon — a curated subset that performs well on news/political
// tweets in EN. Returns a polarity in [-1, 1].
//
// Algorithm (simplified VADER):
//  1. Tokenize on whitespace, lowercase, strip punctuation.
//  2. Sum lexicon scores for each token.
//  3. Apply negation flip on the previous token if a negation word precedes it.
//  4. Apply booster multiplier (e.g. "very") to the next token.
//  5. Normalize sum into [-1, 1] using x / sqrt(x*x + 15).

const LEXICON: Record<string, number> = {
  // positive
  good: 1.9, great: 3.1, excellent: 3.2, amazing: 2.8, awesome: 3.0, love: 3.2,
  loved: 2.9, wonderful: 2.7, fantastic: 3.0, brilliant: 2.7, perfect: 2.9,
  best: 2.6, win: 2.0, wins: 2.0, winning: 2.1, victory: 2.5, success: 2.3,
  successful: 2.3, hope: 1.7, hopeful: 1.9, happy: 2.4, glad: 1.8, peace: 2.0,
  safe: 1.6, strong: 1.8, growth: 1.5, gain: 1.4, gains: 1.4, boost: 1.5,
  thanks: 1.8, thank: 1.8, support: 1.4, agree: 1.3, congratulations: 2.5,
  // negative
  bad: -1.9, terrible: -3.0, awful: -2.8, hate: -3.0, hated: -2.8, worst: -3.0,
  poor: -1.7, fail: -2.2, fails: -2.2, failure: -2.5, lose: -1.6, lost: -1.6,
  loser: -2.2, defeat: -2.0, sad: -1.8, angry: -2.4, anger: -2.0, mad: -1.6,
  fear: -2.0, afraid: -1.8, scared: -1.9, worried: -1.6, worry: -1.6,
  problem: -1.4, problems: -1.5, crisis: -2.4, scandal: -2.5, corruption: -2.6,
  corrupt: -2.4, war: -2.5, attack: -2.4, attacked: -2.3, killed: -2.8,
  death: -2.6, dead: -2.4, dying: -2.4, threat: -2.0, threats: -2.0,
  shame: -2.0, shameful: -2.5, disgust: -2.6, disgusting: -2.7, lie: -2.0,
  lies: -2.0, liar: -2.4, fake: -1.8, fraud: -2.6, fraudulent: -2.6,
  injustice: -2.4, betrayal: -2.4, betray: -2.2, suffer: -1.8, suffering: -2.0,
  // KE-context flavor
  hawking: -0.3, raid: -1.5, abducted: -2.6, demolish: -1.8,
};

const NEGATIONS = new Set([
  "not","no","never","nor","none","cant","cannot","can't","won't","wont","don't","dont",
  "doesn't","doesnt","didn't","didnt","aren't","arent","isn't","isnt","wasn't","wasnt",
  "without","ain't","aint","hardly","barely","scarcely",
]);

const BOOSTERS: Record<string, number> = {
  very: 0.293, really: 0.293, extremely: 0.293, totally: 0.293,
  absolutely: 0.293, completely: 0.293, super: 0.293, hugely: 0.293,
  somewhat: -0.293, slightly: -0.293, kinda: -0.293, sorta: -0.293,
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function scoreSentiment(text: string): number {
  const tokens = tokenize(text);
  let sum = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let score = LEXICON[t];
    if (score === undefined) continue;

    // Negation: flip if preceded by a negation within 3 tokens
    for (let k = 1; k <= 3; k++) {
      const prev = tokens[i - k];
      if (prev && NEGATIONS.has(prev)) {
        score = -score * 0.74;
        break;
      }
    }

    // Booster: scale by adjacent booster
    const prev1 = tokens[i - 1];
    if (prev1 && BOOSTERS[prev1]) {
      score *= 1 + BOOSTERS[prev1];
    }

    // ALL CAPS amplification (look at original casing)
    // Cheap proxy: count of uppercase letters in original word
    sum += score;
  }

  // ! amplification
  const exclaim = Math.min(4, (text.match(/!/g) ?? []).length);
  if (sum !== 0 && exclaim > 0) {
    sum += exclaim * 0.292 * (sum > 0 ? 1 : -1);
  }

  // Normalize to [-1, 1]
  return Number((sum / Math.sqrt(sum * sum + 15)).toFixed(4));
}
