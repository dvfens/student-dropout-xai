import clsx from 'clsx';
import { useId, useMemo, useState, type ReactNode } from 'react';
import type { CellValue } from '../api/types';
import { formatNumber, formatPercent, formatPValue, isPValueColumn } from '../lib/format';

export type ColumnFormat = 'auto' | 'number' | 'pvalue' | 'percent' | 'boolean' | 'text';

export interface ColumnDef<Row> {
  /** Property name in the row object. */
  key: keyof Row & string;
  /** Header text; defaults to the key with underscores replaced by spaces. */
  header?: ReactNode;
  /**
   * How to display values. "auto" (default): booleans -> badge, numbers -> pvalue if the
   * column name looks like a p-value, otherwise fixed decimals; strings as-is.
   */
  format?: ColumnFormat;
  /** Decimals for "number" / "percent" (overrides the table default). */
  decimals?: number;
  /** Custom cell renderer; sorting and search still use the raw value. */
  render?: (row: Row) => ReactNode;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  /** Tooltip / explanation shown on the header (title attribute). */
  description?: string;
}

export type SortDirection = 'asc' | 'desc';

export interface DataTableProps<Row extends Record<string, CellValue>> {
  rows: Row[];
  /** Column keys or full definitions. Defaults to every key of the first row. */
  columns?: Array<(keyof Row & string) | ColumnDef<Row>>;
  /** Default decimals for numbers (default 3). */
  decimals?: number;
  /** Show the search box (default true). */
  searchable?: boolean;
  searchPlaceholder?: string;
  initialSort?: { key: keyof Row & string; direction: SortDirection };
  /** Visually hidden caption for screen readers (recommended). */
  caption?: string;
  /** Limit the height and scroll vertically with a sticky header, e.g. "28rem". */
  maxHeight?: string;
  /** Highlight a row (e.g. significant results). */
  rowClassName?: (row: Row) => string | undefined;
  emptyMessage?: string;
  className?: string;
}

const TRUE_STRINGS = new Set(['true', 'yes']);
const FALSE_STRINGS = new Set(['false', 'no']);

function asBoolean(value: CellValue): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (TRUE_STRINGS.has(v)) return true;
    if (FALSE_STRINGS.has(v)) return false;
  }
  return null;
}

function humanize(key: string): string {
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function compareValues(a: CellValue, b: CellValue): number {
  // Nulls always sort last (handled by the caller for direction).
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function BooleanBadge({ value }: { value: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        value
          ? 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800'
          : 'bg-slate-100 text-slate-600 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600',
      )}
    >
      {value ? 'Yes' : 'No'}
    </span>
  );
}

/**
 * Generic results table: sortable headers (aria-sort), search across all columns,
 * consistent number / p-value / boolean formatting, horizontal scroll on small screens.
 */
export function DataTable<Row extends Record<string, CellValue>>({
  rows,
  columns,
  decimals = 3,
  searchable = true,
  searchPlaceholder = 'Search table…',
  initialSort,
  caption,
  maxHeight,
  rowClassName,
  emptyMessage = 'No rows match your search.',
  className,
}: DataTableProps<Row>) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(initialSort ?? null);

  const cols: ColumnDef<Row>[] = useMemo(() => {
    const source = columns ?? (Object.keys(rows[0] ?? {}) as Array<keyof Row & string>);
    return source.map((c) => (typeof c === 'string' ? { key: c } : c));
  }, [columns, rows]);

  const resolveFormat = (col: ColumnDef<Row>, value: CellValue): ColumnFormat => {
    if (col.format && col.format !== 'auto') return col.format;
    if (asBoolean(value) !== null) return 'boolean';
    if (typeof value === 'number') return isPValueColumn(col.key) ? 'pvalue' : 'number';
    return 'text';
  };

  const displayText = (col: ColumnDef<Row>, value: CellValue): string => {
    if (value === null || value === undefined) return '–';
    switch (resolveFormat(col, value)) {
      case 'pvalue':
        return typeof value === 'number' ? formatPValue(value) : String(value);
      case 'number':
        return typeof value === 'number' ? formatNumber(value, col.decimals ?? decimals) : String(value);
      case 'percent':
        return typeof value === 'number' ? formatPercent(value, col.decimals ?? 1) : String(value);
      case 'boolean': {
        const b = asBoolean(value);
        return b === null ? String(value) : b ? 'Yes' : 'No';
      }
      default:
        return String(value);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      cols.some((col) => {
        const raw = row[col.key];
        if (raw === null || raw === undefined) return false;
        return String(raw).toLowerCase().includes(q) || displayText(col, raw).toLowerCase().includes(q);
      }),
    );
    // displayText only depends on cols and decimals, which are listed.
  }, [rows, cols, query, decimals]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((ra, rb) => {
      const a = ra[sort.key];
      const b = rb[sort.key];
      const aNull = a === null || a === undefined;
      const bNull = b === null || b === undefined;
      if (aNull || bNull) return aNull === bNull ? 0 : aNull ? 1 : -1;
      return compareValues(a, b) * factor;
    });
  }, [filtered, sort]);

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };

  const alignClass = (col: ColumnDef<Row>, sample: CellValue) => {
    const align = col.align ?? (typeof sample === 'number' ? 'right' : 'left');
    return align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  };

  const sampleRow = rows[0];

  return (
    <div className={clsx('min-w-0', className)}>
      {searchable && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={searchId} className="sr-only">
            Search table
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 sm:max-w-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
            {sorted.length === rows.length ? `${rows.length} rows` : `${sorted.length} of ${rows.length} rows`}
          </span>
        </div>
      )}
      <div
        className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-800"
        style={maxHeight ? { maxHeight } : undefined}
        tabIndex={0}
        role="region"
        aria-label={caption ?? 'Data table'}
      >
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
            <tr>
              {cols.map((col) => {
                const sortable = col.sortable ?? true;
                const active = sort?.key === col.key;
                const ariaSort = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
                const label = col.header ?? humanize(col.key);
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={sortable ? ariaSort : undefined}
                    title={col.description}
                    className={clsx(
                      'px-3 py-2 font-semibold whitespace-nowrap text-slate-700 dark:text-slate-200',
                      alignClass(col, sampleRow?.[col.key] ?? null),
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="inline-flex items-center gap-1 rounded hover:text-indigo-700 dark:hover:text-indigo-300"
                      >
                        {label}
                        <span aria-hidden="true" className={clsx('text-xs', !active && 'opacity-30')}>
                          {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sorted.map((row, i) => (
                <tr
                  key={i}
                  className={clsx('hover:bg-slate-50 dark:hover:bg-slate-900', rowClassName?.(row))}
                >
                  {cols.map((col) => {
                    const value = row[col.key];
                    const fmt = value === null || value === undefined ? 'text' : resolveFormat(col, value);
                    const bool = fmt === 'boolean' ? asBoolean(value) : null;
                    return (
                      <td
                        key={col.key}
                        className={clsx(
                          'px-3 py-2 text-slate-700 dark:text-slate-300',
                          alignClass(col, value),
                          (fmt === 'number' || fmt === 'pvalue' || fmt === 'percent') && 'tabular-nums whitespace-nowrap',
                        )}
                      >
                        {col.render
                          ? col.render(row)
                          : bool !== null
                            ? <BooleanBadge value={bool} />
                            : displayText(col, value)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
