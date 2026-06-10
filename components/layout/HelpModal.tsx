
import React from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import { useDispatchOnly } from '../../hooks/useSelectiveState';
import { Page } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import {
  getHelpDeepLink,
  getModuleHelp,
  storeHelpDeepLink,
  type ModuleHelpEntry,
  type ModuleHelpSection,
} from '../../shared/moduleHelp/moduleHelpContent';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  helpContextKey: string;
}

function renderSection(section: ModuleHelpSection, index: number) {
  return (
    <div key={index}>
      <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-2">{section.heading}</h3>
      {section.paragraphs?.map((p, i) => (
        <p key={i} className="mb-2 last:mb-0">
          {p}
        </p>
      ))}
      {section.bullets && section.bullets.length > 0 && (
        <ul className="list-disc list-inside space-y-1 ml-2">
          {section.bullets.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
      {section.ordered && section.ordered.length > 0 && (
        <ol className="list-decimal list-inside space-y-1 ml-2">
          {section.ordered.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ModuleHelpBody({ entry }: { entry: ModuleHelpEntry }) {
  return (
    <div className="space-y-5 text-sm text-gray-700 dark:text-slate-300">
      <div className="rounded-lg border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/30 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 mb-1">
          {entry.modulePath}
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-200">{entry.summary}</p>
      </div>
      {entry.sections.map(renderSection)}
    </div>
  );
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, helpContextKey }) => {
  const dispatch = useDispatchOnly();
  const entry = getModuleHelp(helpContextKey);
  const deepLink = getHelpDeepLink(entry);

  const openFullGuide = () => {
    if (deepLink) {
      storeHelpDeepLink(deepLink);
    } else {
      sessionStorage.setItem('openSettingsCategory', 'help');
    }
    dispatch({ type: 'SET_PAGE', payload: 'settings' });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={entry.title} size="lg">
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        <ModuleHelpBody entry={entry} />
      </div>
      <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {deepLink
            ? 'Open Customer Success for the full article, search, and support.'
            : 'Open Customer Success for guides, tours, and support.'}
        </p>
        <Button
          type="button"
          variant="primary"
          onClick={openFullGuide}
          className="inline-flex items-center justify-center gap-2 shrink-0"
        >
          <BookOpen className="w-4 h-4" aria-hidden />
          View complete guide
          <ExternalLink className="w-3.5 h-3.5 opacity-70" aria-hidden />
        </Button>
      </div>
    </Modal>
  );
};

export default HelpModal;
