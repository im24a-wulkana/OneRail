/**
 * Category taxonomy for the results filter: top-level categories, each split
 * into subcategories.
 *
 * This is separate from `Garment` in lib/garment.ts on purpose. That one is
 * tuned for the sold-price comparison, where loosening or tightening a bucket
 * changes which sales count as comparables. This one is tuned for browsing.
 *
 * Classification runs on the title. Japanese terms are included because
 * Mercari titles arrive untranslated.
 */

export type Subcategory = { id: string; label: string };
export type Category = { id: string; label: string; subcategories: Subcategory[] };

export const CATEGORIES: Category[] = [
  {
    id: 'outerwear',
    label: 'Outerwear',
    subcategories: [
      { id: 'jackets', label: 'Jackets' },
      { id: 'coats', label: 'Coats' },
      { id: 'puffers', label: 'Puffers' },
      { id: 'vests', label: 'Vests' },
      { id: 'blazers', label: 'Blazers' },
    ],
  },
  {
    id: 'hoodies',
    label: 'Hoodies & Sweats',
    subcategories: [
      { id: 'hoodies', label: 'Hoodies' },
      { id: 'zip-hoodies', label: 'Zip hoodies' },
      { id: 'sweatshirts', label: 'Sweatshirts' },
    ],
  },
  {
    id: 'knitwear',
    label: 'Knitwear',
    subcategories: [
      { id: 'sweaters', label: 'Sweaters' },
      { id: 'cardigans', label: 'Cardigans' },
    ],
  },
  {
    id: 'tops',
    label: 'Tops',
    subcategories: [
      { id: 'tees', label: 'T-shirts' },
      { id: 'longsleeves', label: 'Long sleeves' },
      { id: 'shirts', label: 'Shirts' },
      { id: 'polos', label: 'Polos' },
      { id: 'tanks', label: 'Tank tops' },
    ],
  },
  {
    id: 'bottoms',
    label: 'Bottoms',
    subcategories: [
      { id: 'jeans', label: 'Jeans' },
      { id: 'pants', label: 'Pants' },
      { id: 'sweatpants', label: 'Sweatpants' },
      { id: 'shorts', label: 'Shorts' },
    ],
  },
  {
    id: 'dresses',
    label: 'Dresses & Skirts',
    subcategories: [
      { id: 'dresses', label: 'Dresses' },
      { id: 'skirts', label: 'Skirts' },
    ],
  },
  {
    id: 'shoes',
    label: 'Shoes',
    subcategories: [
      { id: 'sneakers', label: 'Sneakers' },
      { id: 'boots', label: 'Boots' },
      { id: 'dress-shoes', label: 'Loafers & dress' },
      { id: 'sandals', label: 'Sandals & slides' },
      { id: 'other-shoes', label: 'Other shoes' },
    ],
  },
  {
    id: 'bags',
    label: 'Bags',
    subcategories: [
      { id: 'backpacks', label: 'Backpacks' },
      { id: 'totes', label: 'Totes' },
      { id: 'crossbody', label: 'Crossbody & shoulder' },
      { id: 'other-bags', label: 'Other bags' },
    ],
  },
  {
    id: 'accessories',
    label: 'Accessories',
    subcategories: [
      { id: 'hats', label: 'Hats' },
      { id: 'jewelry', label: 'Jewelry & watches' },
      { id: 'eyewear', label: 'Eyewear' },
      { id: 'belts', label: 'Belts' },
      { id: 'wallets', label: 'Wallets' },
      { id: 'scarves', label: 'Scarves & gloves' },
      { id: 'other-accessories', label: 'Other' },
    ],
  },
];

/**
 * Title patterns, checked in order; the first match wins. The order is
 * deliberate and cuts across categories:
 *  - outerwear first, so "denim jacket" and "hooded jacket" are jackets;
 *  - shorts before jeans, so "denim shorts" are shorts;
 *  - sweatpants before sweatshirts, so "スウェットパンツ" is not a top;
 *  - bottoms before shoes, so "boot cut jeans" stays jeans;
 *  - shirts and shoes before dresses, so "dress shirt" / "dress shoes" don't
 *    land in Dresses.
 */
