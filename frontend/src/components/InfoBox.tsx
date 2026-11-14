import clsx from 'clsx';
import type { ReactNode } from 'react';

export type InfoBoxVariant = 'info' | 'warning';

export interface InfoBoxProps {
  variant?: InfoBoxVariant;
  /** Defaults to "How to read this" (info) / "Limitations" (warning). */
  title?: ReactNode;
  className?: string;
  children: ReactNode;
}

const styles: Record<InfoBoxVariant, { box: string; icon: string; title: string }> = {
  info: {
    box: 'border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/50',
    icon: 'text-sky-700 dark:text-sky-300',
    title: 'text-sky-900 dark:text-sky-100',
  },
  warning: {
    box: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40',
    icon: 'text-amber-700 dark:text-amber-300',
    title: 'text-amber-900 dark:text-amber-100',
  },
};

/** Callout for "How to read this" (info) and limitations/caveats (warning). */
export function InfoBox({ variant = 'info', title, className, children }: InfoBoxProps) {
  const s = styles[variant];
  const heading = title ?? (variant === 'info' ? 'How to read this' : 'Limitations');
  return (
    <aside
      className={clsx('flex gap-3 rounded-xl border p-4 text-sm leading-relaxed', s.box, className)}
      role="note"
    >
      <svg className={clsx('mt-0.5 h-5 w-5 shrink-0', s.icon)} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        {variant === 'info' ? (
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.25v2.75a.75.75 0 0 0 1.5 0V9.75A.75.75 0 0 0 10 9H9Z"
            clipRule="evenodd"
          />
        ) : (
          <path
            fillRule="evenodd"
            d="M8.49 2.9c.66-1.15 2.36-1.15 3.02 0l6.28 10.92c.66 1.15-.17 2.58-1.51 2.58H3.72c-1.34 0-2.17-1.43-1.51-2.58L8.49 2.9ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
            clipRule="evenodd"
          />
        )}
      </svg>
      <div className="min-w-0 text-slate-700 dark:text-slate-200">
        <p className={clsx('mb-1 font-semibold', s.title)}>{heading}</p>
        <div className="space-y-2">{children}</div>
      </div>
    </aside>
  );
}
