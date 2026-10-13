import type { Item, Filters } from './types';
import { garmentGroupOf } from './garment';
import { normalizeSize } from './sizes';

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
  if (filters.garments?.length) {
    const want = new Set(filters.garments);
    // A title naming no garment matches nothing here rather than being kept,
    // otherwise selecting "Shoes" would still show every unclassified listing.
    result = result.filter((i) => {
      const group = garmentGroupOf(i.title);
      return group !== null && want.has(group);
    });
  }
  if (filters.minPrice !== undefined) {
    result = result.filter((i) => i.price >= filters.minPrice!);
  }
  if (filters.maxPrice !== undefined) {
    result = result.filter((i) => i.price <= filters.maxPrice!);
  }
  if (filters.size) {
    // Compare normalised values so "US 10", "EU 44", "2XL" and "40 R" all
    // match the corresponding selection.
    const want = normalizeSize(filters.size) ?? filters.size.toUpperCase();
    result = result.filter((i) => normalizeSize(i.size) === want);
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
