/**
 * Company Login Screen
 * Shown when a company has credentials configured.
 */

import React, { useState } from 'react';
import { useCompany } from '../../context/CompanyContext';
import { Lock, ArrowLeft, AlertCircle, Eye, EyeOff } from 'lucide-react';

const CompanyLoginScreen: React.FC = () => {
  const { loginToCompany, skipLogin, companies, loginUsers, pendingCompanyId } = useCompany();
  const pendingCompany = companies.find(c => c.id === pendingCompanyId) || companies[0];

  const [username, setUsername] = useState(loginUsers.length === 1 ? loginUsers[0].username : '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const companyId = pendingCompany?.id || '';
  const companyName = pendingCompany?.company_name || 'Company';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    setError(null);
    setLoggingIn(true);
    const result = await loginToCompany(companyId, username.trim(), password || '');
    if (!result.ok) {
      setError(result.error || 'Login failed.');
      setLoggingIn(false);
    }
    // On success, loginToCompany triggers reload
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-600 text-white mb-4 shadow-lg">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{companyName}</h1>
          <p className="text-gray-500 mt-1 text-sm">Enter your credentials to continue</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            {loginUsers.length > 1 ? (
              <select
                id="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                aria-label="Username or company"
                disabled={loggingIn}
              >
                <option value="">Select user</option>
                {loginUsers.map(u => (
                  <option key={u.id} value={u.username}>{u.username}</option>
                ))}
              </select>
            ) : (
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                autoFocus={loginUsers.length !== 1}
                disabled={loggingIn}
              />
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                autoFocus={loginUsers.length === 1}
                disabled={loggingIn}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loggingIn || !username.trim()}
            className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loggingIn ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>

          <button
            type="button"
            onClick={skipLogin}
            className="w-full flex items-center justify-center gap-1 py-2 text-gray-500 hover:text-gray-700 text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to company list
          </button>
        </form>
      </div>
    </div>
  );
};

export default CompanyLoginScreen;
