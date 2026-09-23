'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Heart, ImageOff, Plane, TrendingDown } from 'lucide-react';
import type { Item } from '@/lib/types';
import { PLATFORMS, formatPrice, relativeTime } from '@/lib/platforms';

interface ItemCardProps {
  item: Item;
  isFavorite?: boolean;
  onFavoriteToggle?: (item: Item) => void;
  /** Stagger index for the entrance animation. */
  index?: number;
  /** When provided, the card opens the detail view instead of the marketplace. */
  onOpen?: (item: Item) => void;
}

export default function ItemCard({
  item,
  isFavorite = false,
  onFavoriteToggle,
  index = 0,
  onOpen,
}: ItemCardProps) {
  const [imageBroken, setImageBroken] = useState(false);

  const platform = PLATFORMS[item.platform];
  const listed = relativeTime(item.listed_at);
  const hasImage = Boolean(item.image_url) && !imageBroken;

  return (
    <article
      className="card group relative flex flex-col overflow-hidden transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--hairline-strong)] hover:shadow-[var(--shadow-md)] rise"
      style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
    >
      <div className="relative aspect-square overflow-hidden bg-[var(--bg-subtle)]">
        {hasImage ? (
          <Image
            src={item.image_url}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            onError={() => setImageBroken(true)}
            // Marketplace thumbnails already arrive at 13-27 KB, so resizing
            // them buys little and funnels every card through one optimizer
            // that manages ~5 images a second. Served straight from the CDN
            // they load in parallel instead.
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--text-faint)]">
            <ImageOff size={22} strokeWidth={1.5} />
            <span className="text-xs">No photo</span>
          </div>
        )}

        {/* Platform chip */}
        <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-[var(--r-pill)] bg-[rgba(12,10,8,0.72)] px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: platform.color }}
            aria-hidden="true"
          />
          {platform.label}
        </span>

        {/* Sits above the stretched link so it stays clickable. */}
        {onFavoriteToggle && (
          <button
            type="button"
            onClick={() => onFavoriteToggle(item)}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? `Remove ${item.title} from saved` : `Save ${item.title}`}
            className="absolute right-2 top-2 z-20 grid h-10 w-10 place-items-center rounded-full sm:h-8 sm:w-8 bg-[rgba(12,10,8,0.72)] text-white backdrop-blur-sm transition-transform hover:scale-110 active:scale-95"
          >
            <Heart
              size={16}
              className={isFavorite ? 'fill-[var(--danger)] stroke-[var(--danger)]' : ''}
            />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="clamp-2 text-sm leading-snug text-[var(--text)]">
          {/* Stretched link makes the whole card a single hit target without
              nesting interactive elements inside an anchor. */}
          {onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(item)}
              className="text-left after:absolute after:inset-0 after:z-10 after:content-[''] hover:text-[var(--accent)]"
            >
              {item.title}
            </button>
          ) : (
            <a
              href={item.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="after:absolute after:inset-0 after:z-10 after:content-[''] hover:text-[var(--accent)]"
            >
              {item.title}
            </a>
          )}
        </h3>

        <div className="mt-auto flex items-baseline justify-between gap-2 pt-1">
          <span className="flex items-baseline gap-1.5">
            <span className="tnum text-base font-semibold text-[var(--accent)]">
              {formatPrice(item.price, item.currency)}
            </span>
            {item.saved_price && item.saved_price.amount > item.price && (
              <span className="tnum text-[11px] text-[var(--text-faint)] line-through">
                {formatPrice(item.saved_price.amount, item.saved_price.currency)}
              </span>
            )}
          </span>
          {listed && (
            <time
              dateTime={item.listed_at ?? undefined}
              className="text-[11px] text-[var(--text-faint)]"
            >
              {listed}
            </time>
          )}
        </div>

        {item.saved_price && item.saved_price.amount > item.price && (
          <span className="inline-flex w-fit items-center gap-1 rounded-[var(--r-sm)] bg-[var(--accent-wash)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
            <TrendingDown size={10} />
            {Math.round((1 - item.price / item.saved_price.amount) * 100)}% off
          </span>
        )}

        {item.unavailable && (
          <span className="inline-flex w-fit items-center rounded-[var(--r-sm)] border border-[var(--danger)] px-1.5 py-0.5 text-[10px] text-[var(--danger)]">
            No longer listed
          </span>
        )}

        {item.proxy && (
          <span
            title={item.proxy.note}
            className="inline-flex w-fit items-center gap-1 rounded-[var(--r-sm)] border border-[var(--hairline)] px-1.5 py-0.5 text-[10px] text-[var(--text-faint)]"
          >
            <Plane size={10} />
            via {item.proxy.service}
          </span>
        )}

        {(item.size || item.condition) && (
          <div className="flex flex-wrap gap-1.5">
            {item.size && (
              <span className="rounded-[var(--r-sm)] border border-[var(--hairline)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]">
                {item.size}
              </span>
            )}
            {item.condition && (
              <span className="rounded-[var(--r-sm)] border border-[var(--hairline)] px-1.5 py-0.5 text-[11px] capitalize text-[var(--text-muted)]">
                {item.condition}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
