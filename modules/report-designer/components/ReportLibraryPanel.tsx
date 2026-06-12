import React from 'react';
import type { SavedReportDefinition } from '../../../services/api/reportDesignerApi';

type Props = {
  favorites: SavedReportDefinition[];
  recent: SavedReportDefinition[];
  saved: SavedReportDefinition[];
  activeId: string | null;
  onLoad: (row: SavedReportDefinition) => void;
  onFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  loading?: boolean;
};

function ReportRow({
  row,
  active,
  onLoad,
  onFavorite,
  onDelete,
}: {
  row: SavedReportDefinition;
  active: boolean;
  onLoad: () => void;
  onFavorite: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={`flex items-center gap-1 text-xs rounded-lg px-2 py-1 border ${
        active ? 'border-indigo-500 bg-indigo-500/10' : 'border-app-border hover:bg-app-table-hover'
      }`}
    >
      <button type="button" className="shrink-0 text-amber-500" title="Favorite" onClick={onFavorite}>
        {row.isFavorite ? '★' : '☆'}
      </button>
      <button type="button" className="flex-1 text-left truncate" onClick={onLoad} title={row.description ?? row.name}>
        {row.name}
        {row.visibility !== 'private' && (
          <span className="ml-1 text-[10px] text-app-muted">({row.visibility})</span>
        )}
      </button>
      <button type="button" className="text-red-600 shrink-0 px-1" title="Delete" onClick={onDelete}>
        ×
      </button>
    </li>
  );
}

const ReportLibraryPanel: React.FC<Props> = ({
  favorites,
  recent,
  saved,
  activeId,
  onLoad,
  onFavorite,
  onDelete,
  loading,
}) => (
  <section className="border border-app-border rounded-xl bg-app-card flex flex-col min-h-0 max-h-48 lg:max-h-none">
    <div className="px-3 py-2 border-b border-app-border text-xs font-bold uppercase tracking-wide text-app-muted">
      Saved reports library
    </div>
    <div className="flex-1 overflow-auto p-2 space-y-3 text-xs">
      {loading && <p className="text-app-muted px-1">Loading…</p>}
      {!loading && favorites.length === 0 && recent.length === 0 && saved.length === 0 && (
        <p className="text-app-muted italic px-1">Save a report to see it here. Use ★ to pin favorites.</p>
      )}
      {favorites.length > 0 && (
        <div>
          <p className="font-semibold text-app-muted mb-1 px-1">Favorites</p>
          <ul className="space-y-0.5">
            {favorites.map((row) => (
              <ReportRow
                key={`fav-${row.id}`}
                row={row}
                active={activeId === row.id}
                onLoad={() => onLoad(row)}
                onFavorite={() => onFavorite(row.id)}
                onDelete={() => onDelete(row.id)}
              />
            ))}
          </ul>
        </div>
      )}
      {recent.length > 0 && (
        <div>
          <p className="font-semibold text-app-muted mb-1 px-1">Recent</p>
          <ul className="space-y-0.5">
            {recent.map((row) => (
              <ReportRow
                key={`rec-${row.id}`}
                row={row}
                active={activeId === row.id}
                onLoad={() => onLoad(row)}
                onFavorite={() => onFavorite(row.id)}
                onDelete={() => onDelete(row.id)}
              />
            ))}
          </ul>
        </div>
      )}
      {saved.length > 0 && (
        <div>
          <p className="font-semibold text-app-muted mb-1 px-1">All saved</p>
          <ul className="space-y-0.5 max-h-40 overflow-auto">
            {saved.map((row) => (
              <ReportRow
                key={row.id}
                row={row}
                active={activeId === row.id}
                onLoad={() => onLoad(row)}
                onFavorite={() => onFavorite(row.id)}
                onDelete={() => onDelete(row.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  </section>
);

export default ReportLibraryPanel;
