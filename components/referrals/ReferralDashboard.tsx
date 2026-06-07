import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Mail, Users, Gift, TrendingUp } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { referralApi } from '../../services/api/referralApi';
import type { ReferralDashboardStats } from '../../shared/referrals/referralTypes';
import { useNotification } from '../../context/NotificationContext';

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-app-border bg-app-card p-4 shadow-ds-card">
      <div className="flex items-center gap-2 text-app-muted text-xs font-semibold uppercase tracking-wide mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-2xl font-bold text-app-text tabular-nums">{value}</p>
    </div>
  );
}

const ReferralDashboard: React.FC = () => {
  const { showToast } = useNotification();
  const [data, setData] = useState<ReferralDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await referralApi.getDashboard());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load referral dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copyLink = async () => {
    if (!data?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(data.shareUrl);
      showToast('Referral link copied.', 'success');
    } catch {
      showToast('Could not copy link.', 'error');
    }
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSending(true);
    try {
      const res = await referralApi.sendInvitation({
        inviteeEmail: inviteEmail.trim(),
        inviteeName: inviteName.trim() || undefined,
      });
      showToast(
        res.sent ? 'Invitation email sent.' : 'Invitation saved (email not configured on server).',
        res.sent ? 'success' : 'warning'
      );
      setInviteEmail('');
      setInviteName('');
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to send invitation', 'error');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-app-muted p-4">Loading referral program…</p>;
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-sm">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-app-text">Referral Program</h3>
        <p className="text-sm text-app-muted mt-1">
          Share PBooks Pro with peers and earn rewards when they subscribe.
        </p>
      </div>

      {data.code && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Your referral code</p>
            <p className="font-mono text-lg font-bold text-app-text mt-1">{data.code}</p>
            {data.shareUrl && (
              <p className="text-xs text-app-muted truncate mt-1">{data.shareUrl}</p>
            )}
          </div>
          <Button variant="secondary" onClick={() => void copyLink()}>
            <Copy className="w-4 h-4 mr-2" />
            Copy link
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Signups" value={data.totalSignups} icon={<Users className="w-4 h-4" />} />
        <StatCard label="Conversions" value={data.totalConversions} icon={<TrendingUp className="w-4 h-4" />} />
        <StatCard label="Conversion rate" value={`${data.conversionRate}%`} icon={<TrendingUp className="w-4 h-4" />} />
        <StatCard label="Rewards applied" value={data.appliedRewards} icon={<Gift className="w-4 h-4" />} />
      </div>

      {(data.freeMonthsPending > 0 || data.discountCreditCents > 0) && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Pending rewards</p>
          {data.freeMonthsPending > 0 && (
            <p>{data.freeMonthsPending} free month(s) applied or queued on your subscription.</p>
          )}
          {data.discountCreditCents > 0 && (
            <p>${(data.discountCreditCents / 100).toFixed(2)} discount credit available at checkout.</p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-app-border bg-app-card p-4 space-y-3">
        <h4 className="font-semibold text-app-text flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Send email invitation
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Colleague's email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            type="email"
          />
          <Input
            placeholder="Name (optional)"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
          />
        </div>
        <Button onClick={() => void sendInvite()} disabled={sending || !inviteEmail.trim()}>
          {sending ? 'Sending…' : 'Send invitation'}
        </Button>
      </div>

      {data.recentReferrals.length > 0 && (
        <div>
          <h4 className="font-semibold text-app-text mb-2">Recent referrals</h4>
          <div className="rounded-xl border border-app-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-app-toolbar text-app-muted text-xs uppercase">
                <tr>
                  <th className="text-left p-3">Organization</th>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Signed up</th>
                </tr>
              </thead>
              <tbody>
                {data.recentReferrals.map((r) => (
                  <tr key={r.id} className="border-t border-app-border">
                    <td className="p-3">{r.refereeTenantName}</td>
                    <td className="p-3 text-app-muted">{r.refereeEmail}</td>
                    <td className="p-3 capitalize">{r.status.replace('_', ' ')}</td>
                    <td className="p-3 text-app-muted">{new Date(r.signedUpAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferralDashboard;
