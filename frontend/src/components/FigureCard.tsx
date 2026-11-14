import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { figureUrl } from '../api/client';
import type { FigureInfo } from '../api/types';
import { Modal } from './Modal';

export interface FigureCardProps {
  /** A figure from useFigures(); provides src and default title. */
  figure?: FigureInfo;
  /** Figure file name ("09_shap_bar.png") or API path; used when `figure` is not given. */
  src?: string;
  /** Overrides figure.title. */
  title?: ReactNode;
  /** Plain-language caption under the image. */
  caption?: ReactNode;
  /** Alt text; defaults to the title (if it is a string). */
  alt?: string;
  className?: string;
}

/** "…/04_feature_selection_votes.png" -> "Figure 04: Feature selection votes" (used until the figure list loads). */
function readableTitle(path: string): string {
  const file = path.split('/').pop() ?? path;
  const match = /^(\d+)_(.+)\.\w+$/.exec(file);
  if (!match) return 'Notebook figure';
  const words = match[2].replace(/_/g, ' ');
  return `Figure ${match[1]}: ${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** Notebook figure with title, caption and click-to-enlarge lightbox. */
export function FigureCard({ figure, src, title, caption, alt, className }: FigureCardProps) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const path = figure?.url ?? src ?? '';
  const url = figureUrl(path);
  const heading = title ?? figure?.title ?? readableTitle(path);
  const altText = alt ?? (typeof heading === 'string' ? heading : figure?.title ?? 'Figure');

  return (
    <figure
      className={clsx(
        'min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
    >
      <div className="px-4 pt-4">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">{heading}</h3>
      </div>
      <div className="p-4">
        {failed ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Could not load this figure from the API.
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group block w-full cursor-zoom-in rounded-lg bg-white p-1 ring-1 ring-slate-200 dark:ring-slate-700"
            aria-label={`Enlarge figure: ${altText}`}
          >
            {/* Notebook PNGs have white backgrounds, so keep a white frame in dark mode too. */}
            <img
              src={url}
              alt={altText}
              loading="lazy"
              onError={() => setFailed(true)}
              className="mx-auto h-auto max-w-full transition group-hover:opacity-90"
            />
          </button>
        )}
      </div>
      {caption !== undefined && (
        <figcaption className="px-4 pb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {caption}
        </figcaption>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={heading} size="full" bodyClassName="bg-white">
        <img src={url} alt={altText} className="mx-auto h-auto max-w-full" />
      </Modal>
    </figure>
  );
}
