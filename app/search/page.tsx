import { Suspense } from 'react';
import { connection } from 'next/server';
import Navbar from '@/components/Navbar';
import SearchContent from './SearchContent';

export default async function SearchPage() {
  // Render per request instead of prerendering at build time. The results
  // depend entirely on `?q=`, and the prerendered (query-less) shell left the
  // client router unable to navigate after a direct load of /search?q=…, so
  // every later search silently did nothing in production.
  await connection();

  return (
    <>
      <Navbar />
      <Suspense fallback={<SearchFallback />}>
        <SearchContent />
      </Suspense>
    </>
  );
}

function SearchFallback() {
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="skeleton mb-8 h-12 max-w-2xl" />
      <div className="skeleton mb-6 h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="skeleton aspect-square !rounded-none" />
            <div className="flex flex-col gap-2 p-3">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
