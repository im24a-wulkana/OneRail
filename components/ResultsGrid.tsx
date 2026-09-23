'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import type { Item, Filters } from '@/lib/types';
import { applyFilters, type SortKey } from '@/lib/filters';
import ItemCard from './ItemCard';

// Re-exported so existing imports from this component keep working.
export { applyFilters };
export type { SortKey };

interface ResultsGridProps {
  items: Item[];
  filters: Filters;
  sortBy?: SortKey;
  isLoading?: boolean;
  favorites?: Record<string, boolean>;
  onFavoriteToggle?: (item: Item) => void;
  onClearFilters?: () => void;
  onOpen?: (item: Item) => void;
}

const GRID = 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4';

/**
 * How many cards exist at once.
 *
 * A search can return well over a thousand listings, and rendering them all at
 * once queues just as many image requests. Next's optimizer works through them
 * at roughly five a second, so a fast scroll outruns it — and because lazy
 * loading only fires on scroll, the skipped images never load at all. Growing
 * the list in batches keeps the queue short enough to keep up.
 */
const BATCH = 60;

export default function ResultsGrid({
  items,
  filters,
  sortBy = 'relevance',
  isLoading = false,
  favorites = {},
  onFavoriteToggle,
  onClearFilters,
  onOpen,
}: ResultsGridProps) {
  const visible = useMemo(() => applyFilters(items, filters, sortBy), [items, filters, sortBy]);

  const [shown, setShown] = useState(BATCH);
  const sentinel = useRef<HTMLDivElement>(null);

  // A new result set is a different list, so start counting from the top again.
  // Adjusting during render avoids the extra pass a setState-in-effect costs.
  const [lastKey, setLastKey] = useState(visible.length);
  if (lastKey !== visible.length) {
    setLastKey(visible.length);
    setShown(BATCH);
  }

  const rendered = useMemo(() => visible.slice(0, shown), [visible, shown]);
  const hasMore = shown < visible.length;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;

    // rootMargin loads the next batch slightly before the sentinel is reached,
    // so the grid stays ahead of the scroll instead of stalling at the bottom.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown((count) => Math.min(count + BATCH, visible.length));
        }
      },
      { rootMargin: '600px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, visible.length]);

  if (isLoading) {
    return (
      <div className={GRID} aria-busy="true" aria-label="Loading results">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="skeleton aspect-square !rounded-none" />
            <div className="flex flex-col gap-2 p-3">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-2/3" />
              <div className="skeleton mt-1 h-4 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (visible.length === 0) {
    const filtered = items.length > 0;
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--r-lg)] border border-dashed border-[var(--hairline)] px-6 py-20 text-center">
        <SearchX size={28} className="text-[var(--text-faint)]" strokeWidth={1.5} />
        <p className="font-display text-lg text-[var(--text)]">
          {filtered ? 'Nothing matches those filters' : 'No listings found'}
        </p>
        <p className="max-w-sm text-sm text-[var(--text-muted)]">
          {filtered
            ? `All ${items.length} results were filtered out. Try widening your price range or clearing a filter.`
            : 'Try a different search term — a brand name usually works better than a description.'}
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {filtered && onClearFilters && (
            <button type="button" onClick={onClearFilters} className="btn btn-secondary">
              Clear filters
            </button>
          )}
          {/* Without this the no-results state is a dead end. */}
          <Link href="/" className="btn btn-secondary">
            New search
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={GRID}>
        {rendered.map((item, i) => (
          <ItemCard
            key={item.id}
            item={item}
            index={i}
            isFavorite={favorites[item.id] ?? false}
            onFavoriteToggle={onFavoriteToggle}
            onOpen={onOpen}
          />
        ))}
      </div>

      {hasMore && (
        <div ref={sentinel} className="flex justify-center py-8" aria-hidden="true">
          <span className="text-sm text-[var(--text-faint)]">
            <span className="tnum">{visible.length - shown}</span> more listings
          </span>
        </div>
      )}
    </>
  );
}
