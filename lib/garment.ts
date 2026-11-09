/**
 * Garment classification for the sold-price comparison, which must not price
 * a tee against hoodies. The results filter has its own, finer taxonomy in
 * lib/categories.ts.
 *
 * Japanese terms are included because Mercari titles arrive untranslated —
 * translating each one would mean a DeepL call per listing.
 */

export type Garment =
  | 'outerwear'
  | 'hoodie'
  | 'knitwear'
  | 'shirt'
  | 'tee'
  | 'longsleeve'
  | 'jeans'
  | 'pants'
  | 'shorts'
  | 'skirt'
  | 'dress'
  | 'footwear'
  | 'bag'
  | 'accessory';

/**
 * Patterns that decide what a listing actually is, so a $900 tee is not priced
 * against hoodies. Japanese terms are included because Mercari titles arrive
 * untranslated here — translating every sold title would mean a DeepL call per
 * comparison, which is too slow and burns quota.
 *
 * Order matters: the first match wins, so more specific categories come first.
 * "denim jacket" must read as outerwear rather than jeans, and a long-sleeve
 * tee must not be compared against short-sleeve ones.
 */
const GARMENT_PATTERNS: [Garment, RegExp][] = [
  [
    'outerwear',
    /\b(jacket|coat|anorak|parka|windbreaker|bomber|blazer|overshirt|shacket|outerwear|peacoat|trench|puffer|vest|gilet)\b|ジャケット|コート|ブルゾン|アウター|ダウン|ベスト/i,
  ],
  ['hoodie', /\b(hoodie|hoody|hooded)\b|パーカー|フーディ/i],
  [
    'knitwear',
    /\b(sweater|knitwear|cardigan|jumper|crewneck|sweatshirt|pullover|fleece)\b|ニット|セーター|カーディガン|スウェット|トレーナー/i,
  ],
  // Long sleeve before tee: "long sleeve tee" is its own bracket.
  ['longsleeve', /\b(long[\s-]?sleeve|longsleeve|l\/s)\b|ロンt|ロングスリーブ|長袖/i],
  // Tee before shirt: "Tシャツ" is a T-shirt, but a bare シャツ pattern would
  // claim it first and price tees against button-ups.
  ['tee', /\b(tee|t[\s-]?shirt|tshirt)\b|[tTｔ]シャツ|ティーシャツ|半袖/i],
  [
    'shirt',
    /\b(shirt|button[\s-]?up|button[\s-]?down|oxford|flannel|polo)\b|(?<![tTｔ]|ティー)シャツ(?!ワンピ)|ポロ/i,
  ],
  ['jeans', /\b(jeans|denim pants)\b|デニム|ジーンズ|ジーパン/i],
  ['shorts', /\b(shorts)\b|ショーツ|ハーフパンツ|短パン/i],
  ['pants', /\b(pants|trousers|chinos|slacks|cargos|joggers|sweatpants)\b|パンツ|スラックス|ズボン/i],
  ['skirt', /\b(skirt)\b|スカート/i],
  ['dress', /\b(dress|gown)\b|ワンピース|ドレス/i],
  [
    'footwear',
    /\b(sneakers|trainers|shoes|boots|boot|loafers|sandals|slides)\b|スニーカー|シューズ|ブーツ|靴/i,
  ],
  ['bag', /\b(bag|backpack|rucksack|tote|duffle|pouch|clutch)\b|バッグ|リュック|カバン/i],
  [
    'accessory',
    /\b(wallet|belt|cap|hat|beanie|scarf|gloves|socks|tie|sunglasses|watch|necklace|bracelet|ring|keychain)\b|財布|ベルト|帽子|マフラー|手袋|靴下/i,
  ],
];

/**
 * Best guess at what a title is selling, or null when nothing matches — a title
 * like "Dior Homme Hedi 05 indigo" names no garment at all.
 */
export function garmentOf(title: string): Garment | null {
  for (const [garment, pattern] of GARMENT_PATTERNS) {
    if (pattern.test(title)) return garment;
  }
  return null;
}

/**
 * Categories close enough that mixing them keeps a sample honest while
 * salvaging comparables, since sellers use these labels interchangeably.
 */
const INTERCHANGEABLE: Garment[][] = [
  ['shirt', 'longsleeve'],
  ['pants', 'jeans'],
];

/** Whether a sold listing is the same kind of garment as the one being priced. */
export function sameGarment(target: Garment, candidate: Garment): boolean {
  if (target === candidate) return true;
  return INTERCHANGEABLE.some((group) => group.includes(target) && group.includes(candidate));
}
