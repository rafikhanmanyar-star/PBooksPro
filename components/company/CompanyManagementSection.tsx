/**
 * Company Management Section
 * Used in Settings → Company Management. Shows current company info with switch/create actions.
 * When "Switch Company" is clicked, CompanyContext transitions to 'select' screen
 * which CompanyGate renders as the full-screen CompanySelectScreen.
 */

import React, { useState, useEffect } from 'react';
import { useCompany } from '../../context/CompanyContext';
import { Building2, Plus, Clock, AlertCircle, FolderOpen, CheckCircle2 } from 'lucide-react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';

const formatLastOpened = (dateStr: string | null) => {
  if (!dateStr) return 'Never opened';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const CompanyManagementSection: React.FC = () => {
  const {
    companies,
    activeCompany,
    openCompany,
    switchCompany,
    createCompany,
    closeCurrentAndCreateNewCompany,
    selectAndOpenCompanyFile,
    refreshCompanies,
    deleteCompany,
    error,
  } = useCompany();

  const [openingId, setOpeningId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [closeAndCreateConfirmOpen, setCloseAndCreateConfirmOpen] = useState(false);
  const [pendingCreateName, setPendingCreateName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    refreshCompanies();
  }, [refreshCompanies]);

  const handleOpen = async (id: string) => {
    setOpeningId(id);
    try {
      await openCompany(id);
    } finally {
      setOpeningId(null);
    }
  };

  const handleSwitchCompany = async () => {
    setSwitching(true);
    try {
      await switchCompany();
    } finally {
      setSwitching(false);
    }
  };

  const handleBrowseForFile = async () => {
    setBrowsing(true);
    try {
      await selectAndOpenCompanyFile();
    } finally {
      setBrowsing(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = createName.trim();
    if (!trimmed) {
      setCreateError('Company name is required.');
      return;
    }
    if (trimmed.length < 2) {
      setCreateError('Company name must be at least 2 characters.');
      return;
    }
    setCreateError(null);

    // If user is already in a company, require confirmation: close current company, save data, then create new
    if (activeCompany) {
      setPendingCreateName(trimmed);
      setCloseAndCreateConfirmOpen(true);
      return;
    }

    setCreating(true);
    const result = await createCompany(trimmed);
    setCreating(false);
    if (result.ok) {
      setCreateModalOpen(false);
      setCreateName('');
    } else {
      setCreateError(result.error || 'Failed to create company.');
    }
  };

  const handleCloseAndCreateConfirm = async () => {
    if (!pendingCreateName) return;
    setCreating(true);
    setCloseAndCreateConfirmOpen(false);
    const result = await closeCurrentAndCreateNewCompany(pendingCreateName);
    setCreating(false);
    setPendingCreateName('');
    if (result.ok) {
      setCreateModalOpen(false);
      setCreateName('');
      // App will reload; no need to update UI further
    } else {
      setCreateError(result.error || 'Failed to create company.');
      setCreateModalOpen(true);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await deleteCompany(id);
    } finally {
      setDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  const otherCompanies = companies.filter(c => c.id !== activeCompany?.id);

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {activeCompany ? (
        <>
          {/* Active company card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Active Company</p>
                <h3 className="text-lg font-bold text-slate-800 mt-0.5">{activeCompany.company_name}</h3>
                <p className="text-xs text-slate-400 mt-1 break-all" title={activeCompany.db_file_path}>
                  Path: {activeCompany.db_file_path}
                </p>
              </div>
            </div>
          </div>

          {/* Other companies from master_index (quick reference) */}
          {otherCompanies.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Other Companies</h4>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {otherCompanies.map((company, idx) => (
                  <div
                    key={company.id}
                    className={`flex items-center gap-3 p-3 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{company.company_name}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatLastOpened(company.last_opened_at)}
                      </p>
                      <p className="text-xs text-slate-300 truncate mt-0.5" title={company.db_file_path}>
                        {company.db_file_path}
                      </p>
                    </div>
                    <button
                      onClick={() => setDeleteConfirmId(company.id)}
                      className="flex-shrink-0 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove from list"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={handleSwitchCompany}
              disabled={switching}
              className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">Switch Company</p>
                <p className="text-xs text-slate-500">Open another company</p>
              </div>
              {switching && (
                <div className="ml-auto w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              )}
            </button>

            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-green-300 hover:bg-green-50/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">Create New</p>
                <p className="text-xs text-slate-500">New company database</p>
              </div>
            </button>

            <button
              onClick={handleBrowseForFile}
              disabled={browsing}
              className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 hover:bg-slate-50/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
                <FolderOpen className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">Open File</p>
                <p className="text-xs text-slate-500">Browse for .db file</p>
              </div>
              {browsing && (
                <div className="ml-auto w-5 h-5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
              )}
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-700">
              Switching or creating a new company will close the current one. All data is saved automatically before switching.
            </p>
          </div>
        </>
      ) : (
        <>
          {/* No company open — show list to pick from */}
          <p className="text-sm text-slate-600">No company is open. Select a company to open or create a new one.</p>

          {companies.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {companies.map((company, idx) => (
                <button
                  key={company.id}
                  onClick={() => handleOpen(company.id)}
                  disabled={openingId === company.id}
                  className={`w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors disabled:opacity-60 ${
                    idx > 0 ? 'border-t border-slate-100' : ''
                  }`}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{company.company_name}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {formatLastOpened(company.last_opened_at)}
                    </p>
                    <p className="text-xs text-slate-300 truncate mt-0.5" title={company.db_file_path}>
                      {company.db_file_path}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {openingId === company.id ? (
                      <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><polyline points="9 18 15 12 9 6"/></svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleBrowseForFile}
            disabled={browsing}
            className="w-full flex items-center justify-center gap-2 p-3 bg-white border-2 border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 hover:border-slate-400 transition-colors"
          >
            <FolderOpen className="w-5 h-5" />
            Browse for Company File
            {browsing && (
              <span className="ml-2 w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
            )}
          </button>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 p-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Create New Company
          </button>
        </>
      )}

      {/* Create Company Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => { setCreateModalOpen(false); setCreateName(''); setCreateError(null); }}
        title="Create New Company"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {createError}
            </div>
          )}
          <Input
            label="Company Name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Enter company name"
            required
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setCreateModalOpen(false); setCreateName(''); setCreateError(null); }}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Close current company and create new – confirmation */}
      <Modal
        isOpen={closeAndCreateConfirmOpen}
        onClose={() => { setCloseAndCreateConfirmOpen(false); setPendingCreateName(''); }}
        title="Close current company?"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            You are currently in <strong>{activeCompany?.company_name}</strong>. Creating a new company will close it first.
          </p>
          <p className="text-sm text-slate-600">
            Any unsaved data (transactions in progress or in memory) will be saved to the current company. The app will then close this company, create a blank new company, and refresh to load the new company.
          </p>
          <p className="text-sm font-medium text-slate-700">
            New company name: <strong>{pendingCreateName}</strong>
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setCloseAndCreateConfirmOpen(false); setPendingCreateName(''); }}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCloseAndCreateConfirm}
              disabled={creating}
              className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
            >
              {creating ? 'Saving & creating...' : 'Close and create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="Remove Company"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to remove <strong>{companies.find(c => c.id === deleteConfirmId)?.company_name}</strong> from the list?
            The database file will be kept on disk.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteConfirmId(null)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={deleting}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? 'Removing...' : 'Remove'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CompanyManagementSection;
