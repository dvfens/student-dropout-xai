import { useEffect, type ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  /** One or two plain-language sentences explaining the page. */
  lede?: ReactNode;
  /** Optional content on the right (e.g. a toggle). */
  actions?: ReactNode;
}

/** Page title (the page's only <h1>) + lede. Also sets document.title. */
export function PageHeader({ title, lede, actions }: PageHeaderProps) {
  useEffect(() => {
    document.title = `${title} · Student Dropout XAI`;
  }, [title]);

  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">{title}</h1>
        {lede !== undefined && (
          <div className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-300">{lede}</div>
        )}
      </div>
      {actions !== undefined && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