const PATTERNS: [subcategory: string, pattern: RegExp][] = [
  // Outerwear
  ['blazers', /\b(blazer|sport[\s-]?coat|suit jacket)\b|テーラード/i],
  // ボタンダウン is a button-down shirt, not a down jacket.
  ['puffers', /\b(puffer|down jacket|down coat|nuptse)\b|(?<!ボタン)ダウン/i],
  ['vests', /\b(?<!sweater )(vest|gilet)\b|ベスト/i],
  ['coats', /\b(coat|overcoat|topcoat|peacoat|trench|parka|raincoat)\b|コート/i],
  [
    'jackets',
    /\b(jacket|bomber|windbreaker|anorak|shacket|overshirt|varsity|letterman|outerwear)\b|ジャケット|ブルゾン|アウター/i,
  ],
  // Bottoms that would otherwise be caught by sweatshirt/denim patterns
  ['sweatpants', /\b(sweatpants|sweat pants|joggers|track ?pants)\b|スウェットパンツ|ジャージパンツ/i],
  ['shorts', /\b(shorts|jorts)\b|ショーツ|ハーフパンツ|短パン/i],
  // Hoodies & sweats
  [
    'zip-hoodies',
    /\b(zip[\s-]?up|full[\s-]?zip|zip)\b.*\b(hoodie|hoody|hooded)\b|\b(hoodie|hoody)\b.*\bzip|ジップパーカー|ジップアップ/i,
  ],
  ['hoodies', /\b(hoodie|hoody|hooded)\b|パーカー|フーディ/i],
  // A bare "crewneck" is usually a sweatshirt, but not a "crewneck sweater".
  [
    'sweatshirts',
    /\b(sweatshirt|crew[\s-]?neck(?!\s+(sweater|knit|jumper|cardigan)))\b|スウェット|トレーナー/i,
  ],
  // Knit hats before knitwear, so a "knit beanie" is a hat.
  ['hats', /\b(beanie|knit (hat|cap)|bucket hat)\b|ニット帽/i],
  // Knitwear
  ['cardigans', /\b(cardigan)\b|カーディガン/i],
  ['sweaters', /\b(sweater|knit|knitwear|jumper|pullover|fleece)\b|ニット|セーター/i],
  // Tops
  ['longsleeves', /\b(long[\s-]?sleeve|longsleeve|l\/s)\b|ロンt|ロングスリーブ|長袖/i],
  ['tees', /\b(tee|t[\s-]?shirt|tshirt)\b|[tTｔ]シャツ|ティーシャツ|半袖/i],
  // "Polo Ralph Lauren" is a brand, not a polo shirt.
  ['polos', /\bpolo\b(?!\s+(ralph|by\b|rl\b|sport|jeans|country))|ポロシャツ/i],
  ['tanks', /\b(tank top|tank|singlet|camisole|cami)\b|タンクトップ|キャミ/i],
  [
    'shirts',
    /\b(shirt|button[\s-]?up|button[\s-]?down|oxford shirt|flannel|blouse)\b|(?<![tTｔ]|ティー)シャツ(?!ワンピ)|ブラウス/i,
  ],
  // Bottoms
  ['jeans', /\b(jeans|denim pants|selvedge)\b|デニム|ジーンズ|ジーパン/i],
  ['pants', /\b(pants|trousers|chinos|slacks|cargos|cargo pants)\b|パンツ|スラックス|ズボン/i],
  // Shoes
  ['sneakers', /\b(sneakers?|trainers|runners|running shoes)\b|スニーカー/i],
  ['boots', /\b(boots?|chelsea)\b|ブーツ/i],
  ['dress-shoes', /\b(loafers?|derbys?|derbies|brogues?|dress shoes|oxfords|mules)\b|ローファー|革靴/i],
  ['sandals', /\b(sandals?|slides|flip[\s-]?flops|clogs)\b|サンダル/i],
  ['other-shoes', /\b(shoes|footwear|heels|pumps|flats)\b|シューズ|靴(?!下)/i],
  // Dresses & skirts
  ['skirts', /\b(skirt)\b|スカート/i],
  ['dresses', /\b(dress|gown)\b|ワンピース|ドレス/i],
  // Bags
  ['backpacks', /\b(backpack|rucksack|knapsack)\b|リュック|バックパック/i],
  ['totes', /\b(tote)\b|トート/i],
  ['crossbody', /\b(crossbody|cross[\s-]body|shoulder bag|messenger|sling bag|sling)\b|ショルダー/i],
  ['other-bags', /\b(bag|duffle|duffel|pouch|clutch|purse|handbag)\b|バッグ|カバン|鞄/i],
  // Accessories
  ['hats', /\b(cap|hat|beanie|snapback|trucker|balaclava)\b|帽子|キャップ|ハット|ニット帽/i],
  [
    'jewelry',
    /\b(necklace|bracelet|ring|earrings?|pendant|watch|brooch|anklet)\b|ネックレス|ブレスレット|指輪|リング|ピアス|時計/i,
  ],
  ['eyewear', /\b(sunglasses|glasses|eyewear|shades)\b|サングラス|メガネ/i],
  ['belts', /\b(belt)\b|ベルト/i],
  ['wallets', /\b(wallet|card holder|cardholder|coin purse)\b|財布/i],
  ['scarves', /\b(scarf|scarves|gloves|mittens|shawl)\b|マフラー|手袋|ストール/i],
  ['other-accessories', /\b(socks?|tie|keychain|bandana|headband|umbrella|cufflinks)\b|靴下|ネクタイ/i],
];

