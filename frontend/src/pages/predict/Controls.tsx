import clsx from 'clsx';
import { useId } from 'react';
import type { ClassName, ExampleParams } from '../../api/types';
import { Badge, classBadgeVariant } from '../../components';

const secondaryButton =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';

export interface LoadedExample {
  /** Which button loaded it. */
  kind: 'Graduate' | 'Dropout' | 'random';
  rowIndex: number;
  actual: ClassName;
  /** The user changed values after loading. */
  edited: boolean;
}

export interface ExampleBarProps {
  loaded: LoadedExample | null;
  busy: ExampleParams['cls'] | null;
  onLoad: (kind: LoadedExample['kind']) => void;
  onReset: () => void;
}

const BUTTONS: { kind: LoadedExample['kind']; label: string }[] = [
  { kind: 'Graduate', label: 'Typical Graduate' },
  { kind: 'Dropout', label: 'Typical Dropout' },
  { kind: 'random', label: 'Random real student' },
];

/** "Fill with example student" buttons, Reset, and which data row is shown. */
export function ExampleBar({ loaded, busy, onLoad, onReset }: ExampleBarProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Fill with an example student</p>
      <div className="flex flex-wrap gap-2">
        {BUTTONS.map((b) => (
          <button
            key={b.kind}
            type="button"
            className={secondaryButton}
            disabled={busy !== null}
            onClick={() => onLoad(b.kind)}
          >
            {busy === b.kind && (
              <span
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600"
                aria-hidden="true"
              />
            )}
            {b.label}
          </button>
        ))}
        <button type="button" className={clsx(secondaryButton, 'sm:ml-auto')} onClick={onReset} disabled={busy !== null}>
          Reset
        </button>
      </div>
      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400" aria-live="polite">
        {loaded ? (
          <>
            Showing{' '}
            {loaded.kind === 'random' ? 'a random real student' : `the typical ${loaded.kind.toLowerCase()}`}:{' '}
            <span title="Row index in data.csv, counting from 0">row {loaded.rowIndex} of the dataset</span>. Real
            outcome: <Badge variant={classBadgeVariant(loaded.actual)}>{loaded.actual}</Badge>
            {loaded.edited && ' (you have changed some values since)'}
          </>
        ) : (
          'Typical students are real rows the model predicts correctly with a middle-of-the-range confidence.'
        )}
      </p>
    </div>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

/** Accessible on/off switch. */
export function Switch({ checked, onChange, label, description }: SwitchProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600',
        )}
      >
        <span
          className={clsx(
            'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
          aria-hidden="true"
        />
      </button>
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-200">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
