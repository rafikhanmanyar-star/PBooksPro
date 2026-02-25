import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { paymentsApi } from '../../services/api/payments';
import { apiClient } from '../../services/api/client';
import PaymentModal from './PaymentModal';
import PaymentHistory from './PaymentHistory';
import Button from '../ui/Button';
import { ICONS } from '../../constants';

interface LicenseInfo {
  licenseType: 'trial' | 'monthly' | 'yearly' | 'perpetual';
  licenseStatus: 'active' | 'expired' | 'suspended' | 'cancelled';
  expiryDate: string | null;
  daysRemaining: number;
  isExpired: boolean;
  modules?: string[];
}

const OFFERS = [
  {
    key: 'real_estate',
    label: 'Real Estate Developer & Constructor',
    description: 'Complete project management suite for developers. Track progress, inventory, site drawings, and budgets.',
    features: ['Project Scheduling', 'Site Management', 'Inventory Control', 'Progress Billing'],
    monthlyPrice: 5000,
    yearlyPrice: 50000,
    icon: '🏗️'
  },
  {
    key: 'rental',
    label: 'Real Estate Rental Management',
    description: 'Effortless tenant management and rent collection. Ideal for property owners and managers.',
    features: ['Tenant Portal', 'Rent Automation', 'Maintenance Tracking', 'Lease Management'],
    monthlyPrice: 3000,
    yearlyPrice: 30000,
    icon: '🏠'
  },
];

