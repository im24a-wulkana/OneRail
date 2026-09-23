import { getSql } from './db';
import { normalize, tokenize } from './relevance';

/**
 * Most-run searches on this site over the last 30 days.
 *
 * Shared by the homepage (server-rendered) and /api/popular so the two can't
 * drift apart — the page used to seed itself with a hardcoded list, which meant
 * a curated term rendered above the genuinely most-searched ones on every load.
 */

/** Shown only while the site has too little traffic to rank anything. */
export const CURATED = [
  'Carhartt Detroit jacket',
  'Levi’s 501 vintage',
  'Arc’teryx shell',
  'Doc Martens 1460',
  'Acne Studios knit',
];

export const LIMIT = 6;
/** Below this a term isn't meaningfully "popular" — one person searching twice. */
export const MIN_SEARCHES = 3;

/**
 * Words that keep a search off the homepage. This list only has to hold the
 * line against someone typing the same crude thing repeatedly to see it
 * promoted — it is not content moderation, and the search itself still runs.
 *
 * Matched whole-word against normalised tokens rather than as substrings, so
 * legitimate terms containing these letters ("Scunthorpe", "Sussex", "Analog",
 * "Cockburn") are unaffected.
 */
const BLOCKED_WORDS = new Set([
  'anal', 'anus', 'arse', 'arsehole', 'ass', 'asshole', 'bastard', 'bitch',
  'blowjob', 'bollocks', 'boner', 'boob', 'boobs', 'bukkake', 'bullshit',
  'clit', 'cock', 'coon', 'cum', 'cunt', 'dick', 'dildo', 'dyke', 'ejaculate',
  'fag', 'faggot', 'fuck', 'fucker', 'fucking', 'gangbang', 'handjob', 'horny',
  'incest', 'jerkoff', 'jizz', 'kike', 'labia', 'masturbate', 'milf', 'nigga',
  'nigger', 'nipple', 'nipples', 'nude', 'nudes', 'orgasm', 'orgy', 'penis',
  'porn', 'porno', 'pussy', 'queer', 'rape', 'rapist', 'retard', 'retarded',
  'rimjob', 'scrotum', 'semen', 'sex', 'shit', 'slut', 'spic', 'tits', 'titties',
  'tranny', 'twat', 'vagina', 'wank', 'wanker', 'whore',
]);

/** Common letter-for-symbol swaps, so "f*ck" and "sh1t" are caught too. */
const LEETSPEAK: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's',
  '*': '', '.': '', '-': '', '_': '',
};

/** True when `short` is `word` with exactly one character removed. */
function isOneDeletionOf(short: string, word: string): boolean {
  if (word.length !== short.length + 1) return false;
  let i = 0;
  let skipped = false;
  for (let j = 0; j < word.length; j++) {
    if (i < short.length && short[i] === word[j]) {
      i++;
    } else if (skipped) {
      return false;
    } else {
      skipped = true;
    }
  }
  return i === short.length;
}

/** Lengths a blocked word can shrink to when one character is masked out. */
const maskedLengths = new Set([...BLOCKED_WORDS].map((w) => w.length));

/**
 * True when any word in the query is on the blocklist.
 *
 * Symbol substitutions are folded before tokenising, not after: `normalize`
 * turns punctuation into spaces, so "f*ck" would otherwise split into "f" and
 * "ck" and sail past the list.
 */
export function isExplicit(query: string): boolean {
  const folded = query.toLowerCase().replace(/[013457@$*._-]/g, (c) => LEETSPEAK[c] ?? c);

  for (const source of [query, folded]) {
    for (const token of tokenize(source)) {
      if (BLOCKED_WORDS.has(token)) return true;
      // Compare against collapsed and vowel-stripped forms, so "a$$hole"
      // (-> "ashole") and "f*ck" (-> "fck") both resolve to their source word.
      // Vowel stripping only applies to tokens that already lost a character to
      // a symbol, otherwise real words start colliding.
      const squashed = token.replace(/(.)\1+/g, '$1');
      if (squashed.length > 2) {
        for (const word of BLOCKED_WORDS) {
          if (word.replace(/(.)\1+/g, '$1') === squashed) return true;
        }
      }
      // A censored word ("f*ck", "sh!t") loses exactly the masked characters, so
      // it matches a blocked word of the same length with the gaps filled back
      // in. Anchoring on length and position keeps real words out: dropping
      // vowels wholesale would flag "Acne Studios" and "duck canvas".
      if (source === folded && maskedLengths.has(token.length + 1)) {
        for (const word of BLOCKED_WORDS) {
          if (word.length === token.length + 1 && isOneDeletionOf(token, word)) return true;
        }
      }
    }
  }
  return false;
}

