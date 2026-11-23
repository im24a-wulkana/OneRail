'use client';

import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type { Filters, Gender, Platform } from '@/lib/types';
import { PLATFORMS, LIVE_PLATFORM_IDS } from '@/lib/platforms';
import { CATEGORIES, categoryOfSubcategory, normalizeCategoryIds } from '@/lib/categories';
import { GENDERS } from '@/lib/gender';
import { selectedSizes } from '@/lib/filters';
import { SIZE_GROUPS, type SizeGroupId } from '@/lib/sizes';

const CONDITIONS = ['new', 'like new', 'good', 'fair'];

interface FilterPanelProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  /** Per-platform result counts, used to annotate the platform list. */
  counts?: Partial<Record<Platform, number>>;
}

export function countActiveFilters(f: Filters): number {
  return (
    (f.platforms?.length ? 1 : 0) +
    (f.genders?.length ? 1 : 0) +
    (f.garments?.length ? 1 : 0) +
    (f.minPrice !== undefined || f.maxPrice !== undefined ? 1 : 0) +
    (selectedSizes(f).length ? 1 : 0) +
    (f.condition ? 1 : 0)
  );
}

/** Adds or removes `value`, returning undefined for an empty list. */
function toggle<T>(list: T[] | undefined, value: T): T[] | undefined {
  const current = list ?? [];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return next.length ? next : undefined;
}

