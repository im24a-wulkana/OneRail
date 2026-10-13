import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { getUsdRate, toUsd } from './currency';
import { queryTerms, scoreItem, tokenize } from './relevance';
// Shared with the results filter; see lib/garment.ts.
import { type Garment, garmentOf, sameGarment } from './garment';
import type { Item, Platform } from './types';

/**
 * Sold-listing lookups, used to price a listing against what comparable items
 * actually fetched — not what other sellers are asking.
 *
 * Three of the five platforms expose sold data:
 *  - Grailed: a dedicated `Listing_sold_production` Algolia index, with both
 *    the sale price and the original ask.
 *  - Poshmark: `inventory_status: ['sold_out']` on the normal search.
 *  - Mercari: `STATUS_SOLD_OUT` on the normal search (JPY, converted here).
 *
 * eBay's sold data lives behind the Marketplace Insights API, which returns
 * 403 without a separate approved application. Vinted hides sold items
 * entirely. Both are simply absent from the sample rather than faked.
 */

export type SoldListing = {
  platform: Platform;
  title: string;
  /** Sale price in USD. */
  price: number;
  /** What the seller was asking, when the platform reports it. */
  askingPrice: number | null;
  soldAt: string | null;
  url: string;
};

const REQUEST_TIMEOUT = 7000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/* -------------------------------------------------------------------------- */
/* Grailed                                                                     */
/* -------------------------------------------------------------------------- */

const ALGOLIA_URL = 'https://mnrwefss2q-1.algolianet.com/1/indexes/*/queries';
const ALGOLIA_HEADERS = {
  accept: '*/*',
  'content-type': 'application/x-www-form-urlencoded',
  'x-algolia-api-key': 'bc9ee1c014521ccf312525a4ef324a16',
  'x-algolia-application-id': 'MNRWEFSS2Q',
};