const LicenseManagement: React.FC = () => {
  const { checkLicenseStatus } = useAuth();
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);

  useEffect(() => {
    loadLicenseStatus();
  }, []);

  const loadLicenseStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Get detailed license info from API
      const response = await apiClient.get<LicenseInfo>('/tenants/license-status');
      setLicenseInfo(response);
    } catch (err: any) {
      console.error('Failed to load license status:', err);
      setError(err.message || 'Failed to load license information');
    } finally {
      setIsLoading(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'status' | 'offers'>('status');

  useEffect(() => {
    if (licenseInfo?.isExpired) {
      setActiveTab('offers');
    }
  }, [licenseInfo?.isExpired]);

  const handleRenewalSuccess = () => {
    setShowPaymentModal(false);
    loadLicenseStatus();
  };

  const getStatusColors = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return { bg: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-200', glow: 'shadow-emerald-500/20' };
      case 'expired':
        return { bg: 'bg-rose-500', text: 'text-rose-500', border: 'border-rose-200', glow: 'shadow-rose-500/20' };
      case 'suspended':
        return { bg: 'bg-amber-500', text: 'text-amber-500', border: 'border-amber-200', glow: 'shadow-amber-500/20' };
      default:
        return { bg: 'bg-slate-500', text: 'text-slate-500', border: 'border-slate-200', glow: 'shadow-slate-500/20' };
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-medium animate-pulse">Loading secure license data...</p>
      </div>
    );
  }

  if (error || !licenseInfo) {
    return (
      <div className="p-8 text-center">
        <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <div className="w-10 h-10">{ICONS.alertTriangle}</div>
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">Sync Error</h3>
        <p className="text-slate-500 mb-6 max-w-xs mx-auto">{error || 'Could not verify license status.'}</p>
        <Button onClick={loadLicenseStatus} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8">
          Retry Sync
        </Button>
      </div>
    );
  }

  const statusColors = getStatusColors(licenseInfo.licenseStatus);

  return (
    <div className="bg-slate-50 min-h-full">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-[#0f172a] px-6 pt-10 pb-16 text-white rounded-b-[2.5rem] shadow-2xl">
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px]"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8 max-w-7xl mx-auto">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className={`flex h-3 w-3 rounded-full ${statusColors.bg} animate-pulse shadow-[0_0_15px_rgba(255,255,255,0.3)]`} style={{ boxShadow: `0 0 15px ${statusColors.bg}` }}></span>
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Security Registry</span>
            </div>
            <h2 className="text-4xl font-black tracking-tight mb-2 text-white drop-shadow-sm">
              {licenseInfo.licenseStatus === 'active' ? 'License Active' : 'Action Required'}
            </h2>
            <p className="text-slate-300 text-sm font-medium opacity-80 decoration-indigo-500/30">
              Verified Organization • Reference ID: <span className="text-indigo-300">{licenseInfo.licenseType.toUpperCase()}</span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-5 border border-white/10 flex flex-col items-center min-w-[140px] shadow-2xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">Validity Remaining</span>
              <div className="flex items-baseline gap-1">
                <span className={`text-4xl font-black ${licenseInfo.daysRemaining <= 7 ? 'text-rose-400' : 'text-indigo-400'}`}>
                  {licenseInfo.daysRemaining === Infinity ? '∞' : licenseInfo.daysRemaining}
                </span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Days</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 -mt-8 relative z-20 max-w-7xl mx-auto">
        <div className="bg-white rounded-[1.5rem] shadow-xl border border-slate-200 p-2 flex gap-1">
          <button
            onClick={() => setActiveTab('status')}
            className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'status' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
            {ICONS.shield || '🛡️'} My Subscription
          </button>
          <button
            onClick={() => setActiveTab('offers')}
            className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'offers' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
            {ICONS.package || '📦'} All Offers
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto space-y-8">
        {activeTab === 'status' ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Core Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-hover hover:border-indigo-200">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Subscription Details</h4>
                <div className="space-y-4">
                  <div className="flex justify-between items-center group">
                    <span className="text-sm font-medium text-slate-500">Tier</span>
                    <span className="text-sm font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded uppercase">{licenseInfo.licenseType}</span>
                  </div>
                  <div className="flex justify-between items-center group">
                    <span className="text-sm font-medium text-slate-500">Valid Until</span>
                    <span className="text-sm font-bold text-slate-800">{formatDate(licenseInfo.expiryDate)}</span>
                  </div>
                  <div className="flex justify-between items-center group">
                    <span className="text-sm font-medium text-slate-500">Status</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusColors.bg} text-white`}>
                      {licenseInfo.licenseStatus.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-hover hover:border-indigo-200">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Quick Actions</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setSelectedModule(null);
                      setShowPaymentModal(true);
                    }}
                    className="flex flex-col items-center justify-center gap-2 p-3 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-colors group"
                  >
                    <div className="p-2 bg-indigo-100 rounded-lg group-hover:scale-110 transition-transform">{ICONS.repeat || '💳'}</div>
                    <span className="text-xs font-bold">Renew</span>
                  </button>
                  <button
                    onClick={() => setShowPaymentHistory(true)}
                    className="flex flex-col items-center justify-center gap-2 p-3 bg-slate-50 text-slate-700 rounded-xl hover:bg-slate-100 transition-colors group"
                  >
                    <div className="p-2 bg-slate-100 rounded-lg group-hover:scale-110 transition-transform">{ICONS.history || '📋'}</div>
                    <span className="text-xs font-bold">History</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Active Modules Group */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                Active Capabilities
              </h4>
              {licenseInfo.modules && licenseInfo.modules.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {licenseInfo.modules.map(module => (
                    <div key={module} className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl whitespace-nowrap overflow-hidden group">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-200 shrink-0">✓</div>
                      <span className="text-xs font-bold text-emerald-800 truncate">
                        {module.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                  <p className="text-slate-400 text-sm">No specialized modules active yet.</p>
                  <button onClick={() => setActiveTab('offers')} className="text-indigo-600 text-xs font-bold mt-2 hover:underline">Explore Modules →</button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-4">
              {OFFERS.map(offer => {
                const isOwned = licenseInfo.modules?.includes(offer.key);
                return (
                  <div
                    key={offer.key}
                    className={`relative group bg-white border rounded-2xl p-6 transition-all duration-500 hover:shadow-xl hover:border-indigo-300 ${isOwned ? 'border-indigo-200 bg-indigo-50/10' : 'border-slate-200'
                      }`}
                  >
                    {isOwned && (
                      <div className="absolute top-4 right-4 bg-emerald-500 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg shadow-emerald-500/20 z-10 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-white animate-ping"></span> ACTIVATED
                      </div>
                    )}

                    <div className="flex items-start gap-5">
                      <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-3xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-500 shrink-0">
                        {offer.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-lg font-black text-slate-800 mb-1 leading-tight group-hover:text-indigo-600 transition-colors">
                          {offer.label}
                        </h4>
                        <p className="text-sm text-slate-500 mb-4 line-clamp-2 leading-relaxed">
                          {offer.description}
                        </p>

                        <div className="flex flex-wrap gap-2 mb-6">
                          {offer.features.map((feature, idx) => (
                            <span key={idx} className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100 group-hover:border-indigo-100 group-hover:bg-indigo-50/30 group-hover:text-indigo-600 transition-all">
                              {feature}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                          <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black mb-1">Elite Package</span>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-black text-slate-900 leading-none">PKR {offer.monthlyPrice.toLocaleString()}</span>
                              <span className="text-xs text-slate-400 font-bold uppercase tracking-tighter">/month</span>
                            </div>
                          </div>

                          <button
                            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${isOwned
                              ? 'bg-slate-100 text-slate-300 cursor-default'
                              : 'bg-slate-900 text-white hover:bg-indigo-600 hover:-translate-y-1 active:translate-y-0 shadow-lg shadow-slate-200 hover:shadow-indigo-200'
                              }`}
                            onClick={() => {
                              if (!isOwned) {
                                setSelectedModule(offer.key);
                                setShowPaymentModal(true);
                              }
                            }}
                          >
                            {isOwned ? 'Enabled' : 'Activate Area'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="bg-slate-900 rounded-3xl p-8 text-center text-white relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl"></div>
              <h3 className="text-2xl font-black mb-2 relative z-10">Custom Enterprise Plan?</h3>
              <p className="text-slate-400 mb-6 text-sm relative z-10 mx-auto max-w-sm">Tailored solutions for massive organizations with unlimited scaling and priority support.</p>
              <button className="bg-white text-slate-900 font-black px-8 py-3 rounded-2xl hover:bg-indigo-50 transition-all transform hover:scale-105 active:scale-95 text-xs uppercase tracking-widest shadow-xl shadow-black/20">
                Contact Enterprise
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals & More */}
      <PaymentModal
        isOpen={showPaymentModal}
        moduleKey={selectedModule || undefined}
        onClose={() => setShowPaymentModal(false)}
        onSuccess={handleRenewalSuccess}
      />

      {showPaymentHistory && (
        <div className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col scale-in-center animate-in zoom-in-95 duration-300">
            <div className="bg-slate-900 p-6 text-white flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black tracking-tight leading-none mb-1">Payment Registry</h2>
                <p className="text-slate-400 text-xs font-medium">History of all transactions</p>
              </div>
              <button
                onClick={() => setShowPaymentHistory(false)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center group"
              >
                <div className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300">{ICONS.x}</div>
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <PaymentHistory onClose={() => setShowPaymentHistory(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LicenseManagement;

