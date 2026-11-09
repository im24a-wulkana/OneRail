import { Item } from '../types';

/**
 * Grailed has no official API. Its own web frontend searches through a public
 * Algolia index, so we query the same cluster with the same browser-visible
 * search-only credentials.
 *
 * Technique from https://github.com/pznamir00/Grailed-API (Python).
 * The old www.grailed.com/api/v2/search endpoint returns 403 to bot traffic.
 */
const ALGOLIA_APP_ID = 'MNRWEFSS2Q';
// Public, search-only key shipped in Grailed's client bundle — not a secret.
const ALGOLIA_API_KEY = 'bc9ee1c014521ccf312525a4ef324a16';
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID.toLowerCase()}-1.algolianet.com/1/indexes/*/queries`;

const LIVE_INDEX = 'Listing_production';

/**
 * Algolia caps this index at 1000 hits per query no matter how you paginate
 * (nbPages * hitsPerPage always lands on 1000), so that's the hard ceiling.
 *
 * 500 balances depth against payload: ~1.5MB and well inside the 8s timeout,
 * where the full 1000 ships ~3MB for results almost nobody scrolls to.
 */
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;
const MAX_HITS_PER_PAGE = 200;

/** Algolia condition slugs → the app's shared vocabulary. */
const CONDITION_MAP: Record<string, string> = {
  is_new: 'new',
  is_gently_used: 'like new',
  is_used: 'good',
  is_worn: 'fair',
  is_not_specified: '',
};

type GrailedHit = {
  id: number;
  title?: string;
  price?: number;
  price_i?: number;
  size?: string;
  condition?: string;
  sold?: boolean;
  created_at?: string;
  cover_photo?: { url?: string; image_url?: string };
  photos?: { url?: string }[];
  description?: string;
  designer_names?: string;
  color?: string;
  location?: string;
  followerno?: number;
  /** "menswear" or "womenswear". */
  department?: string;
  user?:{ username?: string; seller_score?: { rating_average?: number } };
};

export async function scrapeGrailed(query: string, limit = DEFAULT_LIMIT): Promise<Item[]> {
  const wanted = Math.min(Math.max(limit, 1), MAX_LIMIT);

  try {
    // Algolia accepts several requests in one POST, so pages beyond the
    // 200-hit cap are batched into a single round trip rather than N fetches.
    const pageCount = Math.ceil(wanted / MAX_HITS_PER_PAGE);
    const hitsPerPage = Math.min(wanted, MAX_HITS_PER_PAGE);

    const requests = Array.from({ length: pageCount }, (_, page) => ({
      indexName: LIVE_INDEX,
      // Per-request options are a urlencoded string, not JSON.
      // `sold` is a plain boolean rather than a configured facet, so it can't
      // go in facetFilters (that matches nothing) — it's filtered below.
      params: new URLSearchParams({
        query,
        hitsPerPage: String(hitsPerPage),
        page: String(page),
      }).toString(),
    }));

    const response = await fetch(ALGOLIA_URL, {
      method: 'POST',
      headers: {
        accept: '*/*',
        'content-type': 'application/x-www-form-urlencoded',
        'x-algolia-api-key': ALGOLIA_API_KEY,
        'x-algolia-application-id': ALGOLIA_APP_ID,
      },
      body: JSON.stringify({ requests }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error(`Grailed search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    // Past the 1000-hit ceiling Algolia returns an empty result set rather
    // than an error, so short pages simply contribute nothing.
    const hits: GrailedHit[] = (data?.results ?? []).flatMap(
      (result: { hits?: GrailedHit[] }) => result?.hits ?? [],
    );

    return hits
      .filter((hit) => !hit.sold)
      .slice(0, wanted)
      .map(toItem);
  } catch (error) {
    console.error('Grailed scraper error:', error);
    return [];
  }
}

function toItem(hit: GrailedHit): Item {
  const photo = hit.cover_photo?.url ?? hit.cover_photo?.image_url ?? hit.photos?.[0]?.url ?? '';

  return {
    id: `grailed-${hit.id}`,
    platform: 'grailed',
    title: hit.title ?? 'Untitled listing',
    // `price` and `price_i` are both whole units (USD); price_i is the fallback.
    price: typeof hit.price === 'number' ? hit.price : (hit.price_i ?? 0),
    currency: 'USD',
    // Grailed stores lowercase ("xl", "40r", "10"); uppercase for display and
    // let normalizeSize handle matching.
    size: hit.size ? hit.size.toUpperCase() : null,
    condition: (hit.condition && CONDITION_MAP[hit.condition]) || null,
    // Grailed's CDN resizes on the fly; ask for a card-sized image.
    image_url: photo ? `${photo}?w=600&fit=clip&auto=format` : '',
    external_url: `https://www.grailed.com/listings/${hit.id}`,
    listed_at: hit.created_at ?? null,

    // The search index carries no description and only a cover shot.
    description: hit.description ?? null,
    images: photo ? [`${photo}?w=1200&fit=clip&auto=format`] : [],
    brand: hit.designer_names ?? null,
    color: hit.color ?? null,
    seller: {
      name: hit.user?.username ?? null,
      rating: hit.user?.seller_score?.rating_average ?? null,
      location: hit.location ?? null,
    },
    favourites: hit.followerno ?? null,
    gender:
      hit.department === 'womenswear' ? 'women' : hit.department === 'menswear' ? 'men' : null,
  };
}
