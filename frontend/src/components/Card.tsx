import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface CardProps {
  /** Optional heading, rendered as <h2> by default (see `headingLevel`). */
  title?: ReactNode;
  /** Short line under the title. */
  subtitle?: ReactNode;
  /** Right-aligned header content (buttons, badges). */
  actions?: ReactNode;
  headingLevel?: 2 | 3;
  /** Remove body padding, e.g. for edge-to-edge tables. */
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}

/** White/slate surface used for every content block. */
export function Card({
  title,
  subtitle,
  actions,
  headingLevel = 2,
  flush = false,
  className,
  children,
}: CardProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const hasHeader = title !== undefined || actions !== undefined;
  return (
    <section
      className={clsx(
        'min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
    >
      {hasHeader && (
        <div className={clsx('flex flex-wrap items-start justify-between gap-3 px-5 pt-5', flush && 'pb-4')}>
          <div className="min-w-0">
            {title !== undefined && (
              <Heading className="text-lg font-semibold text-slate-900 dark:text-white">{title}</Heading>
            )}
            {subtitle !== undefined && (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
          {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={clsx(!flush && (hasHeader ? 'px-5 pt-4 pb-5' : 'p-5'))}>{children}</div>
    </section>
  );
}
