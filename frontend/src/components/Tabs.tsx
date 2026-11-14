import clsx from 'clsx';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<Id extends string = string> {
  id: Id;
  label: ReactNode;
  /** Panel content; omit to render your own panel from `value`. */
  content?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<Id extends string = string> {
  tabs: TabItem<Id>[];
  /** Controlled selected id. */
  value?: Id;
  /** Uncontrolled initial id (defaults to the first tab). */
  defaultValue?: Id;
  onChange?: (id: Id) => void;
  /** Accessible name of the tab list. */
  ariaLabel: string;
  /** "pills" for segmented buttons, "underline" for page-level tabs. */
  variant?: 'underline' | 'pills';
  className?: string;
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern): roving tabindex, arrow keys / Home / End
 * move and select, tabs scroll horizontally on narrow screens.
 */
export function Tabs<Id extends string = string>({
  tabs,
  value,
  defaultValue,
  onChange,
  ariaLabel,
  variant = 'underline',
  className,
}: TabsProps<Id>) {
  const baseId = useId();
  const [internal, setInternal] = useState<Id | undefined>(defaultValue ?? tabs[0]?.id);
  const selected = value ?? internal;
  const refs = useRef<Map<Id, HTMLButtonElement>>(new Map());

  const select = (id: Id) => {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const enabled = tabs.map((t, i) => ({ t, i })).filter(({ t }) => !t.disabled);
    const pos = enabled.findIndex(({ i }) => i === index);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = enabled[(pos + 1) % enabled.length].i;
    else if (e.key === 'ArrowLeft') next = enabled[(pos - 1 + enabled.length) % enabled.length].i;
    else if (e.key === 'Home') next = enabled[0].i;
    else if (e.key === 'End') next = enabled[enabled.length - 1].i;
    if (next === null) return;
    e.preventDefault();
    const id = tabs[next].id;
    select(id);
    refs.current.get(id)?.focus();
  };

  const active = tabs.find((t) => t.id === selected);

  return (
    <div className={clsx('min-w-0', className)}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={clsx(
          'max-w-full gap-1 overflow-x-auto',
          variant === 'underline'
            ? 'flex border-b border-slate-200 dark:border-slate-800'
            : 'inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800',
        )}
      >
        {tabs.map((tab, index) => {
          const isSelected = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) refs.current.set(tab.id, el);
                else refs.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={tab.content !== undefined ? `${baseId}-panel-${tab.id}` : undefined}
              tabIndex={isSelected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => select(tab.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={clsx(
                'shrink-0 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                variant === 'underline'
                  ? clsx(
                      '-mb-px border-b-2 px-3 py-2',
                      isSelected
                        ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
                        : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                    )
                  : clsx(
                      'rounded-md px-3 py-1.5',
                      isSelected
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
                    ),
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {active?.content !== undefined && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.id}`}
          aria-labelledby={`${baseId}-tab-${active.id}`}
          tabIndex={0}
          className="pt-5 focus-visible:outline-offset-4"
        >
          {active.content}
        </div>
      )}
    </div>
  );
}
