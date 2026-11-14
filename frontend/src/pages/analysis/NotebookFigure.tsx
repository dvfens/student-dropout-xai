import type { ReactNode } from 'react';
import { useFigures } from '../../api/hooks';
import type { FigureSection } from '../../api/types';
import { FigureCard } from '../../components';

export interface NotebookFigureProps {
  /** Figure file name, e.g. "04_feature_selection_votes.png". */
  file: string;
  /** Section the figure belongs to (used to look up its title from the API). */
  section: FigureSection;
  /** Overrides the title from the figure list. */
  title?: ReactNode;
  caption?: ReactNode;
  className?: string;
}

/**
 * A notebook figure picked by file name. Uses the title from GET /api/results/figures when it
 * is available, and still shows the image (by file name) while the list loads or if it fails.
 */
export function NotebookFigure({ file, section, title, caption, className }: NotebookFigureProps) {
  const figures = useFigures(section);
  const figure = figures.data?.find((f) => f.file === file);
  return <FigureCard figure={figure} src={file} title={title} caption={caption} className={className} />;
}
