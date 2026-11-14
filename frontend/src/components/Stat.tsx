import clsx from 'clsx';
import type { ReactNode } from 'react';

export type StatTone = 'default' | 'dropout' | 'enrolled' | 'graduate' | 'muted';

export interface StatProps {
  /** Big, pre-formatted value ("0.772", "32%"). */
  value: ReactNode;
  label: ReactNode;
  /** Optional small line below the label. */
  hint?: ReactNode;
  tone?: StatTone;
  className?: string;
}

const toneClass: Record<StatTone, string> = {
  default: 'text-slate-900 dark:text-white',
  dropout: 'text-red-700 dark:text-red-400',
  enrolled: 'text-amber-700 dark:text-amber-300',
  graduate: 'text-green-700 dark:text-green-400',
  muted: 'text-slate-500 dark:text-slate-400',
};

/** Big number + label, for KPI rows (put several in a grid). */
export function Stat({ value, label, hint, tone = 'default', className }: StatProps) {
  return (
    <div
      className={clsx(
        'min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
    >
      <div className={clsx('text-2xl font-bold tabular-nums sm:text-3xl', toneClass[tone])}>{value}</div>
      <div className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">{label}</div>
      {hint !== undefined && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  );
}
