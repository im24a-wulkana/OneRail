import { Item } from '../types';

/**
 * Vinted no longer exposes a usable JSON API.
 *
 * `/api/v2/catalog/items` — the endpoint this scraper used to call — now
 * answers 404 on every country domain, and no versioned variant replaced it.
 * The catalogue page itself still renders results server-side, so listings are
 * parsed out of that HTML instead.
 *
 * The markup is stable enough to target: every card carries
 * `data-testid="product-item-id-<id>"` plus matching `--description-title`,
 * `--price-text` and `--description-subtitle` nodes. That is still markup
 * rather than a contract, so a layout change will break this — the parser
 * returns whatever it can and the orchestrator carries on without Vinted.
 */
const BASE = 'https://www.vinted.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/** One catalogue page renders 96 cards, the same cap the old API had. */
const DEFAULT_PAGES = 3;
const REQUEST_TIMEOUT = 9000;

/** Vinted's human-readable condition strings → the app's vocabulary. */
const CONDITION_MAP: Record<string, string> = {
  'new with tags': 'new',
  'new without tags': 'new',
  'very good': 'like new',
  good: 'good',
  satisfactory: 'fair',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Turns the URL slug into a title.
 *
 * The card's title node holds only the brand ("Carhartt"), while the slug
 * carries what the seller actually wrote — `/items/123-carhartt-scrub-pants`.
 */
function titleFromSlug(path: string, fallback: string): string {
  const slug = path.match(/\/items\/\d+-([^?#]+)/)?.[1];
  if (!slug) return fallback;
  const words = decodeURIComponent(slug).replace(/-/g, ' ').trim();
  if (!words) return fallback;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Splits "W32 · New without tags" into its size and condition halves. */
function parseSubtitle(subtitle: string | undefined): {
  size: string | null;
  condition: string | null;
} {
  if (!subtitle) return { size: null, condition: null };

  const parts = subtitle
    .split('·')
    .map((part) => decodeEntities(part).trim())
    .filter(Boolean);

  let size: string | null = null;
  let condition: string | null = null;

  for (const part of parts) {
    const mapped = CONDITION_MAP[part.toLowerCase()];
    if (mapped) condition = mapped;
    else if (!size) size = part.toUpperCase();
  }

  return { size, condition };
}

function parsePrice(text: string | undefined): { amount: number; currency: string } {
  if (!text) return { amount: 0, currency: 'EUR' };

  const cleaned = decodeEntities(text).trim();
  // Amounts arrive as "$18.00", "18,00 €" or "£18.00" depending on the domain.
  const numeric = cleaned.replace(/[^0-9.,]/g, '').replace(/\.(?=\d{3}\b)/g, '');
  const amount = Number.parseFloat(numeric.replace(',', '.'));

  const currency = cleaned.includes('$')
    ? 'USD'
    : cleaned.includes('£')
      ? 'GBP'
      : cleaned.includes('€')
        ? 'EUR'
        : 'EUR';

  return { amount: Number.isFinite(amount) ? amount : 0, currency };
}

function parsePage(html: string): Item[] {
  const items: Item[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/data-testid="product-item-id-(\d+)"/g)) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);

    // Each card's nodes sit close together; a bounded window keeps one card's
    // fields from being picked up by the next.
    const start = Math.max(0, match.index - 2500);
    const card = html.slice(start, match.index + 7000);

    const href = card.match(new RegExp(`href="(/items/${id}[^"]*)"`))?.[1];
    if (!href) continue;

    const brand = card
      .match(new RegExp(`product-item-id-${id}--description-title[^>]*>([^<]{1,120})<`))?.[1]
      ?.trim();
    const priceText = card.match(
      new RegExp(`product-item-id-${id}--price-text[^>]*>([^<]{1,40})<`),
    )?.[1];
    const subtitle = card.match(
      new RegExp(`product-item-id-${id}--description-subtitle[^>]*>([^<]{1,80})<`),
    )?.[1];
    const image = card.match(/<img[^>]+src="(https:\/\/images\d*\.vinted\.net[^"]+)"/)?.[1];

    const { amount, currency } = parsePrice(priceText);
    const { size, condition } = parseSubtitle(subtitle);
    const path = decodeEntities(href);

    items.push({
      id: `vinted-${id}`,
      platform: 'vinted',
      title: titleFromSlug(path, brand ? decodeEntities(brand) : 'Untitled listing'),
      price: amount,
      currency,
      size,
      condition,
      image_url: image ? decodeEntities(image) : '',
      external_url: `${BASE}${path.split('?')[0]}`,
      // The catalogue markup carries no listing date.
      listed_at: null,
      description: null,
      images: image ? [decodeEntities(image)] : [],
      brand: brand ? decodeEntities(brand) : null,
      color: null,
      seller: null,
      total_price: null,
      favourites: null,
    });
  }

  return items;
}

export async function scrapeVinted(query: string, pages = DEFAULT_PAGES): Promise<Item[]> {
  try {
    const responses = await Promise.allSettled(
      Array.from({ length: pages }, (_, i) => {
        const url =
          `${BASE}/catalog?search_text=${encodeURIComponent(query)}` +
          (i > 0 ? `&page=${i + 1}` : '');
        return fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        }).then((response) => (response.ok ? response.text() : null));
      }),
    );

    const items: Item[] = [];
    const seen = new Set<string>();

    for (const response of responses) {
      if (response.status !== 'fulfilled' || !response.value) continue;
      for (const item of parsePage(response.value)) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
      }
    }

    if (items.length === 0) {
      console.error('Vinted: catalogue page returned no parsable listings');
    }

    return items;
  } catch (error) {
    console.error('Vinted scraper error:', error);
    return [];
  }
}
