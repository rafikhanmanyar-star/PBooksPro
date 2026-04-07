/**
 * Company Select Screen
 * Full-screen gated view when no company is active.
 * Two-pane layout: company list + detail (matches product workspace UI).
 */

import React from 'react';
import { useCompany } from '../../context/CompanyContext';
import {
  Plus,
  AlertCircle,
  FolderOpen,
  Search,
  Copy,
  Check,
  LogIn,
  DatabaseBackup,
  Trash2,
} from 'lucide-react';

const ACCENT = 'bg-[#5A4EDD] hover:bg-[#4b41c9] focus:ring-[#5A4EDD]';
const ACCENT_RING = 'ring-[#5A4EDD]';
const ACCENT_BORDER = 'border-[#5A4EDD]';
const ACCENT_SOFT = 'bg-[#5A4EDD]/10';

const CompanySelectScreen: React.FC = () => {
  const {
    companies,
    openCompany,
    error,
    refreshCompanies,
    deleteCompany,
    selectCompanyFile,
    getCompanyNameFromFile,
    copyExternalWithNewName,
    openCompanyByPath,
    backupCompany,
  } = useCompany();
  const [opening, setOpening] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [browsing, setBrowsing] = React.useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [copiedPath, setCopiedPath] = React.useState(false);
  const [backingUp, setBackingUp] = React.useState(false);
  const [backupMsg, setBackupMsg] = React.useState<string | null>(null);
  const [browseModal, setBrowseModal] = React.useState<{
    filePath: string;
    existingName: string;
    newName: string;
    error: string | null;
    loading: boolean;
  } | null>(null);

  React.useEffect(() => {
    refreshCompanies();
  }, [refreshCompanies]);

  React.useEffect(() => {
    if (companies.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => (prev && companies.some((c) => c.id === prev) ? prev : companies[0].id));
  }, [companies]);

  const filteredCompanies = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.company_name.toLowerCase().includes(q));
  }, [companies, search]);

  const selected = selectedId ? companies.find((c) => c.id === selectedId) : null;

  if (showCreate) {
    const CreateCompanyScreen = React.lazy(() => import('./CreateCompanyScreen'));
    return (
      <React.Suspense fallback={<div className="flex items-center justify-center h-screen bg-[#F9FAFB] text-gray-600">Loading...</div>}>
        <CreateCompanyScreen onBack={() => setShowCreate(false)} />
      </React.Suspense>
    );
  }

  const handleOpen = async (id: string) => {
    setOpening(id);
    await openCompany(id);
    setOpening(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    setDeletingId(deleteConfirmId);
    try {
      await deleteCompany(deleteConfirmId);
      setDeleteConfirmId(null);
      await refreshCompanies();
    } finally {
      setDeletingId(null);
    }
  };

  const handleBrowse = async () => {
    setBrowsing(true);
    try {
      const selectResult = await selectCompanyFile();
      if (!selectResult.ok || selectResult.canceled || !selectResult.filePath) {
        return;
      }
      const filePath = selectResult.filePath;
      const nameResult = await getCompanyNameFromFile(filePath);
      if (!nameResult.ok) {
        setBrowseModal({
          filePath,
          existingName: 'Unknown',
          newName: '',
          error: nameResult.error || 'Could not read company name.',
          loading: false,
        });
        return;
      }
      setBrowseModal({
        filePath,
        existingName: nameResult.companyName || 'Company',
        newName: nameResult.companyName || '',
        error: null,
        loading: false,
      });
    } finally {
      setBrowsing(false);
    }
  };

  const handleKeepNameAndOpen = async () => {
    if (!browseModal) return;
    setBrowseModal((prev) => (prev ? { ...prev, loading: true, error: null } : null));
    try {
      const result = await openCompanyByPath(browseModal.filePath);
      if (result.ok) {
        setBrowseModal(null);
        return;
      }
      setBrowseModal((prev) => (prev ? { ...prev, loading: false, error: result.error || 'Failed to open.' } : null));
    } catch (err) {
      setBrowseModal((prev) =>
        prev ? { ...prev, loading: false, error: err instanceof Error ? err.message : String(err) } : null
      );
    }
  };

  const handleUseNewNameAndOpen = async () => {
    if (!browseModal) return;
    const newName = browseModal.newName.trim();
    if (!newName) {
      setBrowseModal((prev) => (prev ? { ...prev, error: 'Company name is required.' } : null));
      return;
    }
    setBrowseModal((prev) => (prev ? { ...prev, loading: true, error: null } : null));
    try {
      const result = await copyExternalWithNewName(browseModal.filePath, newName);
      if (!result.ok) {
        setBrowseModal((prev) =>
          prev
            ? {
                ...prev,
                loading: false,
                error: result.error || 'Failed to create company.',
              }
            : null
        );
        return;
      }
      setBrowseModal(null);
      if (result.companyId) {
        await openCompany(result.companyId);
      }
    } catch (err) {
      setBrowseModal((prev) => (prev ? { ...prev, loading: false, error: err instanceof Error ? err.message : String(err) } : null));
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const copyDbPath = async () => {
    if (!selected?.db_file_path) return;
    try {
      await navigator.clipboard.writeText(selected.db_file_path);
      setCopiedPath(true);
      window.setTimeout(() => setCopiedPath(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleBackup = async () => {
    if (!selected) return;
    setBackupMsg(null);
    setBackingUp(true);
    try {
      const result = await backupCompany(selected.id);
      if (result.ok && result.backup) {
        setBackupMsg(`Backup saved: ${result.backup.name}`);
      } else {
        setBackupMsg(result.error || 'Backup failed.');
      }
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <div className="h-screen max-h-screen bg-[#F9FAFB] flex flex-col text-gray-900 overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-bold text-gray-900 tracking-tight">PBooks Pro</h1>
        <p className="text-sm text-gray-500 mt-0.5">Company workspace</p>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-full max-w-[320px] min-w-[260px] shrink-0 border-r border-gray-200 bg-white flex flex-col">
          <div className="p-5 flex flex-col gap-4 flex-1 min-h-0">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Companies</h2>
              <p className="text-xs text-gray-500 mt-0.5">Choose a workspace to manage</p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search companies..."
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[#5A4EDD]/30 focus:border-[#5A4EDD]"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-white text-sm font-medium shadow-sm ${ACCENT}`}
            >
              <Plus className="w-5 h-5" />
              Create New Company
            </button>

            <button
              type="button"
              onClick={handleBrowse}
              disabled={browsing}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-60"
            >
              <FolderOpen className="w-4 h-4" />
              Browse for company file
              {browsing && <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />}
            </button>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex-1 min-h-0 flex flex-col">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Your companies</p>
              <div className="overflow-y-auto flex-1 space-y-2 pr-1 -mr-1">
                {filteredCompanies.length === 0 && companies.length > 0 && (
                  <p className="text-sm text-gray-500 py-4">No companies match your search.</p>
                )}
                {filteredCompanies.map((company) => {
                  const isSel = company.id === selectedId;
                  return (
                    <button
                      key={company.id}
                      type="button"
                      onClick={() => setSelectedId(company.id)}
                      className={`w-full text-left rounded-xl border p-3 transition-colors ${
                        isSel
                          ? `${ACCENT_SOFT} ${ACCENT_BORDER} border-2`
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <p className="font-semibold text-gray-900 text-sm truncate">{company.company_name}</p>
                      <p className="text-xs text-gray-500 mt-1 break-all line-clamp-2" title={company.db_file_path}>
                        {company.db_file_path}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* Main detail: scrollable info + fixed action bar so Open/Backup/Delete stay visible */}
        <main className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#F9FAFB] overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto min-h-0">
              <div className="text-center max-w-md">
                <p className="text-gray-600 mb-2">No company yet</p>
                <p className="text-sm text-gray-500 mb-6">Create a company or open an existing database file to get started.</p>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-medium ${ACCENT}`}
                >
                  <Plus className="w-5 h-5" />
                  Create New Company
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 w-full max-w-3xl mx-auto px-6 md:px-8 pt-6">
              <div className="overflow-y-auto flex-1 min-h-0 pb-4">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">{selected.company_name}</h2>
                  {selected.is_active === 1 && (
                    <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500 text-white">
                      Active
                    </span>
                  )}
                </div>

                {backupMsg && (
                  <div className="mb-4 p-3 rounded-lg bg-gray-100 border border-gray-200 text-sm text-gray-700">{backupMsg}</div>
                )}

                <div className="space-y-4">
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Database</p>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="text-sm text-gray-600 break-all flex-1 min-w-0">{selected.db_file_path}</p>
                      <button
                        type="button"
                        onClick={copyDbPath}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        {copiedPath ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedPath ? 'Copied' : 'Copy path'}
                      </button>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">Metadata</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Created</p>
                        <p className="text-sm text-gray-900">{formatDateTime(selected.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Last opened</p>
                        <p className="text-sm text-gray-900">{formatDateTime(selected.last_opened_at)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="shrink-0 border-t border-gray-200 bg-[#F9FAFB] pt-4 pb-5 -mx-6 px-6 md:-mx-8 md:px-8 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.06)]"
                aria-label="Company actions"
              >
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Actions</p>
                <div className="flex flex-col sm:flex-row flex-wrap items-stretch gap-3">
                  <button
                    type="button"
                    onClick={() => handleOpen(selected.id)}
                    disabled={opening === selected.id || !!deletingId}
                    className={`flex-1 min-w-[180px] inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl text-white text-sm font-semibold shadow-sm disabled:opacity-60 ${ACCENT}`}
                  >
                    <LogIn className="w-5 h-5 shrink-0" />
                    {opening === selected.id ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Opening…
                      </span>
                    ) : (
                      'Open Company'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleBackup}
                    disabled={backingUp || !!opening}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-medium border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-60 min-w-[120px]"
                  >
                    <DatabaseBackup className="w-5 h-5 shrink-0" />
                    {backingUp ? 'Backing up…' : 'Backup'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(selected.id)}
                    disabled={!!deletingId || !!opening}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-medium border border-gray-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-60 min-w-[120px]"
                  >
                    <Trash2 className="w-5 h-5 shrink-0" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {deleteConfirmId && (() => {
        const company = companies.find((c) => c.id === deleteConfirmId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-5 border border-gray-200">
              <p className="text-gray-800 font-medium mb-1">Remove company from list?</p>
              <p className="text-sm text-gray-500 mb-4">
                {company
                  ? `"${company.company_name}" will be removed from the list. The database file will not be deleted.`
                  : 'This company will be removed from the list.'}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={!!deletingId}
                  className="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {deletingId ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {browseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-5 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Open company file</h3>
            <p className="text-sm text-gray-600 mb-2">
              Company name: <span className="font-medium text-gray-900">{browseModal.existingName}</span>
            </p>
            <p className="text-sm text-gray-600 mb-3">
              New company name (optional). Leave as-is to keep the name, or enter a new name to create a copy in the default folder.
            </p>
            <input
              type="text"
              value={browseModal.newName}
              onChange={(e) => setBrowseModal((prev) => (prev ? { ...prev, newName: e.target.value, error: null } : null))}
              placeholder="Enter new company name"
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-offset-0 ${ACCENT_RING}/30 focus:border-[#5A4EDD] mb-3`}
              disabled={browseModal.loading}
            />
            {browseModal.error && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{browseModal.error}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => setBrowseModal(null)}
                disabled={browseModal.loading}
                className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleKeepNameAndOpen}
                disabled={browseModal.loading}
                className="px-3 py-2 rounded-lg border-2 border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {browseModal.loading ? 'Opening...' : 'Keep name and open'}
              </button>
              <button
                type="button"
                onClick={handleUseNewNameAndOpen}
                disabled={browseModal.loading || !browseModal.newName.trim()}
                className={`px-3 py-2 rounded-lg text-white disabled:opacity-60 ${ACCENT}`}
              >
                {browseModal.loading ? 'Creating...' : 'Use new name and open'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanySelectScreen;
