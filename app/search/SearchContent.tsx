'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Filter, Heart, SearchX, Shirt } from 'lucide-react';
import type { Item, Filters, Platform } from '@/lib/types';
import FilterPanel, { countActiveFilters } from '@/components/FilterPanel';
import ResultsGrid, { applyFilters, type SortKey } from '@/components/ResultsGrid';
import SearchBar from '@/components/SearchBar';
import SearchHistory from '@/components/SearchHistory';
import SaveSearchButton from '@/components/SaveSearchButton';
import ListingDetail from '@/components/ListingDetail';
import { PLATFORMS, LIVE_PLATFORM_COUNT, spellNumber } from '@/lib/platforms';
import { recordSearch } from '@/lib/history';
import { useFavorites } from '@/lib/useFavorites';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'price-low', label: 'Price: low to high' },
  { value: 'price-high', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest first' },
];

export default function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';

  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(query));
  const [filters, setFilters] = useState<Filters>({});
  const [sortBy, setSortBy] = useState<SortKey>('relevance');
  const [error, setError] = useState<string | null>(null);
  // Number of loosely-matching listings the relevance filter removed.
  const [filteredOut, setFilteredOut] = useState(0);
  const [strict, setStrict] = useState(true);
  const [apparelOnly, setApparelOnly] = useState(true);
  const [nonApparelFiltered, setNonApparelFiltered] = useState(0);
  const [openItem, setOpenItem] = useState<Item | null>(null);

  // Reset refinements when the search term changes. Adjusting state during
  // render (rather than in an effect) avoids a second render pass showing the
  // previous query's filters. See react.dev "You Might Not Need an Effect".
  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setFilters({});
    setSortBy('relevance');
    setFilteredOut(0);
    setNonApparelFiltered(0);
    // Clearing the query has no fetch to run, so settle the list here.
    if (!query) {
      setItems([]);
      setError(null);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
  }

  useEffect(() => {
    if (!query) return;

    // Abort the in-flight request if the query changes mid-fetch, so a slow
    // earlier response can't overwrite a newer one.
    const controller = new AbortController();

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, strict, apparelOnly }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Search failed (${response.status})`);
        const data = await response.json();
        const results: Item[] = Array.isArray(data.data) ? data.data : [];
        setItems(results);
        setFilteredOut(typeof data.filtered === 'number' ? data.filtered : 0);
        setNonApparelFiltered(
          typeof data.nonApparelFiltered === 'number' ? data.nonApparelFiltered : 0,
        );
        // Only remember searches that actually found something, so typos and
        // dead ends don't pollute the For You feed.
        if (results.length > 0) recordSearch(query);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError("We couldn't reach the marketplaces just now. Try again in a moment.");
        setItems([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [query, strict, apparelOnly]);

  const counts = useMemo(() => {
    const acc: Partial<Record<Platform, number>> = {};
    for (const item of items) acc[item.platform] = (acc[item.platform] ?? 0) + 1;
    return acc;
  }, [items]);

  const visibleCount = useMemo(
    () => applyFilters(items, filters, sortBy).length,
    [items, filters, sortBy],
  );

  const { favorites, toggleFavorite, requiresAuth, dismissAuthPrompt } = useFavorites();

  const activeFilters = countActiveFilters(filters);

  if (!query) {
    return (
      <main id="main" className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <SearchX size={30} className="mx-auto text-[var(--text-faint)]" strokeWidth={1.5} />
        <h1 className="mt-4 font-display text-2xl">What are you hunting for?</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Enter a brand, garment, or size to search {spellNumber(LIVE_PLATFORM_COUNT)}{' '}
          marketplaces at once.
        </p>
        <div className="mt-8">
          <SearchBar autoFocus />
        </div>
        <SearchHistory className="mt-8 text-left" />
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--accent)]"
        >
          <ArrowLeft size={15} />
          Back to home
        </Link>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-8">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--accent)]"
      >
        <ArrowLeft size={15} />
        Back to home
      </Link>

      <div className="mb-5 max-w-2xl sm:mb-8">
        {/* Keyed on the query so the input follows the URL when it changes
            without typing — a recent-search chip, or Back/Forward. */}
        <SearchBar key={query} initialQuery={query} size="md" />
        <SearchHistory className="mt-4" limit={6} />
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-6 sm:gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">
            {query}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]" aria-live="polite">
            {isLoading ? (
              `Searching ${spellNumber(LIVE_PLATFORM_COUNT)} marketplaces…`
            ) : (
              <>
                <span className="tnum font-medium text-[var(--text)]">{visibleCount}</span>{' '}
                {visibleCount === 1 ? 'listing' : 'listings'}
                {activeFilters > 0 && items.length !== visibleCount && (
                  <span className="text-[var(--text-faint)]"> of {items.length}</span>
                )}
              </>
            )}
          </p>
        </div>

        {/* On a phone these secondary toggles each wrapped onto their own
            full-width row, pushing the listings themselves below the fold.
            Scrolling them sideways keeps them reachable without spending the
            vertical space the results need. */}
        <div className="swipe-row -mx-4 flex w-[calc(100%+2rem)] items-center justify-start gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <SaveSearchButton query={query} filters={filters} items={items} />

          {(nonApparelFiltered > 0 || !apparelOnly) && (
            <button
              type="button"
              onClick={() => setApparelOnly((v) => !v)}
              className="btn btn-ghost shrink-0 whitespace-nowrap text-sm"
              title={
                apparelOnly
                  ? 'Show fragrance, cosmetics and other non-wearable listings'
                  : 'Hide listings that are not clothing or accessories'
              }
            >
              <Shirt size={15} />
              {apparelOnly ? (
                <>
                  <span className="tnum">{nonApparelFiltered}</span> non-clothing hidden
                </>
              ) : (
                'Clothing only'
              )}
            </button>
          )}

          {(filteredOut > 0 || !strict) && (
            <button
              type="button"
              onClick={() => setStrict((v) => !v)}
              className="btn btn-ghost shrink-0 whitespace-nowrap text-sm"
              title={
                strict
                  ? 'Show listings that only loosely match your search'
                  : 'Hide listings that don’t closely match your search'
              }
            >
              {strict ? (
                <>
                  <Filter size={15} />
                  <span className="tnum">{filteredOut}</span> loose match
                  {filteredOut === 1 ? '' : 'es'} hidden
                </>
              ) : (
                <>
                  <Filter size={15} />
                  Hide loose matches
                </>
              )}
            </button>
          )}
          <label htmlFor="sort" className="sr-only">
            Sort results
          </label>
          <select
            id="sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="field !w-auto !py-2 text-sm"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-[var(--r-md)] border border-[var(--danger)] bg-[var(--danger-wash)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Result-source summary: shows which marketplaces actually returned rows. */}
      {!isLoading && !error && items.length > 0 && (
        <div className="swipe-row -mx-4 mb-5 flex w-[calc(100%+2rem)] items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {Object.entries(counts).map(([id, count]) => (
            <span
              key={id}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--r-pill)] border border-[var(--hairline)] px-2.5 py-1 text-xs text-[var(--text-muted)]"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: PLATFORMS[id as Platform].color }}
                aria-hidden="true"
              />
              {PLATFORMS[id as Platform].label}
              <span className="tnum text-[var(--text-faint)]">{count}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <FilterPanel filters={filters} onFiltersChange={setFilters} counts={counts} />

        <div className="min-w-0 flex-1">
          <ResultsGrid
            items={items}
            filters={filters}
            sortBy={sortBy}
            isLoading={isLoading}
            favorites={favorites}
            onFavoriteToggle={toggleFavorite}
            onClearFilters={() => setFilters({})}
            onOpen={setOpenItem}
          />
        </div>
      </div>


      {requiresAuth && (
        <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center sm:p-6">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={dismissAuthPrompt}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-prompt-title"
            className="relative w-full max-w-sm rounded-t-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--bg)] p-6 text-center shadow-[var(--shadow-lg)] sm:rounded-[var(--r-lg)]"
          >
            <Heart size={26} className="mx-auto text-[var(--accent)]" strokeWidth={1.5} />
            <h2 id="save-prompt-title" className="mt-3 font-display text-xl">
              Sign in to save listings
            </h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Create a free account to keep listings from every marketplace in one place.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Link href="/register" className="btn btn-primary flex-1">
                Create account
              </Link>
              <Link href="/login" className="btn btn-secondary flex-1">
                Sign in
              </Link>
            </div>
            <button
              type="button"
              onClick={dismissAuthPrompt}
              className="btn btn-ghost mt-2 w-full text-sm"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      <ListingDetail
        item={openItem}
        onClose={() => setOpenItem(null)}
        isFavorite={openItem ? (favorites[openItem.id] ?? false) : false}
        onFavoriteToggle={toggleFavorite}
      />
    </main>
  );
}
