import { NextResponse } from 'next/server';
import { getPopularSearches } from '@/lib/popular';

/** Most-run searches on this site. See `lib/popular.ts` for the ranking. */
export const revalidate = 300;

export async function GET() {
  const result = await getPopularSearches();
  return NextResponse.json(result);
}
