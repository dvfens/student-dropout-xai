import { figureUrl } from '../api/client';
import { Modal } from './Modal';

export interface IframeModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Figure url from the API ("/static/figures/lime_Dropout.html"), a file name, or an absolute URL. */
  src: string;
}

/** Full-size modal showing an HTML page (the interactive LIME explanations) in an iframe. */
export function IframeModal({ open, onClose, title, src }: IframeModalProps) {
  const url = figureUrl(src);
  return (
    <Modal open={open} onClose={onClose} title={title} size="full" bodyClassName="p-0 flex flex-col">
      <iframe
        src={url}
        title={title}
        className="min-h-[60vh] w-full flex-1 border-0 bg-white"
        sandbox="allow-scripts allow-same-origin"
      />
      <div className="border-t border-slate-200 px-4 py-2 text-right text-sm dark:border-slate-800">
        <a href={url} target="_blank" rel="noopener noreferrer">
          Open in a new tab
        </a>
      </div>
    </Modal>
  );
}
