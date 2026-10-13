'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Heart, ImageOff, Maximize2, X } from 'lucide-react';
import type { Item } from '@/lib/types';
import { PLATFORMS, formatPrice, relativeTime } from '@/lib/platforms';
import AuthenticityCheck from './AuthenticityCheck';
import ShareButton from './ShareButton';
import PriceComparison from './PriceComparison';

interface ListingDetailProps {
  item: Item | null;
  onClose: () => void;
  isFavorite?: boolean;
  onFavoriteToggle?: (item: Item) => void;
}

export default function ListingDetail({
  item,
  onClose,
  isFavorite = false,
  onFavoriteToggle,
}: ListingDetailProps) {
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Photos/description fetched on demand for platforms with thin search data.
  const [extra, setExtra] = useState<{ images: string[]; description: string | null } | null>(null);
  const [zoomed, setZoomed] = useState(false);

  // Reset the gallery when a different listing is opened. Adjusting state
  // during render avoids the extra pass a setState-in-effect would cause.
  const itemId = item?.id ?? null;
  const [lastId, setLastId] = useState(itemId);
  if (lastId !== itemId) {
    setLastId(itemId);
    setActive(0);
    setBroken({});
    setExtra(null);
    setZoomed(false);
  }

  // Grailed and Mercari both return a single photo in search; fetch the full
  // gallery (and Grailed's description) the first time the modal opens.
  const platformId = item?.platform;
  const needsDetail = platformId === 'grailed' || platformId === 'mercari';
  const listingId = item?.id.replace(/^(grailed|mercari)-/, '');

  useEffect(() => {
    if (!needsDetail || !listingId || !platformId) return;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/listing?platform=${platformId}&id=${listingId}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        const images = Array.isArray(data.images) ? data.images : [];
        setExtra({
          images,
          description: typeof data.description === 'string' ? data.description : null,
        });
        // The replacement gallery can be shorter than the one being browsed,
        // which otherwise left the counter reading past its end ("7 / 5").
        if (images.length > 0) setActive((i) => Math.min(i, images.length - 1));
      } catch {
        // Non-fatal: the cover shot from search is already rendered.
      }
    })();

    return () => controller.abort();
  }, [needsDetail, listingId, platformId]);

  // Close on Escape, lock background scroll, and restore focus on exit.
  useEffect(() => {
    if (!item) return;

    previouslyFocused.current = document.activeElement as HTMLElement;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Escape backs out of the lightbox first, then the modal.
        setZoomed((isZoomed) => {
          if (isZoomed) return false;
          onClose();
          return false;
        });
      }
      if (e.key === 'ArrowRight') setActive((i) => i + 1);
      if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, i - 1));
    };
    document.addEventListener('keydown', onKey);

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [item, onClose]);

  if (!item) return null;

  const platform = PLATFORMS[item.platform];
  const listed = relativeTime(item.listed_at);
  // Fall back to the card image when a platform gives no gallery.
  const gallery =
    extra?.images.length
      ? extra.images
      : item.images?.length
        ? item.images
        : item.image_url
          ? [item.image_url]
          : [];
  // A refetched gallery can shrink, so clamp on render too.
  const index = gallery.length ? Math.min(active, gallery.length - 1) : 0;
  const current = gallery[index];
  const description = item.description ?? extra?.description ?? null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-title"
        className="thin-scroll relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-y-auto rounded-t-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--bg)] shadow-[var(--shadow-lg)] sm:rounded-[var(--r-lg)]"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close listing"
          className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full sm:h-9 sm:w-9 bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--bg-subtle)]"
        >
          <X size={18} />
        </button>

        <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-2">
          {/* Gallery */}
          <div className="flex min-w-0 flex-col gap-3">
            <div className="group/img relative aspect-square overflow-hidden rounded-[var(--r-md)] bg-[var(--bg-subtle)]">
              {current && !broken[index] ? (
                <>
                  <button
                    type="button"
                    onClick={() => setZoomed(true)}
                    aria-label="View photo full size"
                    className="absolute inset-0 z-10 cursor-zoom-in"
                  >
                    <Image
                      src={current}
                      alt={item.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 45vw"
                      className="object-contain"
                      onError={() => setBroken((b) => ({ ...b, [index]: true }))}
                    />
                  </button>

                  <span className="pointer-events-none absolute right-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-full bg-[rgba(12,10,8,0.6)] text-white opacity-0 transition-opacity group-hover/img:opacity-100">
                    <Maximize2 size={15} />
                  </span>

                  {gallery.length > 1 && (
                    <>
                      <GalleryArrow
                        side="left"
                        disabled={index === 0}
                        onClick={() => setActive((i) => Math.max(0, i - 1))}
                      />
                      <GalleryArrow
                        side="right"
                        disabled={index === gallery.length - 1}
                        onClick={() => setActive((i) => Math.min(gallery.length - 1, i + 1))}
                      />
                      <span className="tnum pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-[var(--r-pill)] bg-[rgba(12,10,8,0.7)] px-2 py-0.5 text-[11px] text-white">
                        {index + 1} / {gallery.length}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-faint)]">
                  <ImageOff size={26} strokeWidth={1.5} />
                  <span className="text-xs">No photo</span>
                </div>
              )}
            </div>

            {gallery.length > 1 && (
              <div className="thin-scroll flex gap-2 overflow-x-auto pb-1">
                {gallery.map((src, i) => (
                  <button
                    key={src + i}
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`Photo ${i + 1} of ${gallery.length}`}
                    aria-current={i === index}
                    className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--r-sm)] border transition ${
                      i === index
                        ? 'border-[var(--accent)]'
                        : 'border-[var(--hairline)] opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Image src={src} alt="" fill sizes="64px" className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex min-w-0 flex-col gap-4">
            <div>
              {/* Room kept clear of the close button, which floats top-right
                  over the whole dialog. */}
              <div className="flex items-start justify-between gap-3 pr-10">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: platform.color }}
                    aria-hidden="true"
                  />
                  {platform.label}
                  {listed && (
                    <span className="font-normal text-[var(--text-faint)]">· {listed}</span>
                  )}
                </span>

                <div className="-mt-1.5 flex shrink-0 items-center gap-1">
                  {onFavoriteToggle && (
                    <button
                      type="button"
                      onClick={() => onFavoriteToggle(item)}
                      aria-pressed={isFavorite}
                      aria-label={isFavorite ? 'Remove from saved' : 'Save this listing'}
                      title={isFavorite ? 'Saved' : 'Save'}
                      className="btn btn-ghost btn-icon !p-2"
                    >
                      <Heart
                        size={17}
                        className={
                          isFavorite ? 'fill-[var(--danger)] stroke-[var(--danger)]' : ''
                        }
                      />
                    </button>
                  )}
                  {/* Shares the gallery and description fetched above, not the
                      thinner search payload, so the recipient sees every photo. */}
                  <ShareButton item={{ ...item, images: gallery, description }} />
                </div>
              </div>

              <h2 id="listing-title" className="mt-2 font-display text-xl leading-snug sm:text-2xl">
                {item.title}
              </h2>
            </div>

            <div className="flex items-baseline gap-3">
              <span className="tnum text-2xl font-semibold text-[var(--accent)]">
                {formatPrice(item.price, item.currency)}
              </span>
              {item.original_price && (
                <span className="tnum text-xs text-[var(--text-faint)]">
                  {formatPrice(item.original_price.amount, item.original_price.currency)} listed
                </span>
              )}
              {item.total_price != null && item.total_price > item.price && (
                <span className="tnum text-xs text-[var(--text-faint)]">
                  {formatPrice(item.total_price, item.currency)} with fees
                </span>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[var(--hairline)] py-4 text-sm">
              <Detail label="Size" value={item.size} />
              <Detail label="Condition" value={item.condition} capitalize />
              <Detail label="Brand" value={item.brand} />
              <Detail label="Colour" value={item.color} capitalize />
              <Detail label="Seller" value={item.seller?.name} />
              <Detail
                label="Seller rating"
                value={item.seller?.rating ? `${item.seller.rating.toFixed(1)} / 5` : null}
              />
              <Detail label="Location" value={item.seller?.location} />
              <Detail
                label="Saves"
                value={item.favourites != null ? String(item.favourites) : null}
              />
            </dl>

            {description && (
              /* Collapsed by default: a long description used to hold open a
                 fixed 12rem scroll box, which clipped mid-sentence and left
                 dead space under short ones. `details` brings its own keyboard
                 and screen-reader behaviour, so no state is needed. */
              <details className="group border-y border-[var(--hairline)] py-2.5">
                <summary className="flex min-h-[34px] cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden sm:min-h-0">
                  <span className="eyebrow">Description</span>
                  <ChevronDown
                    size={16}
                    className="shrink-0 text-[var(--text-faint)] transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-[var(--text-muted)]">
                  {description}
                </p>
              </details>
            )}

            {/* Save and share moved up beside the platform label, so the buy
                action stands alone here. No `mt-auto`: pushing this block to
                the bottom left a band of empty space on listings whose details
                run shorter than the gallery. */}
            <a
              href={item.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary w-full whitespace-nowrap"
            >
              {item.proxy ? `Buy via ${item.proxy.service}` : `View on ${platform.label}`}
              <ExternalLink size={15} />
            </a>

            {/* The two analysis tools belong together, and sit closer to each
                other than to the buy actions above. */}
            <div className="flex flex-col gap-2">
              <PriceComparison item={item} />

              <AuthenticityCheck
                item={item}
                images={gallery}
                imagesLoading={needsDetail && extra === null}
              />
            </div>

            {item.proxy && (
              <p className="rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-muted)]">
                <strong className="text-[var(--text)]">Ships from Japan.</strong> {item.proxy.note}{' '}
                The button opens {item.proxy.service}, which buys the item and forwards it to you.
              </p>
            )}

            <p className="text-xs text-[var(--text-faint)]">
              Listed and sold by a third-party seller on {platform.label}. OneRail handles no
              part of the purchase.
            </p>
          </div>
        </div>
      </div>

      {zoomed && current && (
        <Lightbox
          src={current}
          alt={item.title}
          index={index}
          total={gallery.length}
          onPrev={() => setActive((i) => Math.max(0, i - 1))}
          onNext={() => setActive((i) => Math.min(gallery.length - 1, i + 1))}
          onClose={() => setZoomed(false)}
        />
      )}
    </div>
  );
}

/** Full-screen photo viewer layered above the modal. */
function Lightbox({
  src,
  alt,
  index,
  total,
  onPrev,
  onNext,
  onClose,
}: {
  src: string;
  alt: string;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close full-size photo"
        className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <X size={20} />
      </button>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={onPrev}
            disabled={index === 0}
            aria-label="Previous photo"
            className="absolute left-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={index === total - 1}
            aria-label="Next photo"
            className="absolute right-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronRight size={22} />
          </button>
          <span className="tnum absolute bottom-5 left-1/2 -translate-x-1/2 rounded-[var(--r-pill)] bg-white/10 px-3 py-1 text-sm text-white">
            {index + 1} / {total}
          </span>
        </>
      )}

      {/* Clicking the backdrop closes; the image itself does not. */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative h-[85vh] w-[92vw] max-w-5xl">
        <Image src={src} alt={alt} fill sizes="92vw" className="object-contain" priority />
      </div>
    </div>
  );
}

function GalleryArrow({
  side,
  disabled,
  onClick,
}: {
  side: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Previous photo' : 'Next photo'}
      className={`absolute top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full sm:h-8 sm:w-8 bg-[rgba(12,10,8,0.6)] text-white transition hover:bg-[rgba(12,10,8,0.85)] disabled:opacity-0 ${
        side === 'left' ? 'left-2' : 'right-2'
      }`}
    >
      {side === 'left' ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
    </button>
  );
}

function Detail({
  label,
  value,
  capitalize,
}: {
  label: string;
  value?: string | null;
  capitalize?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className={`mt-0.5 text-[var(--text)] ${capitalize ? 'capitalize' : ''}`}>{value}</dd>
    </div>
  );
}
