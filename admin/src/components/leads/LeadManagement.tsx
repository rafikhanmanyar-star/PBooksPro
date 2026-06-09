import React, { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import { Search, Download, RefreshCw, Filter } from 'lucide-react';

interface Lead {
  id: string;
  name: string | null;
  company: string | null;
  email: string;
  mobile: string | null;
  source: string;
  campaign: string | null;
  status: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  demo_scheduled: 'Demo Scheduled',
  trial_started: 'Trial Started',
  customer: 'Customer',
};

const SOURCE_LABELS: Record<string, string> = {
  checklist: 'Checklist',
  newsletter: 'Newsletter',
  exit_intent: 'Exit Intent',
  demo_booking: 'Demo Booking',
  contact_form: 'Contact Form',
  trial_signup: 'Free Trial',
  pricing_cta: 'Pricing CTA',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  new: { bg: '#dbeafe', color: '#1e40af' },
  contacted: { bg: '#e0e7ff', color: '#3730a3' },
  qualified: { bg: '#fef3c7', color: '#92400e' },
  demo_scheduled: { bg: '#fce7f3', color: '#9d174d' },
  trial_started: { bg: '#d1fae5', color: '#065f46' },
  customer: { bg: '#bbf7d0', color: '#14532d' },
};

const LeadManagement: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stats, setStats] = useState<{ total: number; last7Days: number } | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    try {
      setLoading(true);
      const filters: Record<string, string> = {};
      if (searchTerm.trim()) filters.search = searchTerm.trim();
      if (sourceFilter) filters.source = sourceFilter;
      if (statusFilter) filters.status = statusFilter;
      if (campaignFilter.trim()) filters.campaign = campaignFilter.trim();
      if (dateFrom) filters.from = new Date(dateFrom).toISOString();
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filters.to = end.toISOString();
      }

      const [result, leadStats] = await Promise.all([
        adminApi.getLeads(filters),
        adminApi.getLeadStats().catch(() => null),
      ]);
      setLeads(result.leads);
      setTotal(result.total);
      if (leadStats) setStats({ total: leadStats.total, last7Days: leadStats.last7Days });
      setError('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load leads';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, sourceFilter, statusFilter, campaignFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const handleStatusChange = async (leadId: string, status: string) => {
    try {
      setUpdatingId(leadId);
      await adminApi.updateLeadStatus(leadId, status);
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status } : l))
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update status';
      alert(message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleExport = async () => {
    try {
      const filters: Record<string, string> = {};
      if (searchTerm.trim()) filters.search = searchTerm.trim();
      if (sourceFilter) filters.source = sourceFilter;
      if (statusFilter) filters.status = statusFilter;
      if (campaignFilter.trim()) filters.campaign = campaignFilter.trim();
      if (dateFrom) filters.from = new Date(dateFrom).toISOString();
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filters.to = end.toISOString();
      }
      await adminApi.exportLeadsCsv(filters);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Export failed';
      alert(message);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>Lead Management</h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            {stats ? `${stats.total} total leads · ${stats.last7Days} in the last 7 days` : 'Capture from demo, contact, newsletter, pricing & trial funnels'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={loadLeads}
            disabled={loading}
            style={actionBtnStyle('#f3f4f6', '#374151')}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            style={actionBtnStyle('#2563eb', 'white')}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        border: '1px solid #e5e7eb',
        padding: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#374151', fontWeight: 600, fontSize: '0.875rem' }}>
          <Filter size={16} />
          Filters
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="search"
              placeholder="Search name, email, company…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadLeads()}
              style={{ ...inputStyle, paddingLeft: '2.25rem' }}
            />
          </div>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} style={inputStyle}>
            <option value="">All sources</option>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Campaign"
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            style={inputStyle}
          />
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} title="From date" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} title="To date" />
        </div>
        <button
          onClick={loadLeads}
          style={{ ...actionBtnStyle('#1f2937', 'white'), marginTop: '0.75rem' }}
        >
          Apply filters
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', fontSize: '0.875rem', color: '#6b7280' }}>
          Showing {leads.length} of {total} leads
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', textAlign: 'left' }}>
                {['Name', 'Company', 'Email', 'Mobile', 'Source', 'Campaign', 'Date', 'Status'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && leads.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading leads…</td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>No leads match your filters.</td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const badge = STATUS_COLORS[lead.status] || { bg: '#e5e7eb', color: '#374151' };
                  return (
                    <tr key={lead.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={tdStyle}>{lead.name || '—'}</td>
                      <td style={tdStyle}>{lead.company || '—'}</td>
                      <td style={tdStyle}>
                        <a href={`mailto:${lead.email}`} style={{ color: '#2563eb' }}>{lead.email}</a>
                      </td>
                      <td style={tdStyle}>{lead.mobile || '—'}</td>
                      <td style={tdStyle}>{SOURCE_LABELS[lead.source] || lead.source}</td>
                      <td style={tdStyle}>{lead.campaign || '—'}</td>
                      <td style={tdStyle}>{formatDate(lead.created_at)}</td>
                      <td style={tdStyle}>
                        <select
                          value={lead.status}
                          disabled={updatingId === lead.id}
                          onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db',
                            backgroundColor: badge.bg,
                            color: badge.color,
                            fontWeight: 500,
                            fontSize: '0.8125rem',
                            cursor: updatingId === lead.id ? 'wait' : 'pointer',
                          }}
                        >
                          {Object.entries(STATUS_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const thStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  fontWeight: 600,
  color: '#374151',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  color: '#1f2937',
  verticalAlign: 'middle',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
};

function actionBtnStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    backgroundColor: bg,
    color,
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 500,
  };
}

export default LeadManagement;
