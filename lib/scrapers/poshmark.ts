import { Item } from '../types';

/**
 * Poshmark's storefront is backed by an internal JSON API that answers
 * unauthenticated requests, so no key, cookie jar, or browser is needed.
 *
 * The one non-obvious part is pagination: `max_id` must go *inside* the
 * `request` object. Passing it as a query parameter silently returns page 1
 * again alongside a valid-looking `next_max_id`.
 */
const ENDPOINT = 'https://poshmark.com/vm-rest/posts';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** The API returns 40 per call regardless of `count`. */
const PER_PAGE = 48;
/**
 * Pages chain through a cursor, so they can't be fetched in parallel.
 * Six pages lands around 5s — more would exceed the 8s platform budget.
 */
const DEFAULT_PAGES = 6;
const REQUEST_TIMEOUT = 7000;

/** Poshmark's condition slugs. Unmapped/absent values stay null. */
const CONDITION_MAP: Record<string, string> = {
  nwt: 'new', // new with tags
  uln: 'like new',
  ug: 'good',
  uf: 'fair',
};

type PoshmarkPost = {
  id?: string;
  title?: string;
  price_amount?: { val?: string; currency_code?: string };
  size?: string;
  condition?: string | null;
  picture_url?: string;
  cover_shot?: { path?: string; picture?: string };
  inventory?: { status?: string };
  first_published_at?: string;
  created_at?: string;
  description?: string;
  pictures?: { url?: string; url_small?: string; url_large?: string }[];
  brand?: string;
  colors?: { name?: string }[];
  creator_username?: string;
  aggregates?: { likes?: number };
  /** e.g. { message_id: "women" }; also "men", "kids", "home". */
  department?: { message_id?: string; display?: string };
};

type PoshmarkResponse = {
  data?: PoshmarkPost[];
  more?: { next_max_id?: string };
};

/** Poshmark slugifies the title into the listing URL. */
function toSlug(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .replace(/-+$/, '');
}

export async function scrapePoshmark(query: string, pages = DEFAULT_PAGES): Promise<Item[]> {
  try {
    const headers = {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    const seen = new Set<string>();
    const items: Item[] = [];
    let maxId: string | undefined;

    for (let page = 0; page < pages; page += 1) {
      const request: Record<string, unknown> = {
        filters: { department: 'All' },
        query,
      };
      // Must live inside `request`, not the query string.
      if (maxId) request.max_id = maxId;

      const url =
        `${ENDPOINT}?request=${encodeURIComponent(JSON.stringify(request))}` +
        `&count=${PER_PAGE}`;

      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });
      if (!response.ok) break;

      const data: PoshmarkResponse = await response.json();
      const posts = data.data ?? [];
      if (posts.length === 0) break;

      for (const post of posts) {
        if (!post.id || seen.has(post.id)) continue;
        // Sold and reserved listings can't be bought.
        if (post.inventory?.status && post.inventory.status !== 'available') continue;
        seen.add(post.id);
        items.push(toItem(post));
      }

      maxId = data.more?.next_max_id;
      if (!maxId) break;
    }

    return items;
  } catch (error) {
    console.error('Poshmark scraper error:', error);
    return [];
  }
}

function toItem(post: PoshmarkPost): Item {
  const title = post.title ?? 'Untitled listing';
  const amount = Number.parseFloat(post.price_amount?.val ?? '');
  const condition = post.condition ? CONDITION_MAP[post.condition] : undefined;

  // Prefer the ready-made CDN url; fall back to assembling it from cover_shot.
  const image =
    post.picture_url ??
    (post.cover_shot?.path && post.cover_shot?.picture
      ? `https://di2ponv0v5otw.cloudfront.net/${post.cover_shot.path}/m_${post.cover_shot.picture}`
      : '');

  return {
    id: `poshmark-${post.id}`,
    platform: 'poshmark',
    title,
    price: Number.isFinite(amount) ? amount : 0,
    currency: post.price_amount?.currency_code ?? 'USD',
    size: post.size?.trim() ? post.size.trim().toUpperCase() : null,
    condition: condition ?? null,
    image_url: image,
    // The bare-id URL 301s to this slug form; build it directly.
    external_url: `https://poshmark.com/listing/${toSlug(title)}-${post.id}`,
    listed_at: post.first_published_at ?? post.created_at ?? null,

    description: post.description ?? null,
    // The search payload already carries every picture (up to ~15).
    images: (post.pictures ?? [])
      .map((p) => p.url_large ?? p.url)
      .filter((u): u is string => Boolean(u)),
    brand: post.brand ?? null,
    color: post.colors?.[0]?.name ?? null,
    seller: { name: post.creator_username ?? null, rating: null, location: null },
    favourites: post.aggregates?.likes ?? null,
    gender:
      post.department?.message_id === 'women'
        ? 'women'
        : post.department?.message_id === 'men'
          ? 'men'
          : null,
  };
}
