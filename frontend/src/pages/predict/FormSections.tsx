import clsx from 'clsx';
import { useId, useState, type ReactNode } from 'react';
import type { FeatureSection, StageId } from '../../api/types';
import { FieldInput } from './FieldInput';
import type { FieldErrors, FormSection, FormValues } from './formModel';

export interface FormSectionsProps {
  sections: FormSection[];
  stage: StageId;
  blind: boolean;
  values: FormValues;
  errors: FieldErrors;
  onChange: (name: string, value: string) => void;
}

/** All collapsible form sections for the current stage. */
export function FormSections({ sections, stage, blind, values, errors, onChange }: FormSectionsProps) {
  const [collapsed, setCollapsed] = useState<Partial<Record<FeatureSection, boolean>>>({});

  return (
    <div className="space-y-4">
      {sections.map(({ section, features }) => {
        const newCount = stage > 0 ? features.filter((f) => f.stage === stage).length : 0;
        const errorCount = features.filter((f) => errors[f.name] && !(blind && f.sensitive)).length;
        const hiddenSensitive = blind ? features.filter((f) => f.sensitive) : [];
        return (
          <SectionPanel
            key={section}
            title={section}
            fieldCount={features.length}
            newCount={newCount}
            errorCount={errorCount}
            open={!collapsed[section]}
            onToggle={() => setCollapsed((c) => ({ ...c, [section]: !c[section] }))}
          >
            {hiddenSensitive.length > 0 && (
              <p className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Sensitive attributes are hidden, so the model ignores{' '}
                {hiddenSensitive.map((f) => f.label).join(', ')}. Their values are kept in case you switch back.
              </p>
            )}
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {features.map((f) => {
                const disabled = blind && f.sensitive;
                return (
                  <FieldInput
                    key={f.name}
                    feature={f}
                    value={values[f.name] ?? ''}
                    onChange={onChange}
                    error={disabled ? undefined : errors[f.name]}
                    isNew={stage > 0 && f.stage === stage}
                    disabled={disabled}
                  />
                );
              })}
            </div>
          </SectionPanel>
        );
      })}
    </div>
  );
}

interface SectionPanelProps {
  title: string;
  fieldCount: number;
  newCount: number;
  errorCount: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function SectionPanel({ title, fieldCount, newCount, errorCount, open, onToggle, children }: SectionPanelProps) {
  const panelId = useId();
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-5 py-4 text-left"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-slate-900 dark:text-white">{title}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {fieldCount} {fieldCount === 1 ? 'field' : 'fields'}
            </span>
            {newCount > 0 && (
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                {newCount} new at this stage
              </span>
            )}
            {errorCount > 0 && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                {errorCount} to fix
              </span>
            )}
          </span>
          <svg
            className={clsx('h-5 w-5 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </h3>
      <div id={panelId} hidden={!open} className="border-t border-slate-100 px-5 pt-4 pb-5 dark:border-slate-800">
        {children}
      </div>
    </section>
  );
}
