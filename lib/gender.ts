import type { Item, Gender } from './types';

/**
 * Men's / women's classification for the results filter.
 *
 * Grailed and Poshmark tag every listing with a department, which the
 * scrapers copy onto `item.gender`. Everywhere else we fall back to the
 * title, which only catches listings that say so outright ("Women's",
 * "Mens", "レディース"). Anything left unclassified is treated as unisex.
 */

export const GENDERS: { id: Gender; label: string }[] = [
  { id: 'men', label: 'Men' },
  { id: 'women', label: 'Women' },
];

const WOMEN =
  /\b(women'?s?|womens|woman'?s?|ladies|lady'?s|girls?'?|femme|damen|womenswear|maternity)\b|レディース|ウィメンズ/i;
const MEN = /\b(men'?s?|mens|man'?s|gentlemen'?s?|boys?'?|herren|menswear)\b|メンズ/i;
const UNISEX = /\bunisex\b|ユニセックス/i;

export function genderFromTitle(title: string): Gender | null {
  if (UNISEX.test(title)) return null;
  const women = WOMEN.test(title);
  const men = MEN.test(title);
  // A title naming both ("men's and women's sizing") says nothing useful.
  if (women === men) return null;
  return women ? 'women' : 'men';
}

/** The listing's gender, preferring the marketplace's own department. */
export function genderOf(item: Item): Gender | null {
  return item.gender ?? genderFromTitle(item.title);
}
