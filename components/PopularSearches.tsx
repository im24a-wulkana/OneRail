import Link from 'next/link';

/**
 * Most-searched terms on this site, ranked by `lib/popular.ts`.
 *
 * The ranking arrives already resolved from the server. It used to be seeded
 * with a hardcoded list and re-fetched on mount, which meant a curated term
 * rendered above the real leaders on every load before being swapped out.
 */
export default function PopularSearches({ initial }: { initial: string[] }) {
  const terms = initial;

  if (terms.length === 0) return null;

  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
      <span className="text-xs text-[var(--text-faint)]">Popular:</span>
      {terms.map((term) => (
        <Link
          key={term}
          href={`/search?q=${encodeURIComponent(term)}`}
          className="inline-flex items-center rounded-[var(--r-pill)] border border-[var(--hairline)] px-3 py-2 text-xs sm:py-1 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          {term}
        </Link>
      ))}
    </div>
  );
}
