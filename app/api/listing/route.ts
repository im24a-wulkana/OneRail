import { NextResponse } from 'next/server';

/**
 * On-demand detail lookup for platforms whose search payload is incomplete.
 *
 * - Grailed: its Algolia index ships a single cover shot and no description,
 *   but the public listing API exposes both.
 * - Mercari: search returns one thumbnail, though photos are stored under a
 *   predictable `{id}_{n}.jpg` path. Probing stops at the first non-200.
 *
 * Vinted and Poshmark already return every photo in search, so they never
 * reach here.
 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const TIMEOUT = 7000;
/** Detail payloads are immutable enough to cache for the session. */
const CACHE_TTL = 30 * 60 * 1000;
const MAX_CACHE = 300;

type Detail = { images: string[]; description: string | null };

const cache = new Map<string, { value: Detail; expires: number }>();

function readCache(key: string): Detail | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key: string, value: Detail): void {
  // Bounded FIFO — this is a per-instance cache, not a store.
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL });
}

async function fetchGrailed(id: string): Promise<Detail> {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' };

  const [photosRes, listingRes] = await Promise.allSettled([
    fetch(`https://www.grailed.com/api/listings/${id}/photos`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT),
    }),
    fetch(`https://www.grailed.com/api/listings/${id}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT),
    }),
  ]);

  const images: string[] = [];
  if (photosRes.status === 'fulfilled' && photosRes.value.ok) {
    const json = await photosRes.value.json().catch(() => null);
    for (const photo of json?.data ?? []) {
      if (photo?.url) images.push(`${photo.url}?w=1200&fit=clip&auto=format`);
    }
  }

  let description: string | null = null;
  if (listingRes.status === 'fulfilled' && listingRes.value.ok) {
    const json = await listingRes.value.json().catch(() => null);
    const listing = json?.data;
    description = typeof listing?.description === 'string' ? listing.description : null;
    // The listing payload also carries photos; use them if the photos call failed.
    if (images.length === 0) {
      for (const photo of listing?.photos ?? []) {
        if (photo?.url) images.push(`${photo.url}?w=1200&fit=clip&auto=format`);
      }
    }
  }

  return { images, description };
}

/**
 * Mercari stores photos at a sequential path with no manifest, so we probe
 * upward until one 403s. Requests are HEAD and run in one batch, since a
 * listing rarely has more than ~10.
 */
async function fetchMercari(id: string): Promise<Detail> {
  const MAX_PHOTOS = 12;
  const base = `https://static.mercdn.net/item/detail/orig/photos/${id}_`;

  const checks = await Promise.all(
    Array.from({ length: MAX_PHOTOS }, (_, i) =>
      fetch(`${base}${i + 1}.jpg`, {
        method: 'HEAD',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT),
      })
        .then((r) => r.ok)
        .catch(() => false),
    ),
  );

  // Stop at the first gap: a later hit would be a different listing's photo.
  const images: string[] = [];
  for (let i = 0; i < checks.length; i += 1) {
    if (!checks[i]) break;
    images.push(`${base}${i + 1}.jpg`);
  }

  return { images, description: null };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const id = searchParams.get('id');

    if (platform !== 'grailed' && platform !== 'mercari') {
      return NextResponse.json(
        { error: 'That platform does not need a detail lookup.' },
        { status: 400 },
      );
    }

    // Validate the id shape per platform rather than proxying arbitrary paths.
    const valid =
      platform === 'grailed' ? /^\d+$/.test(id ?? '') : /^m\d{8,}$/.test(id ?? '');
    if (!valid) {
      return NextResponse.json({ error: 'A valid listing id is required.' }, { status: 400 });
    }

    const key = `${platform}:${id}`;
    const cached = readCache(key);
    if (cached) return NextResponse.json({ success: true, ...cached, cached: true });

    const detail =
      platform === 'grailed' ? await fetchGrailed(id!) : await fetchMercari(id!);
    // Only cache a result that actually carries photos. A fetch that times out
    // returns an empty gallery, and caching that pinned the listing to a single
    // photo for the next 30 minutes even though the platform had recovered.
    if (detail.images.length > 0) writeCache(key, detail);

    return NextResponse.json({ success: true, ...detail });
  } catch (error) {
    console.error('Listing detail error:', error);
    return NextResponse.json({ error: 'Could not load listing details.' }, { status: 500 });
  }
}