export type PopularResult = {
  terms: string[];
  source: 'searches' | 'mixed' | 'curated';
};

/**
 * Edit distance, capped: anything past `max` is "too different" and the exact
 * figure stops mattering, so the row scan bails early.
 */
function withinEditDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  if (a === b) return true;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < best) best = current[j];
    }
    if (best > max) return false;
    previous = current;
  }
  return previous[b.length] <= max;
}

/**
 * Whether two searches are the same intent spelled differently.
 *
 * Covers the two cases real data throws up: a misspelling of the same words
 * ("carhartt" / "Carhardt"), and a query that is a prefix of a longer one
 * ("dior" inside "Dior homme"). Both otherwise split one popular term across
 * several rows and push genuinely distinct searches off the list.
 */
function sameIntent(a: string, b: string): boolean {
  if (a === b) return true;

  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (aTokens.length === 0 || bTokens.length === 0) return false;

  // One edit per five characters: short words must match near-exactly, while
  // "christiane" can still absorb a slip.
  const near = (x: string, y: string) => {
    if (x === y) return true;
    const budget = Math.max(1, Math.floor(Math.min(x.length, y.length) / 5));
    return withinEditDistance(x, y, budget);
  };

  // One query's words are a leading subset of the other's, allowing a typo in
  // each: "dior" vs "dior homme", and "Carhardt" vs "carhartt jacket". Matching
  // only the shared prefix is what lets a one-word misspelling fold into a
  // longer phrase — comparing full token lists would miss it entirely.
  const [short, long] = aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens];
  return short.every((token, i) => near(token, long[i]));
}

/**
 * Merges spelling variants, drops explicit searches, and returns the top terms.
 *
 * Rows arrive ordered by count, so the first spelling of a group is its most
 * popular one — that becomes the label, and later variants fold into it.
 */
export function rankTerms(rows: { query: string; search_count: number }[]): string[] {
  const groups: { label: string; count: number }[] = [];

  for (const row of rows) {
    const query = row.query?.trim();
    if (!query || isExplicit(query)) continue;

    const existing = groups.find((g) => sameIntent(normalize(g.label), normalize(query)));
    if (existing) {
      existing.count += row.search_count;
    } else {
      groups.push({ label: query, count: row.search_count });
    }
  }

  return groups
    .filter((g) => g.count >= MIN_SEARCHES)
    .sort((a, b) => b.count - a.count)
    .slice(0, LIMIT)
    .map((g) => g.label);
}

export async function getPopularSearches(): Promise<PopularResult> {
  const sql = getSql();
  if (!sql) return { terms: CURATED, source: 'curated' };

  try {
    // Fetched well past LIMIT: variants merge and explicit rows drop out, so
    // the final list is shorter than what comes back. The threshold is applied
    // after merging, since two spellings can each fall short while their
    // combined count clears it.
    const rows = (await sql`
      select query, search_count
      from popular_searches
      order by search_count desc, last_searched_at desc
      limit 100
    `) as { query: string; search_count: number }[];

    const terms = rankTerms(rows);
    if (terms.length === 0) return { terms: CURATED, source: 'curated' };

    // Top up a short list with curated terms the real data doesn't cover, so
    // the row never looks bare. Real terms always come first.
    if (terms.length < LIMIT) {
      const seen = new Set(terms.map((t) => t.toLowerCase()));
      for (const term of CURATED) {
        if (terms.length >= LIMIT) break;
        if (!seen.has(term.toLowerCase())) terms.push(term);
      }
      return { terms, source: 'mixed' };
    }

    return { terms, source: 'searches' };
  } catch (error) {
    console.error('Popular searches error:', error);
    return { terms: CURATED, source: 'curated' };
  }
}