export default function FilterPanel({ filters, onFiltersChange, counts }: FilterPanelProps) {
  const [open, setOpen] = useState(false);
  const [sizeGroup, setSizeGroup] = useState<SizeGroupId>('alpha');
  const active = countActiveFilters(filters);

  const activeSizeGroup = SIZE_GROUPS.find((g) => g.id === sizeGroup) ?? SIZE_GROUPS[0];
  const sizes = selectedSizes(filters);
  const categories = normalizeCategoryIds(filters.garments ?? []);
  const subcategories = filters.subcategories ?? [];

  const toggleGender = (gender: Gender) =>
    onFiltersChange({ ...filters, genders: toggle(filters.genders, gender) });

  const toggleSize = (value: string) =>
    // `size` is the legacy single-size field; fold it into `sizes` on first edit.
    onFiltersChange({ ...filters, size: undefined, sizes: toggle(sizes, value) });

  const toggleCategory = (id: string) => {
    const next = toggle(categories, id);
    // Dropping a category drops any subcategories picked inside it.
    const keptSubs = subcategories.filter((s) => next?.includes(categoryOfSubcategory(s) ?? ''));
    onFiltersChange({
      ...filters,
      garments: next,
      subcategories: keptSubs.length ? keptSubs : undefined,
    });
  };

  const toggleSubcategory = (id: string) =>
    onFiltersChange({ ...filters, subcategories: toggle(filters.subcategories, id) });

  const togglePlatform = (platform: Platform) => {
    const current = filters.platforms ?? [];
    const next = current.includes(platform)
      ? current.filter((p) => p !== platform)
      : [...current, platform];
    onFiltersChange({ ...filters, platforms: next.length ? next : undefined });
  };

  // Empty string must clear the bound rather than become NaN.
  const priceHandler = (key: 'minPrice' | 'maxPrice') => (value: string) => {
    const parsed = value === '' ? undefined : Number(value);
    onFiltersChange({
      ...filters,
      [key]: parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
    });
  };

  const body = (
    <div className="flex flex-col gap-6">
      <Section title="Gender">
        <div className="flex flex-wrap gap-1.5">
          {GENDERS.map(({ id, label }) => (
            <Chip
              key={id}
              selected={filters.genders?.includes(id) ?? false}
              onClick={() => toggleGender(id)}
            >
              {label}
            </Chip>
          ))}
        </div>
        {filters.genders?.length ? (
          <p className="mt-2 text-[11px] leading-snug text-[var(--text-faint)]">
            Listings with no gender stated are kept as unisex.
          </p>
        ) : null}
      </Section>

      <Section title="Price">
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="Min"
            value={filters.minPrice ?? ''}
            onChange={(e) => priceHandler('minPrice')(e.target.value)}
            aria-label="Minimum price"
            className="field tnum !py-2 text-sm"
          />
          <span className="text-[var(--text-faint)]">–</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="Max"
            value={filters.maxPrice ?? ''}
            onChange={(e) => priceHandler('maxPrice')(e.target.value)}
            aria-label="Maximum price"
            className="field tnum !py-2 text-sm"
          />
        </div>
      </Section>

      <Section title="Size">
        {/* Grailed indexes clothing, waist, shoe and tailoring sizes in
            separate namespaces, so the picker mirrors those groups. */}
        <div
          role="tablist"
          aria-label="Size category"
          className="mb-2.5 flex flex-wrap gap-1"
        >
          {SIZE_GROUPS.map((group) => {
            const active = group.id === sizeGroup;
            const picked = group.options.filter((o) => sizes.includes(o.value)).length;
            return (
              <button
                key={group.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSizeGroup(group.id)}
                className={`rounded-[var(--r-sm)] px-2 py-1 text-[11px] font-medium transition ${
                  active
                    ? 'bg-[var(--accent-wash)] text-[var(--accent)]'
                    : 'text-[var(--text-faint)] hover:text-[var(--text)]'
                }`}
              >
                {group.label}
                {picked > 0 && (
                  <span className="tnum ml-1 rounded-[var(--r-pill)] bg-[var(--accent)] px-1 text-[10px] text-[var(--accent-contrast)]">
                    {picked}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="thin-scroll flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
          {activeSizeGroup.options.map((option) => (
            <Chip
              key={option.value}
              selected={sizes.includes(option.value)}
              title={option.label}
              onClick={() => toggleSize(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>

        {sizes.length > 0 && (
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[var(--text-faint)]">
            <span className="truncate" title={sizes.join(', ')}>
              {sizes.length} selected: {sizes.join(', ')}
            </span>
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, size: undefined, sizes: undefined })}
              className="shrink-0 font-medium text-[var(--accent)] hover:underline"
            >
              Clear
            </button>
          </div>
        )}
      </Section>

      <Section title="Type">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((category) => (
            <Chip
              key={category.id}
              selected={categories.includes(category.id)}
              onClick={() => toggleCategory(category.id)}
            >
              {category.label}
            </Chip>
          ))}
        </div>

        {/* Subcategories appear under each picked category. Picking none keeps
            the whole category; picking some narrows it to just those. */}
        {CATEGORIES.filter((c) => categories.includes(c.id)).map((category) => (
          <div
            key={category.id}
            className="mt-3 border-l-2 border-[var(--hairline)] pl-2.5"
          >
            <p className="mb-1.5 text-[11px] font-medium text-[var(--text-faint)]">
              {category.label}
            </p>
            <div className="flex flex-wrap gap-1">
              {category.subcategories.map((sub) => (
                <Chip
                  key={sub.id}
                  small
                  selected={subcategories.includes(sub.id)}
                  onClick={() => toggleSubcategory(sub.id)}
                >
                  {sub.label}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Condition">
        <div className="flex flex-wrap gap-1.5">
          {CONDITIONS.map((condition) => {
            const selected = filters.condition === condition;
            return (
              <button
                key={condition}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  onFiltersChange({ ...filters, condition: selected ? undefined : condition })
                }
                className={`rounded-[var(--r-sm)] border px-2.5 py-1.5 text-xs font-medium capitalize transition ${
                  selected
                    ? 'border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent)]'
                    : 'border-[var(--hairline)] text-[var(--text-muted)] hover:border-[var(--hairline-strong)] hover:text-[var(--text)]'
                }`}
              >
                {condition}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Marketplace">
        <div className="flex flex-col gap-0.5">
          {LIVE_PLATFORM_IDS.map((id) => {
            const meta = PLATFORMS[id];
            const checked = filters.platforms?.includes(id) ?? false;
            const count = counts?.[id];
            return (
              <label
                key={id}
                className="flex cursor-pointer items-center gap-2.5 rounded-[var(--r-sm)] px-1.5 py-1.5 text-sm transition hover:bg-[var(--bg-subtle)]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePlatform(id)}
                  className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.color }}
                  aria-hidden="true"
                />
                <span className="flex-1 text-[var(--text)]">{meta.label}</span>
                {count !== undefined && (
                  <span className="tnum text-xs text-[var(--text-faint)]">{count}</span>
                )}
              </label>
            );
          })}
        </div>
      </Section>

      {active > 0 && (
        <button
          type="button"
          onClick={() => onFiltersChange({})}
          className="btn btn-secondary w-full text-sm"
        >
          Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-secondary w-full md:hidden"
        aria-expanded={open}
      >
        <SlidersHorizontal size={16} />
        Filters
        {active > 0 && (
          <span className="tnum ml-1 rounded-[var(--r-pill)] bg-[var(--accent)] px-1.5 text-xs text-[var(--accent-contrast)]">
            {active}
          </span>
        )}
      </button>

      {/* Desktop rail */}
      <aside className="hidden w-60 shrink-0 md:block">
        {/* The rail is sticky, so anything taller than the viewport could
            never be scrolled into view. Cap it and let it scroll itself. */}
        <div className="thin-scroll sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain pr-2 pb-4">
          <h2 className="eyebrow mb-4">Refine</h2>
          {body}
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="thin-scroll absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[var(--r-lg)] border-t border-[var(--hairline)] bg-[var(--bg)] p-5"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg">Filters</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn btn-ghost !p-2"
                aria-label="Close filters"
              >
                <X size={18} />
              </button>
            </div>
            {body}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn btn-primary mt-6 w-full"
            >
              Show results
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Chip({
  selected,
  onClick,
  title,
  small = false,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title?: string;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={title}
      onClick={onClick}
      className={`rounded-[var(--r-sm)] border font-medium transition ${
        small ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
      } ${
        selected
          ? 'border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent)]'
          : 'border-[var(--hairline)] text-[var(--text-muted)] hover:border-[var(--hairline-strong)] hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-0">
      <legend className="eyebrow mb-2.5">{title}</legend>
      {children}
    </fieldset>
  );
}
