import type { ReactNode } from 'react';
import { useChartTheme } from '../../hooks/useChartTheme';

export interface ContributionRow {
  key: string;
  /** Main label, e.g. "Subjects passed (semester 2) = 3". */
  label: ReactNode;
  /** Optional second line (e.g. the raw LIME rule). */
  detail?: ReactNode;
  /** Signed contribution. Positive = pushes towards the explained class. */
  value: number;
}

export interface ContributionChartProps {
  rows: ContributionRow[];
  /**
   * "waterfall": bars start where the previous one ended, beginning at `baseValue`.
   * "diverging": every bar starts at zero.
   */
  mode: 'waterfall' | 'diverging';
  baseValue?: number;
  /** Label for the starting row in waterfall mode. */
  baseLabel?: string;
  /** Label for the closing row in waterfall mode. */
  totalLabel?: string;
  /** Accessible description of the chart. */
  ariaLabel: string;
  decimals?: number;
  /** Override the bar colours (default: red towards / blue away). */
  colors?: { towards: string; away: string };
}

function signed(value: number, decimals: number): string {
  const text = Math.abs(value).toFixed(decimals);
  return value >= 0 ? `+${text}` : `−${text}`;
}

/**
 * Horizontal contribution bars drawn with plain HTML so labels wrap nicely on
 * phones. Red = pushes towards the explained class, blue = pushes away.
 */
export function ContributionChart({
  rows,
  mode,
  baseValue = 0,
  baseLabel = 'Starting point',
  totalLabel = 'Total',
  ariaLabel,
  decimals = 2,
  colors,
}: ContributionChartProps) {
  const ct = useChartTheme();
  const towardsColor = colors?.towards ?? ct.positive;
  const awayColor = colors?.away ?? ct.negative;
  // Bar colours can be too light for small text (e.g. #E45756 on white), so value labels use text-safe colours.
  const towardsText = colors ? ct.text : ct.positiveText;
  const awayText = colors ? ct.text : ct.negative;
  const origin = mode === 'waterfall' ? baseValue : 0;

  let running = origin;
  const segments = rows.map((row) => {
    const start = mode === 'waterfall' ? running : 0;
    const end = start + row.value;
    if (mode === 'waterfall') running = end;
    return { row, start, end };
  });
  const total = running;

  const points = [origin, 0, ...segments.flatMap((s) => [s.start, s.end])];
  let lo = Math.min(...points);
  let hi = Math.max(...points);
  const pad = (hi - lo || 1) * 0.06;
  lo -= pad;
  hi += pad;
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const originPos = pos(origin);

  const track = (content: ReactNode) => (
    <div className="relative h-6 min-w-0 rounded bg-slate-50 dark:bg-slate-800/40">
      <div
        className="absolute inset-y-0 w-px border-l border-dashed border-slate-400 dark:border-slate-500"
        style={{ left: `${originPos}%` }}
        aria-hidden="true"
      />
      {content}
    </div>
  );

  const marker = (v: number, color: string) => (
    <div
      className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px]"
      style={{ left: `${pos(v)}%`, backgroundColor: color }}
      aria-hidden="true"
    />
  );

  const rowClass = 'grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_3.5rem]';
  const labelClass = 'col-span-2 min-w-0 text-sm leading-snug text-slate-800 sm:col-span-1 dark:text-slate-200';
  const valueClass = 'text-right text-xs font-semibold tabular-nums';

  return (
    <div role="group" aria-label={ariaLabel} className="space-y-2.5">
      {mode === 'waterfall' && (
        <div className={rowClass}>
          <div className={labelClass}>
            <span className="text-slate-600 italic dark:text-slate-400">{baseLabel}</span>
          </div>
          {track(marker(origin, ct.mutedText))}
          <div className={valueClass} style={{ color: ct.mutedText }}>
            {origin.toFixed(decimals)}
          </div>
        </div>
      )}
      {segments.map(({ row, start, end }) => {
        const color = row.value >= 0 ? towardsColor : awayColor;
        const left = pos(Math.min(start, end));
        const width = Math.max(Math.abs(pos(end) - pos(start)), 0.8);
        return (
          <div key={row.key} className={rowClass}>
            <div className={labelClass}>
              <div className="break-words">{row.label}</div>
              {row.detail && (
                <div className="mt-0.5 font-mono text-[11px] break-words text-slate-500 dark:text-slate-400">
                  {row.detail}
                </div>
              )}
            </div>
            {track(
              <div
                className="absolute top-1 bottom-1 rounded-sm"
                style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
                aria-hidden="true"
              />,
            )}
            <div className={valueClass} style={{ color: row.value >= 0 ? towardsText : awayText }}>
              <span className="sr-only">{row.value >= 0 ? 'pushes towards, ' : 'pushes away, '}</span>
              {signed(row.value, decimals)}
            </div>
          </div>
        );
      })}
      {mode === 'waterfall' && (
        <div className={`${rowClass} border-t border-slate-200 pt-2.5 dark:border-slate-700`}>
          <div className={labelClass}>
            <span className="font-medium">{totalLabel}</span>
          </div>
          {track(marker(total, total >= origin ? towardsColor : awayColor))}
          <div className={valueClass} style={{ color: ct.text }}>
            {total.toFixed(decimals)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Small colour legend shared by the SHAP and LIME charts. */
export function ContributionLegend({
  towards,
  away,
  colors,
}: {
  towards: string;
  away: string;
  colors?: { towards: string; away: string };
}) {
  const ct = useChartTheme();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: colors?.towards ?? ct.positive }} aria-hidden="true" />
        {towards}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: colors?.away ?? ct.negative }} aria-hidden="true" />
        {away}
      </span>
    </div>
  );
}
