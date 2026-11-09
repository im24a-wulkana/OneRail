import type { Item, Filters } from './types';
import { matchesCategories, normalizeCategoryIds } from './categories';
import { genderOf } from './gender';
import { normalizeSize } from './sizes';

/** Selected sizes, folding in the single `size` older saved searches carry. */
export function selectedSizes(filters: Filters): string[] {
  const sizes = filters.sizes ?? [];
  return filters.size && !sizes.includes(filters.size) ? [...sizes, filters.size] : sizes;
}

export type SortKey = 'relevance' | 'price-low' | 'price-high' | 'newest';

/**
 * Filtering and sorting shared by the results grid and the saved-search
 * checker. It lives here rather than in the grid component so server routes
 * can apply the exact same rules without pulling in React.
 */
export function applyFilters(items: Item[], filters: Filters, sortBy: SortKey): Item[] {
  let result = items;

  if (filters.platforms?.length) {
    result = result.filter((i) => filters.platforms!.includes(i.platform));
  }
  if (filters.genders?.length) {
    // Only listings positively tagged with an unselected gender are dropped.
    // Most eBay, Vinted and Mercari listings carry no gender at all, and
    // hiding them would empty those platforms out; they're treated as unisex.
    const want = new Set(filters.genders);
    result = result.filter((i) => {
      const gender = genderOf(i);
      return gender === null || want.has(gender);
    });
  }
  if (filters.garments?.length) {
    const categories = normalizeCategoryIds(filters.garments);
    const subcategories = filters.subcategories ?? [];
    result = result.filter((i) => matchesCategories(i.title, categories, subcategories));
  }
  if (filters.minPrice !== undefined) {
    result = result.filter((i) => i.price >= filters.minPrice!);
  }
  if (filters.maxPrice !== undefined) {
    result = result.filter((i) => i.price <= filters.maxPrice!);
  }
  const sizes = selectedSizes(filters);
  if (sizes.length) {
    // Compare normalised values so "US 10", "EU 44", "2XL" and "40 R" all
    // match the corresponding selection. A listing matches if it is any of
    // the selected sizes.
    const want = new Set(sizes.map((s) => normalizeSize(s) ?? s.toUpperCase()));
    result = result.filter((i) => {
      const size = normalizeSize(i.size);
      return size !== null && want.has(size);
    });
  }
  if (filters.condition) {
    const want = filters.condition.toLowerCase();
    result = result.filter((i) => i.condition?.toLowerCase() === want);
  }

  // Copy before sorting so we never mutate the caller's array.
  const sorted = [...result];
  switch (sortBy) {
    case 'price-low':
      sorted.sort((a, b) => a.price - b.price);
      break;
    case 'price-high':
      sorted.sort((a, b) => b.price - a.price);
      break;
    case 'newest':
      sorted.sort((a, b) => {
        // Undated listings sink to the bottom rather than freezing the order.
        const at = a.listed_at ? new Date(a.listed_at).getTime() : -Infinity;
        const bt = b.listed_at ? new Date(b.listed_at).getTime() : -Infinity;
        return bt - at;
      });
      break;
  }
  return sorted;
}