async function grailedSold(query: string): Promise<SoldListing[]> {
  try {
    const params = new URLSearchParams({ query, hitsPerPage: '100', page: '0' }).toString();
    const response = await fetch(ALGOLIA_URL, {
      method: 'POST',
      headers: ALGOLIA_HEADERS,
      body: JSON.stringify({ requests: [{ indexName: 'Listing_sold_production', params }] }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    if (!response.ok) return [];

    const data = await response.json();
    const hits = data?.results?.[0]?.hits ?? [];

    return hits
      .filter((h: { sold_price?: number }) => typeof h.sold_price === 'number' && h.sold_price > 0)
      .map(
        (h: {
          id: number;
          title?: string;
          sold_price: number;
          price?: number;
          sold_at?: string;
        }): SoldListing => ({
          platform: 'grailed',
          title: h.title ?? '',
          price: h.sold_price,
          // Only meaningful when it differs from what it sold for.
          askingPrice: typeof h.price === 'number' && h.price !== h.sold_price ? h.price : null,
          soldAt: h.sold_at ?? null,
          url: `https://www.grailed.com/listings/${h.id}`,
        }),
      );
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Poshmark                                                                    */
/* -------------------------------------------------------------------------- */

async function poshmarkSold(query: string): Promise<SoldListing[]> {
  try {
    const request = {
      filters: { department: 'All', inventory_status: ['sold_out'] },
      query,
    };
    const url =
      `https://poshmark.com/vm-rest/posts?request=${encodeURIComponent(JSON.stringify(request))}` +
      `&count=48`;

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    if (!response.ok) return [];

    const data = await response.json();
    return (data?.data ?? [])
      .map(
        (p: {
          id?: string;
          title?: string;
          price_amount?: { val?: string };
          original_price_amount?: { val?: string };
          status_changed_at?: string;
          inventory?: { status_changed_at?: string };
        }): SoldListing | null => {
          const price = Number.parseFloat(p.price_amount?.val ?? '');
          if (!Number.isFinite(price) || price <= 0) return null;

          const original = Number.parseFloat(p.original_price_amount?.val ?? '');
          return {
            platform: 'poshmark',
            title: p.title ?? '',
            price,
            askingPrice: Number.isFinite(original) && original > price ? original : null,
            soldAt: p.inventory?.status_changed_at ?? p.status_changed_at ?? null,
            url: `https://poshmark.com/listing/${p.id}`,
          };
        },
      )
      .filter((x: SoldListing | null): x is SoldListing => x !== null);
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Mercari                                                                     */
/* -------------------------------------------------------------------------- */

const MERCARI_URL = 'https://api.mercari.jp/v2/entities:search';
let mercariKeys: Promise<{ privateKey: CryptoKey; jwk: Record<string, unknown> }> | null = null;

function getMercariKeys() {
  if (!mercariKeys) {
    mercariKeys = (async () => {
      const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
      const full = await exportJWK(publicKey);
      return { privateKey, jwk: { crv: full.crv, kty: full.kty, x: full.x, y: full.y } };
    })();
  }
  return mercariKeys;
}

async function mercariSold(query: string): Promise<SoldListing[]> {
  try {
    const { privateKey, jwk } = await getMercariKeys();
    const dpop = await new SignJWT({ htu: MERCARI_URL, htm: 'POST', uuid: randomUUID() })
      .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk })
      .setIssuedAt()
      .setJti(randomUUID())
      .sign(privateKey);

    const response = await fetch(MERCARI_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'User-Agent': USER_AGENT,
        dpop,
        'x-platform': 'web',
      },
      body: JSON.stringify({
        userId: '',
        pageSize: 120,
        pageToken: '',
        searchSessionId: randomUUID().replace(/-/g, ''),
        indexRouting: 'INDEX_ROUTING_UNSPECIFIED',
        searchCondition: {
          keyword: query,
          excludeKeyword: '',
          sort: 'SORT_SCORE',
          order: 'ORDER_DESC',
          status: ['STATUS_SOLD_OUT'],
        },
        defaultDatasets: ['DATASET_TYPE_MERCARI'],
        serviceFrom: 'suruga',
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    if (!response.ok) return [];

    const data = await response.json();
    const rate = await getUsdRate('JPY');
    // Without a rate the yen figures would sit alongside dollars and skew the
    // median badly, so the platform is dropped rather than mixed in.
    if (!rate) return [];

    return (data?.items ?? [])
      .filter((i: { status?: string }) => i.status === 'ITEM_STATUS_SOLD_OUT')
      .map((i: { id?: string; name?: string; price?: string; updated?: number }): SoldListing | null => {
        const jpy = Number.parseFloat(i.price ?? '');
        if (!Number.isFinite(jpy) || jpy <= 0) return null;
        return {
          platform: 'mercari',
          title: i.name ?? '',
          price: toUsd(jpy, rate),
          askingPrice: null,
          soldAt: i.updated ? new Date(i.updated * 1000).toISOString() : null,
          url: `https://buyee.jp/mercari/item/${i.id}`,
        };
      })
      .filter((x: SoldListing | null): x is SoldListing => x !== null);
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Query condensing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Words that describe a specific copy of a garment rather than the model, so
 * they narrow a sold-comparables search without making it more accurate.
 * Colours and sizes matter to a buyer but rarely move the resale price enough
 * to justify losing the whole sample.
 */
const INCIDENTAL = new Set([
  'vintage', 'retro', 'og', 'deadstock', 'nwt', 'nwot', 'bnwt', 'euc', 'vguc',
  'black', 'white', 'grey', 'gray', 'blue', 'red', 'green', 'brown', 'beige',
  'navy', 'cream', 'tan', 'olive', 'khaki', 'pink', 'purple', 'yellow', 'orange',
  'small', 'medium', 'large', 'xl', 'xxl', 'xs', 's', 'm', 'l', 'sz',
  'mens', 'womens', 'men', 'women', 'unisex', 'size', 'authentic', 'genuine',
  'cotton', 'wool', 'nylon', 'polyester', 'fleece', 'knit',
  'cable', 'lined', 'zip', 'button', 'crew', 'slim', 'regular', 'fit', 'style',
  'free', 'shipping', 'fast', 'rare', 'htf', 'vtg', 'super', 'very', 'great',
  'iconic', 'classic', 'original', 'official', 'premium', 'luxury', 'designer',
  'mint', 'clean', 'crazy', 'insane', 'grail', 'archive', 'piece', 'item',
]);

/** Algolia ANDs every token, so past this length a title matches nothing. */
const MAX_QUERY_TERMS = 4;

/**
 * Season codes such as AW07 or SS2009. In archive fashion these identify the
 * exact collection and are the single strongest signal in a title, so they are
 * kept even though they look like the noise the digit filter removes.
 */
const SEASON_CODE = /^(?:aw|ss|fw|pre)\d{2,4}$/;

/** Decade markers like "90s" or "1990s" — era, not model. */
const DECADE = /^(?:19|20)?\d0s$/;

/** Leading articles in a model name; alone they carry no search signal. */
const ARTICLES = new Set(['the', 'a', 'an', 'le', 'la']);

/** Garment nouns, which set the price bracket: Dior jeans and a Dior wallet
 * share a brand and nothing else. Drawn from the search synonym sets so the
 * two stay consistent. */
const GARMENT_WORDS = new Set([
  'jacket', 'coat', 'anorak', 'parka', 'windbreaker', 'bomber', 'overshirt', 'shacket',
  'hoodie', 'hoody', 'sweatshirt', 'pullover', 'crewneck', 'sweater', 'jumper', 'cardigan',
  'pants', 'trousers', 'chinos', 'slacks', 'jeans', 'denim',
  'sneakers', 'trainers', 'shoes', 'boots', 'boot',
  'tee', 'tshirt', 'shirt', 'top', 'blazer', 'suit', 'vest', 'gilet',
  'shorts', 'skirt', 'dress', 'bag', 'backpack', 'tote', 'wallet', 'belt',
  'cap', 'hat', 'beanie', 'scarf', 'gloves',
]);


/** Words that mark a listing's condition or logistics rather than the item. */
const NOISE = new Set([
  'traded', 'sold', 'reserved', 'bundle', 'offers', 'offer', 'price', 'drop',
  'worn', 'used', 'nwt', 'nwot', 'bnwt', 'euc', 'vguc', 'deadstock', 'ds',
]);

/**
 * Turns a listing title into a query broad enough to find comparables but
 * narrow enough that they are the same garment.
 *
 * Grailed's sold index ANDs every token, so a full title like "Vintage Polo
 * Ralph Lauren Sweater Mens Large Blue Cable Knit Cotton" returns zero hits and
 * silently drops the platform. Simply truncating to the first few words fails
 * the other way: titles do not put the identifying part first, so "Dior Homme
 * AW04 'VOTC' Split Collar Shirt" can reduce to a bare brand and match every
 * Dior item ever sold, from $70 trousers to $2600 outerwear.
 *
 * So terms are chosen by what they signal rather than where they sit: the
 * brand-ish opening words, any season code, a quoted model name, and the
 * garment noun that fixes the price bracket.
 */
export function condenseQuery(title: string): string {
  // Quoted model names ("Reflexion") survive only if read before tokenize()
  // strips the quote marks. Apostrophes are deliberately not treated as
  // delimiters: in "Men's classic 90's" they would capture "s classic 90" and
  // outrank the words that actually identify the garment.
  const quoted = [...title.matchAll(/["“”]([^"“”]{2,24})["“”]/g)]
    .map((m) =>
      tokenize(m[1])
        .filter((t) => !NOISE.has(t))
        // A bare "the" matches nothing on an AND index while looking like a
        // real term, so a quoted "The End" keeps only "end".
        .filter((t, i, arr) => !(i === 0 && arr.length > 1 && ARTICLES.has(t)))
        .filter((t) => t.length > 1)
        .slice(0, 2)
        .join(' '),
    )
    .filter((phrase) => phrase.length > 1);

  const tokens = tokenize(title).filter((t) => !NOISE.has(t));

  const seasons = tokens.filter((t) => SEASON_CODE.test(t));
  const garments = tokens.filter((t) => GARMENT_WORDS.has(t));
  const plain = tokens.filter(
    (t) =>
      t.length > 1 &&
      !INCIDENTAL.has(t) &&
      !ARTICLES.has(t) &&
      !DECADE.test(t) &&
      !SEASON_CODE.test(t) &&
      !GARMENT_WORDS.has(t) &&
      !/^\d+$/.test(t),
  );

  // Brand first (the leading plain words), then the sharpest identifier
  // available, then the garment noun that fixes the price bracket.
  const picked: string[] = [];
  let words = 0;
  const add = (term: string) => {
    const cost = term.split(' ').length;
    if (words + cost <= MAX_QUERY_TERMS && !picked.includes(term)) {
      picked.push(term);
      words += cost;
    }
  };

  // Reserve a slot for the garment noun so brand and model words cannot crowd
  // out the one term that fixes the price bracket.
  // Prefer the noun matching the detected category: "Denim Jacket" lists
  // "denim" first, but the jacket is what it is.
  const category = garmentOf(title);
  const garmentTerm =
    garments.find((g) => garmentOf(g) === category) ?? garments[0];
  const brandSlots = Math.max(1, garmentTerm ? MAX_QUERY_TERMS - 2 : MAX_QUERY_TERMS - 1);
  const brandWords = plain.slice(0, brandSlots);
  brandWords.forEach(add);

  // A model name identifies the garment better than the season it shipped in,
  // and ANDing both ("dior homme ss06 end") matches almost nothing, since few
  // sold titles carry the season and the name together. So they are
  // alternatives, not additions. It is taken from whatever the brand words did
  // not already consume, which moves with brandSlots rather than a fixed index.
  const modelName = quoted[0] ?? plain[brandWords.length];
  if (modelName) add(modelName);
  else seasons.slice(0, 1).forEach(add);

  if (garmentTerm) add(garmentTerm);
  // Backfill from whatever is left if the title was unusually sparse.
  plain.slice(brandWords.length + 1).forEach(add);

  // A wholly non-Latin title ("ディオールオム シャツ") has no tokens left after
  // filtering, and an empty query would fetch nothing at all. Fall back to the
  // raw words so the search still runs.
  if (picked.length === 0) {
    const fallback = queryTerms(title).slice(0, MAX_QUERY_TERMS).join(' ');
    return fallback || tokenize(title).slice(0, MAX_QUERY_TERMS).join(' ') || title.trim();
  }
  return picked.join(' ');
}

/* -------------------------------------------------------------------------- */
/* Aggregate                                                                   */
/* -------------------------------------------------------------------------- */

export type PriceComparison = {
  /** Sales judged comparable enough to include. */
  sampleSize: number;
  median: number;
  low: number;
  high: number;
  /** 25th and 75th percentile — a fairer "typical range" than min/max. */
  p25: number;
  p75: number;
  byPlatform: Partial<Record<Platform, number>>;
  /** How the listing's price compares, as a percentage of the median. */
  verdict: 'below' | 'around' | 'above';
  percentDiff: number;
  /**
   * The same gap as a share of the asking price. Phrasing it as "X% less than
   * the asking price" needs the ask as the base; using percentDiff there yields
   * impossible figures like "136% less".
   */
  percentOfAsking: number;
  recent: SoldListing[];
  /** Platforms with no usable sold data, so the UI can say why. */
  unavailable: Platform[];
  /**
   * The garment the sample was restricted to, or null when the title named none
   * and comparables could only be matched on wording.
   */
  garment: Garment | null;
};

/** Below this a median is noise rather than a signal. */
export const MIN_SAMPLE = 5;
/** Sold titles must match the query at least this well to count. */
const RELEVANCE_FLOOR = 0.6;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/**
 * Fetches sold listings across every platform that exposes them and summarises
 * them against `item`. Returns null when too few comparable sales exist — a
 * median drawn from two loosely-related items reads as authoritative and is
 * worse than saying nothing.
 */
export async function comparePrice(
  item: Pick<Item, 'title' | 'price' | 'currency'>,
  query?: string,
): Promise<PriceComparison | null> {
  const searchTerm = (query ?? item.title).trim();
  if (!searchTerm) return null;

  // Fetch on a condensed query — a full listing title ANDs to zero hits on
  // Grailed — but keep the original for scoring below, so a broader fetch
  // doesn't become a looser sample.
  const fetchTerm = query ? searchTerm : condenseQuery(item.title) || searchTerm;

  const [grailed, poshmark, mercari] = await Promise.all([
    grailedSold(fetchTerm),
    poshmarkSold(fetchTerm),
    mercariSold(fetchTerm),
  ]);

  // Score every sold title against the query the same way search results are
  // ranked, so an unrelated sale can't drag the median around. Scoring uses the
  // same condensed terms as the fetch: a genuine comparable is usually titled
  // more tersely than the listing, and demanding every word of a long title
  // back would reject the whole sample.
  const terms = queryTerms(fetchTerm);
  const rarity = new Map<string, number>();
  for (const term of terms) rarity.set(term, 1);

  // Restrict to the same kind of garment. The query already carries a garment
  // noun, but none of the three platforms requires it to match: Algolia scores
  // loosely and Poshmark and Mercari do not AND terms at all, so without this a
  // tee gets priced against hoodies and long-sleeves.
  const garment = garmentOf(item.title);

  const all = [...grailed, ...poshmark, ...mercari].filter((sale) => {
    if (garment) {
      const saleGarment = garmentOf(sale.title);
      // An unlabelled sold title is kept: plenty read "Dior Homme AW03 Luster"
      // with no noun at all, and dropping them would gut the sample.
      if (saleGarment && !sameGarment(garment, saleGarment)) return false;
    }

    if (terms.length === 0) return true;
    const score = scoreItem(
      { title: sale.title, platform: sale.platform } as Item,
      terms,
      rarity,
    );
    return score >= RELEVANCE_FLOOR;
  });

  if (all.length < MIN_SAMPLE) return null;

  const prices = all.map((s) => s.price).sort((a, b) => a - b);
  const median = percentile(prices, 0.5);
  if (median <= 0) return null;

  const byPlatform: Partial<Record<Platform, number>> = {};
  for (const sale of all) byPlatform[sale.platform] = (byPlatform[sale.platform] ?? 0) + 1;

  // Derived after filtering, not from the raw fetches: a platform whose sold
  // items all fell below the relevance floor is just as absent from the median
  // as one that returned nothing, and the UI explains both.
  const unavailable: Platform[] = ['ebay', 'vinted'];
  for (const platform of ['grailed', 'poshmark', 'mercari'] as const) {
    if (!byPlatform[platform]) unavailable.push(platform);
  }

  const percentDiff = Math.round(((item.price - median) / median) * 100);
  const percentOfAsking =
    item.price > 0 ? Math.round(((item.price - median) / item.price) * 100) : 0;
  // A tenth either way is normal variation, not a deal or a markup.
  const verdict = percentDiff <= -10 ? 'below' : percentDiff >= 10 ? 'above' : 'around';

  const recent = [...all]
    .filter((s) => s.soldAt)
    .sort((a, b) => new Date(b.soldAt!).getTime() - new Date(a.soldAt!).getTime())
    .slice(0, 6);

  return {
    sampleSize: all.length,
    median: Math.round(median),
    low: Math.round(prices[0]),
    high: Math.round(prices[prices.length - 1]),
    p25: Math.round(percentile(prices, 0.25)),
    p75: Math.round(percentile(prices, 0.75)),
    byPlatform,
    verdict,
    percentDiff,
    percentOfAsking,
    recent,
    unavailable,
    garment,
  };
}