const CATEGORY_OF_SUB = new Map<string, string>();
for (const category of CATEGORIES) {
  for (const sub of category.subcategories) CATEGORY_OF_SUB.set(sub.id, category.id);
}

/** Subcategory id for a listing title, or null when it names no garment. */
export function subcategoryOf(title: string): string | null {
  for (const [sub, pattern] of PATTERNS) {
    if (pattern.test(title)) return sub;
  }
  return null;
}

/** Top-level category id that a subcategory belongs to. */
export function categoryOfSubcategory(sub: string): string | null {
  return CATEGORY_OF_SUB.get(sub) ?? null;
}

/**
 * Saved searches made before this taxonomy stored the old five group names.
 * Map them onto the new categories so those searches keep working.
 */
const LEGACY_GROUPS: Record<string, string[]> = {
  Jackets: ['outerwear', 'hoodies', 'knitwear'],
  Shirts: ['tops'],
  Pants: ['bottoms'],
  Shoes: ['shoes'],
  Accessories: ['accessories', 'bags'],
};

export function normalizeCategoryIds(ids: string[]): string[] {
  return [...new Set(ids.flatMap((id) => LEGACY_GROUPS[id] ?? [id]))];
}

/**
 * Whether a title matches the selected categories and subcategories.
 *
 * Picking a category matches everything in it; picking subcategories inside
 * that category narrows it to just those. Categories with no subcategory
 * picked stay whole, so "Shoes + Hoodies › Zip hoodies" means all shoes plus
 * zip hoodies only.
 */
export function matchesCategories(
  title: string,
  categoryIds: string[],
  subcategoryIds: string[],
): boolean {
  const sub = subcategoryOf(title);
  // A title naming no garment matches nothing rather than being kept,
  // otherwise selecting "Shoes" would still show every unclassified listing.
  if (!sub) return false;
  const category = categoryOfSubcategory(sub);
  if (!category || !categoryIds.includes(category)) return false;

  const narrowing = subcategoryIds.filter((s) => categoryOfSubcategory(s) === category);
  return narrowing.length === 0 || narrowing.includes(sub);
}
