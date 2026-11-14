import clsx from 'clsx';
import { useId, useState } from 'react';
import type { CodedFeature, Feature, NumericFeature } from '../../api/types';
import { formatPlain, isNumeric, roundToStep, wantsSlider } from './formModel';

export interface FieldInputProps {
  feature: Feature;
  value: string;
  onChange: (name: string, value: string) => void;
  error?: string;
  /** Field became available at the currently selected stage. */
  isNew?: boolean;
  /** Field is not used by the model (sensitive attribute in blind mode). */
  disabled?: boolean;
}

const inputClass =
  'rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950 dark:text-slate-100';

function borderClass(error: string | undefined): string {
  return error
    ? 'border-red-500 dark:border-red-500'
    : 'border-slate-300 dark:border-slate-700';
}

/** One form field generated from metadata: number + slider, select, or a two-option switch. */
export function FieldInput({ feature, value, onChange, error, isNew = false, disabled = false }: FieldInputProps) {
  const id = useId();
  const [showHelp, setShowHelp] = useState(false);
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = clsx(showHelp && helpId, error && errorId) || undefined;

  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {feature.type === 'binary' ? (
          <span id={`${id}-label`} className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {feature.label}
          </span>
        ) : (
          <label htmlFor={id} className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {feature.label}
          </label>
        )}
        {isNew && (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-indigo-700 uppercase dark:bg-indigo-950 dark:text-indigo-300">
            New
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setShowHelp((s) => !s)}
        aria-expanded={showHelp}
        aria-controls={helpId}
        aria-label={`What is "${feature.label}"?`}
        title={feature.help}
        className={clsx(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold',
          showHelp
            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
            : 'border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:border-slate-600 dark:text-slate-400 dark:hover:text-slate-200',
        )}
      >
        ?
      </button>
    </div>
  );

  return (
    <div className={clsx('space-y-1.5', disabled && 'opacity-70')}>
      {header}
      <p
        id={helpId}
        hidden={!showHelp}
        className="text-xs leading-relaxed text-slate-600 dark:text-slate-400"
      >
        {feature.help}
      </p>
      {isNumeric(feature) ? (
        <NumericControl
          id={id}
          feature={feature}
          value={value}
          onChange={onChange}
          error={error}
          disabled={disabled}
          describedBy={describedBy}
        />
      ) : feature.type === 'binary' ? (
        <BinaryControl
          labelId={`${id}-label`}
          feature={feature}
          value={value}
          onChange={onChange}
          disabled={disabled}
          describedBy={describedBy}
        />
      ) : (
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(feature.name, e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={clsx(inputClass, borderClass(error), 'w-full')}
        >
          {!feature.options.some((o) => String(o.value) === value) && <option value="">Choose…</option>}
          {feature.options.map((o) => (
            <option key={o.value} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

interface NumericControlProps {
  id: string;
  feature: NumericFeature;
  value: string;
  onChange: (name: string, value: string) => void;
  error?: string;
  disabled: boolean;
  describedBy?: string;
}

function NumericControl({ id, feature, value, onChange, error, disabled, describedBy }: NumericControlProps) {
  const parsed = Number(value);
  const sliderValue =
    value.trim() !== '' && Number.isFinite(parsed)
      ? Math.min(feature.max, Math.max(feature.min, parsed))
      : feature.median;

  return (
    <div className="flex items-center gap-3">
      {wantsSlider(feature) && (
        <input
          type="range"
          min={feature.min}
          max={feature.max}
          step={feature.step}
          value={sliderValue}
          disabled={disabled}
          onChange={(e) => onChange(feature.name, String(roundToStep(Number(e.target.value), feature)))}
          aria-label={`${feature.label} slider`}
          aria-valuetext={value}
          tabIndex={-1}
          className="h-2 min-w-0 flex-1 cursor-pointer accent-indigo-600 disabled:cursor-not-allowed dark:accent-indigo-400"
        />
      )}
      <input
        id={id}
        type="number"
        inputMode={feature.integer ? 'numeric' : 'decimal'}
        min={feature.min}
        max={feature.max}
        step={feature.step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(feature.name, e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        title={`From ${formatPlain(feature.min)} to ${formatPlain(feature.max)} (typical: ${formatPlain(feature.median)})`}
        className={clsx(inputClass, borderClass(error), wantsSlider(feature) ? 'w-24 shrink-0' : 'w-full')}
      />
    </div>
  );
}

interface BinaryControlProps {
  labelId: string;
  feature: CodedFeature;
  value: string;
  onChange: (name: string, value: string) => void;
  disabled: boolean;
  describedBy?: string;
}

/** Two-option segmented radio group (e.g. Female / Male, No / Yes). */
function BinaryControl({ labelId, feature, value, onChange, disabled, describedBy }: BinaryControlProps) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
    >
      {feature.options.map((o) => {
        const checked = String(o.value) === value;
        return (
          <label
            key={o.value}
            className={clsx(
              'relative flex cursor-pointer items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-indigo-500',
              checked
                ? 'bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
              disabled && 'cursor-not-allowed',
            )}
          >
            <input
              type="radio"
              name={`${labelId}-${feature.name}`}
              value={String(o.value)}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(feature.name, String(o.value))}
              className="sr-only"
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
