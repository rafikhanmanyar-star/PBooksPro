import React, { useState } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import Button from '../ui/Button';
import { useDashboardFiltersStore } from '../../stores/dashboardFiltersStore';

export const DashboardSavedViews: React.FC = () => {
  const savedViews = useDashboardFiltersStore((s) => s.savedViews);
  const saveView = useDashboardFiltersStore((s) => s.saveView);
  const loadView = useDashboardFiltersStore((s) => s.loadView);
  const deleteView = useDashboardFiltersStore((s) => s.deleteView);
  const [draftName, setDraftName] = useState('');
  const [selected, setSelected] = useState('');

  const handleSave = () => {
    const name = draftName.trim();
    if (!name) return;
    saveView(name);
    setDraftName('');
    setSelected(name);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Bookmark className="w-3.5 h-3.5 text-app-muted shrink-0" />
      {savedViews.length > 0 && (
        <select
          value={selected}
          onChange={(e) => {
            const name = e.target.value;
            setSelected(name);
            if (name) loadView(name);
          }}
          className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 text-app-text max-w-[140px]"
          aria-label="Load saved dashboard view"
        >
          <option value="">Saved views…</option>
          {savedViews.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name}
            </option>
          ))}
        </select>
      )}
      <input
        type="text"
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        placeholder="View name"
        className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 w-28"
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
      />
      <Button variant="secondary" onClick={handleSave} className="text-xs h-8 px-2" disabled={!draftName.trim()}>
        Save
      </Button>
      {selected && (
        <button
          type="button"
          onClick={() => {
            deleteView(selected);
            setSelected('');
          }}
          className="p-1.5 rounded-lg text-app-muted hover:text-ds-danger border border-app-border"
          title="Delete saved view"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default DashboardSavedViews;
