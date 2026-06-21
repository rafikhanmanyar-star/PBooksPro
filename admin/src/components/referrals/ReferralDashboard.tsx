import React, { useCallback, useEffect, useState } from 'react';
import { referralsApi } from '../../services/platformAdminApi';
import {
  Button,
  Card,
  ErrorBanner,
  MetricCard,
  MetricGrid,
  PageHeader,
  colors,
} from '../shared/platformUi';

type ReferralStats = {
  totalCodes?: number;
  totalSignups?: number;
  totalConversions?: number;
  openFraudReviews?: number;
  topReferrers?: Array<{ tenantId: string; tenantName: string; conversions: number; signups: number }>;
};

type ReferralConfig = {
  isEnabled: boolean;
  referrerRewardType?: string;
  referrerRewardValue?: unknown;
  minDaysToConvert?: number;
  requirePaidConversion?: boolean;
  maxReferralsPerMonth?: number;
};

type PendingReward = { id: string; reward_type: string; beneficiary_name: string };
type FraudReview = { id: string; reason_code: string; referee_email: string; fraud_score: number };

const ReferralDashboard: React.FC = () => {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [config, setConfig] = useState<ReferralConfig | null>(null);
  const [fraud, setFraud] = useState<FraudReview[]>([]);
  const [pendingRewards, setPendingRewards] = useState<PendingReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, configRes, fraudRes, rewardsRes] = await Promise.all([
        referralsApi.getStats(),
        referralsApi.getConfig(),
        referralsApi.listFraud(25),
        referralsApi.listPendingRewards(25),
      ]);
      setStats(statsRes as ReferralStats);
      setConfig(configRes as ReferralConfig);
      setFraud(fraudRes.items as unknown as FraudReview[]);
      setPendingRewards(rewardsRes.items as unknown as PendingReward[]);
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
      const updated = await referralsApi.updateConfig({ isEnabled: !config.isEnabled });
      setConfig(updated as ReferralConfig);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update config');
    } finally {
      setSaving(false);
    }
  };

  const approveReward = async (id: string) => {
    await referralsApi.approveReward(id);
    await load();
  };

  const resolveFraud = async (id: string, resolution: 'dismissed' | 'confirmed') => {
    await referralsApi.resolveFraud(id, resolution);
    await load();
  };

  if (loading) return <p style={{ color: colors.muted }}>Loading referral admin…</p>;

  return (
    <div>
      <PageHeader
        title="Referral Program Admin"
        subtitle="Cross-tenant referrals, fraud review, and reward approval."
        action={
          config && (
            <Button variant="secondary" onClick={() => void toggleProgram()} disabled={saving}>
              {config.isEnabled ? 'Disable program' : 'Enable program'}
            </Button>
          )
        }
      />

      {error && <ErrorBanner message={error} />}

      {stats && (
        <div style={{ marginBottom: '1.5rem' }}>
          <MetricGrid>
            <MetricCard label="Codes" value={stats.totalCodes ?? 0} />
            <MetricCard label="Signups" value={stats.totalSignups ?? 0} />
            <MetricCard label="Conversions" value={stats.totalConversions ?? 0} />
            <MetricCard label="Open fraud" value={stats.openFraudReviews ?? 0} />
          </MetricGrid>
        </div>
      )}

      {config && (
        <Card style={{ backgroundColor: colors.surface, marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          <p><strong>Referrer reward:</strong> {config.referrerRewardType} — {JSON.stringify(config.referrerRewardValue)}</p>
          <p><strong>Min days to convert:</strong> {config.minDaysToConvert}</p>
          <p><strong>Require paid conversion:</strong> {config.requirePaidConversion ? 'Yes' : 'No'}</p>
          <p><strong>Monthly cap per referrer:</strong> {config.maxReferralsPerMonth}</p>
        </Card>
      )}

      {stats && stats.topReferrers && stats.topReferrers.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ fontWeight: 600, color: colors.text, marginBottom: '0.5rem' }}>Top referrers</h4>
          <Card style={{ padding: '0.5rem 1rem' }}>
            {stats.topReferrers.map((r) => (
              <div
                key={r.tenantId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: `1px solid ${colors.border}`,
                  padding: '0.5rem 0',
                  fontSize: '0.875rem',
                }}
              >
                <span>{r.tenantName}</span>
                <span style={{ color: colors.muted }}>{r.conversions} conversions / {r.signups} signups</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {pendingRewards.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ fontWeight: 600, color: colors.text, marginBottom: '0.5rem' }}>Pending rewards</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {pendingRewards.map((r) => (
              <Card key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', fontSize: '0.875rem' }}>
                <span>{r.beneficiary_name} — {r.reward_type}</span>
                <Button onClick={() => void approveReward(r.id)}>Approve</Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {fraud.length > 0 && (
        <div>
          <h4 style={{ fontWeight: 600, color: colors.text, marginBottom: '0.5rem' }}>Fraud reviews</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {fraud.map((f) => (
              <Card key={f.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', backgroundColor: '#fffbeb', borderColor: '#fde68a', padding: '0.75rem', fontSize: '0.875rem' }}>
                <span>{f.referee_email} — {f.reason_code} (score {f.fraud_score})</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button variant="secondary" onClick={() => void resolveFraud(f.id, 'dismissed')}>Dismiss</Button>
                  <Button onClick={() => void resolveFraud(f.id, 'confirmed')}>Confirm</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferralDashboard;
