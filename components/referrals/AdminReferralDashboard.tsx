import React, { useCallback, useEffect, useState } from 'react';
import Button from '../ui/Button';
import { adminReferralApi } from '../../services/api/adminReferralApi';
import type { AdminReferralStats, ReferralProgramConfig } from '../../shared/referrals/referralTypes';

const AdminReferralDashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminReferralStats | null>(null);
  const [config, setConfig] = useState<ReferralProgramConfig | null>(null);
  const [fraud, setFraud] = useState<unknown[]>([]);
  const [pendingRewards, setPendingRewards] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, configRes, fraudRes, rewardsRes] = await Promise.all([
        adminReferralApi.getStats(),
        adminReferralApi.getConfig(),
        adminReferralApi.listFraud(25),
        adminReferralApi.listPendingRewards(25),
      ]);
      setStats(statsRes);
      setConfig(configRes);
      setFraud(fraudRes.items);
      setPendingRewards(rewardsRes.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load referral admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleProgram = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const updated = await adminReferralApi.updateConfig({ isEnabled: !config.isEnabled });
      setConfig(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update config');
    } finally {
      setSaving(false);
    }
  };

  const approveReward = async (id: string) => {
    await adminReferralApi.approveReward(id);
    await load();
  };

  const resolveFraud = async (id: string, resolution: 'dismissed' | 'confirmed') => {
    await adminReferralApi.resolveFraud(id, resolution);
    await load();
  };

  if (loading) return <p className="text-sm text-slate-500">Loading referral admin…</p>;
  if (error) return <p className="text-sm text-rose-600">{error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Referral Program Admin</h3>
          <p className="text-sm text-slate-500">Cross-tenant referrals, fraud review, and reward approval.</p>
        </div>
        {config && (
          <Button variant="secondary" onClick={() => void toggleProgram()} disabled={saving}>
            {config.isEnabled ? 'Disable program' : 'Enable program'}
          </Button>
        )}
      </div>

      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Codes', stats.totalCodes],
            ['Signups', stats.totalSignups],
            ['Conversions', stats.totalConversions],
            ['Open fraud', stats.openFraudReviews],
          ].map(([label, val]) => (
            <div key={label as string} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500 uppercase font-semibold">{label as string}</p>
              <p className="text-2xl font-bold text-slate-800">{val as number}</p>
            </div>
          ))}
        </div>
      )}

      {config && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-1">
          <p><strong>Referrer reward:</strong> {config.referrerRewardType} — {JSON.stringify(config.referrerRewardValue)}</p>
          <p><strong>Min days to convert:</strong> {config.minDaysToConvert}</p>
          <p><strong>Require paid conversion:</strong> {config.requirePaidConversion ? 'Yes' : 'No'}</p>
          <p><strong>Monthly cap per referrer:</strong> {config.maxReferralsPerMonth}</p>
        </div>
      )}

      {stats && stats.topReferrers.length > 0 && (
        <div>
          <h4 className="font-semibold text-slate-800 mb-2">Top referrers</h4>
          <ul className="text-sm space-y-1">
            {stats.topReferrers.map((r) => (
              <li key={r.tenantId} className="flex justify-between border-b border-slate-100 py-2">
                <span>{r.tenantName}</span>
                <span className="text-slate-500">{r.conversions} conversions / {r.signups} signups</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingRewards.length > 0 && (
        <div>
          <h4 className="font-semibold text-slate-800 mb-2">Pending rewards</h4>
          <div className="space-y-2">
            {(pendingRewards as Array<{ id: string; reward_type: string; beneficiary_name: string }>).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
                <span>{r.beneficiary_name} — {r.reward_type}</span>
                <Button size="sm" onClick={() => void approveReward(r.id)}>Approve</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {fraud.length > 0 && (
        <div>
          <h4 className="font-semibold text-slate-800 mb-2">Fraud reviews</h4>
          <div className="space-y-2">
            {(fraud as Array<{ id: string; reason_code: string; referee_email: string; fraud_score: number }>).map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <span>{f.referee_email} — {f.reason_code} (score {f.fraud_score})</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void resolveFraud(f.id, 'dismissed')}>Dismiss</Button>
                  <Button size="sm" onClick={() => void resolveFraud(f.id, 'confirmed')}>Confirm</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReferralDashboard;
