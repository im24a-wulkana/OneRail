import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Navbar from '@/components/Navbar';
import SearchBar from '@/components/SearchBar';
import SearchHistory from '@/components/SearchHistory';
import PopularSearches from '@/components/PopularSearches';
import { getSessionUser } from '@/lib/auth';
import { getPopularSearches } from '@/lib/popular';
import {
  PLATFORMS,
  PLATFORM_IDS,
  LIVE_PLATFORM_COUNT,
  livePlatformSentence,
  spellNumber,
} from '@/lib/platforms';

export default async function Home() {
  // The sign-up pitch is only an invitation while there is no account to make.
  // Popular terms are fetched here rather than seeded from a hardcoded list, so
  // the first paint already shows the real ranking; the old placeholder always
  // put a curated term above the genuinely most-searched ones.
  const [user, popular] = await Promise.all([getSessionUser(), getPopularSearches()]);

  return (
    <>
      <Navbar />

      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-[var(--hairline)]">
          {/* Warm ambient wash behind the headline */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.55]"
            style={{
              background:
                'radial-gradient(70% 55% at 50% 0%, var(--accent-wash) 0%, transparent 70%)',
            }}
          />

          <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-28">
            <p className="eyebrow mb-5">
              {spellNumber(LIVE_PLATFORM_COUNT)} marketplaces · one search
            </p>

            <h1 className="font-display text-4xl leading-[1.05] sm:text-6xl">
              Every secondhand rail,
              <br />
              <span className="text-[var(--accent)]">searched at once.</span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-base text-[var(--text-muted)] sm:text-lg">
              Stop opening {spellNumber(LIVE_PLATFORM_COUNT)} tabs. OneRail queries{' '}
              {livePlatformSentence()} together — then sorts the whole pile by price.
            </p>

            <div className="mx-auto mt-9 max-w-2xl">
              <SearchBar autoFocus />
            </div>

            <PopularSearches initial={popular.terms} />

            <SearchHistory className="mx-auto mt-8 max-w-xl text-left" />
          </div>
        </section>

        {/* Marketplace strip */}
        <section className="border-b border-[var(--hairline)] bg-[var(--bg-subtle)]">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6">
            {PLATFORM_IDS.map((id) => {
              const platform = PLATFORMS[id];
              return (
                <span
                  key={id}
                  title={platform.live ? undefined : platform.note}
                  className={`inline-flex items-center gap-2 text-sm font-medium ${
                    platform.live
                      ? 'text-[var(--text-muted)]'
                      : 'text-[var(--text-faint)] opacity-60'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: platform.live ? platform.color : 'var(--text-faint)',
                    }}
                    aria-hidden="true"
                  />
                  {platform.label}
                  {!platform.live && (
                    <span className="text-[10px] uppercase tracking-wide">soon</span>
                  )}
                </span>
              );
            })}
          </div>
        </section>

        {/* How it works — numbered because it is a genuine sequence */}
        <section className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6">
          <h2 className="font-display text-2xl sm:text-3xl">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                n: '01',
                title: 'Search once',
                body: 'One query fans out to every marketplace at once. Slow platforms time out instead of holding up the rest.',
              },
              {
                n: '02',
                title: 'Compare like for like',
                body: 'Listings are normalised to one shape — price, size, condition, all in USD — so a Vinted hoodie sits next to a Mercari one.',
              },
              {
                n: '03',
                title: 'Buy at the source',
                body: 'Every card links straight to the original listing. OneRail never sits between you and the seller.',
              },
            ].map((step) => (
              <li key={step.n} className="card p-6">
                <span className="tnum font-display text-3xl text-[var(--accent)]">{step.n}</span>
                <h3 className="mt-3 text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Account CTA — nothing to offer someone who is already signed in. */}
        {!user && (
          <section className="border-t border-[var(--hairline)] bg-[var(--bg-subtle)]">
            <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-5 px-4 py-14 sm:px-6 md:flex-row">
              <div>
                <h2 className="font-display text-2xl">Keep the good finds</h2>
                <p className="mt-2 max-w-md text-sm text-[var(--text-muted)]">
                  Save listings and searches to your account, and pick up the hunt where you left
                  it.
                </p>
              </div>
              <Link href="/register" className="btn btn-primary shrink-0">
                Create a free account
                <ArrowRight size={16} />
              </Link>
            </div>
          </section>
        )}

        <footer className="border-t border-[var(--hairline)]">
          <div className="mx-auto max-w-[1400px] px-4 py-8 text-center text-xs text-[var(--text-faint)] sm:px-6">
            OneRail links to listings on third-party marketplaces. Prices and availability are
            set by the sellers.
          </div>
        </footer>
      </main>
    </>
  );
}
