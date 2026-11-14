import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { isValidationError } from '../api/client';

export interface LoadingProps {
  label?: string;
  className?: string;
}

/** Centered spinner with an accessible status label. */
export function Loading({ label = 'Loading…', className }: LoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx('flex items-center justify-center gap-3 py-10 text-sm text-slate-600 dark:text-slate-400', className)}
    >
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-slate-700 dark:border-t-indigo-400"
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}

export interface ErrorStateProps {
  /** Any thrown value; Error.message is shown, ValidationError lists every issue. */
  error: unknown;
  title?: string;
  /** Shows a "Try again" button. */
  onRetry?: () => void;
  /** Turns a raw feature (column) name from a 422 response into the label the user sees. */
  labelFor?: (feature: string) => string;
  className?: string;
}

/** Red error panel with optional retry. */
export function ErrorState({ error, title = 'Something went wrong', onRetry, labelFor, className }: ErrorStateProps) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  const issueLabel = (feature: string) => (labelFor ? labelFor(feature) : feature);
  return (
    <div
      role="alert"
      className={clsx(
        'rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100',
        className,
      )}
    >
      <p className="font-semibold">{title}</p>
      {isValidationError(error) && error.issues.length > 1 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {error.issues.map((issue, i) => (
            <li key={`${issue.feature}-${i}`}>
              {issue.feature && <span className="font-medium">{issueLabel(issue.feature)}: </span>}
              {issue.msg}
            </li>
          ))}
        </ul>
      ) : isValidationError(error) && error.issues.length === 1 ? (
        <p className="mt-1 break-words">
          {error.issues[0].feature && <span className="font-medium">{issueLabel(error.issues[0].feature)}: </span>}
          {error.issues[0].msg}
        </p>
      ) : (
        <p className="mt-1 break-words">{message}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export interface QueryStateProps<T> {
  query: UseQueryResult<T, unknown>;
  loadingLabel?: string;
  errorTitle?: string;
  children: (data: T) => ReactNode;
}

/** Renders Loading / ErrorState (with retry) / children(data) for a TanStack query. */
export function QueryState<T>({ query, loadingLabel, errorTitle, children }: QueryStateProps<T>) {
  if (query.isPending) return <Loading label={loadingLabel} />;
  if (query.isError) {
    return <ErrorState error={query.error} title={errorTitle} onRetry={() => void query.refetch()} />;
  }
  return <>{children(query.data)}</>;
}
