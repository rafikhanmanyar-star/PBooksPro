/**
 * Create Company Screen
 * Form for creating a new company database.
 */

import React, { useState } from 'react';
import { useCompany } from '../../context/CompanyContext';
import { Database, ArrowLeft, AlertCircle, Check } from 'lucide-react';

interface Props {
  onBack?: () => void;
}

function slugPreview(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50) || 'company';
}

const CreateCompanyScreen: React.FC<Props> = ({ onBack }) => {
  const { createCompany } = useCompany();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Company name is required.');
      return;
    }
    if (trimmed.length < 2) {
      setError('Company name must be at least 2 characters.');
      return;
    }

    setError(null);
    setCreating(true);
    const result = await createCompany(trimmed);
    if (!result.ok) {
      setError(result.error || 'Failed to create company.');
      setCreating(false);
    }
    // On success, createCompany triggers reload
  };

  const slug = slugPreview(name);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-600 text-white mb-4 shadow-lg">
            <Database className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create Company</h1>
          <p className="text-gray-500 mt-1">Set up a new company database</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1">
              Company Name
            </label>
            <input
              id="companyName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. TourTreka LLC"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
              autoFocus
              disabled={creating}
              maxLength={100}
            />
          </div>

          {name.trim().length > 0 && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Database file name:</p>
              <p className="text-sm font-mono text-gray-700">{slug}.db</p>
            </div>
          )}

          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
            <p className="text-xs text-blue-700">
              A default admin user will be created with no password.
              You will be prompted to set a password on first login.
            </p>
          </div>

          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Create Company
              </>
            )}
          </button>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-full flex items-center justify-center gap-1 py-2 text-gray-500 hover:text-gray-700 text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to company list
            </button>
          )}
        </form>
      </div>
    </div>
  );
};

export default CreateCompanyScreen;
