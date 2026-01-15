import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import { Users, Key, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface DashboardStats {
  tenants: {
    total: number;
    active: number;
    expired: number;
    trial: number;
  };
  licenses: {
    monthly: number;
    yearly: number;
    perpetual: number;
  };
  licenseReport: {
    renewalsDueIn30Days: number;
    renewalsDueIn7Days: number;
    paymentsTotalByCurrency: Record<string, { count: number; total: number }>;
    paymentsLast30DaysByCurrency: Record<string, { count: number; total: number }>;
  };
  usage: {
    totalUsers: number;
    totalTransactions: number;
  };
}

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await adminApi.getDashboardStats();
      setStats(data);
    } catch (err: any) {
      console.error('Dashboard stats load error:', err);
      const errorMessage = err?.message || err?.error || 'Failed to load dashboard statistics';
      setError(errorMessage);
      
      // If it's a 401, the user might need to re-login
      if (err?.status === 401 || errorMessage.includes('401')) {
        setError('Session expired. Please login again.');
        // Optionally redirect to login
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Loading dashboard...</div>;
  }

  if (error) {
    return <div style={{ color: 'red' }}>Error: {error}</div>;
  }

  if (!stats) {
    return <div>No data available</div>;
  }

  const statCards = [
    {
      title: 'Total Tenants',
      value: stats.tenants.total,
      icon: Users,
      color: '#2563eb',
      bgColor: '#dbeafe'
    },
    {
      title: 'Active Tenants',
      value: stats.tenants.active,
      icon: CheckCircle,
      color: '#16a34a',
      bgColor: '#d1fae5'
    },
    {
      title: 'Expired Licenses',
      value: stats.tenants.expired,
      icon: AlertCircle,
      color: '#dc2626',
      bgColor: '#fee2e2'
    },
    {
      title: 'Trial Tenants',
      value: stats.tenants.trial,
      icon: Clock,
      color: '#f59e0b',
      bgColor: '#fef3c7'
    },
    {
      title: 'Monthly Licenses',
      value: stats.licenses.monthly,
      icon: Key,
      color: '#7c3aed',
      bgColor: '#ede9fe'
    },
    {
      title: 'Yearly Licenses',
      value: stats.licenses.yearly,
      icon: Key,
      color: '#059669',
      bgColor: '#d1fae5'
    },
    {
      title: 'Perpetual Licenses',
      value: stats.licenses.perpetual,
      icon: Key,
      color: '#0891b2',
      bgColor: '#cffafe'
    },
    {
      title: 'Total Users',
      value: stats.usage.totalUsers,
      icon: Users,
      color: '#ea580c',
      bgColor: '#fed7aa'
    }
  ];

  const formatCurrency = (currency: string, amount: number) => {
    if (currency === 'PKR') {
      return `PKR ${amount.toLocaleString()}`;
    }
    if (currency === 'USD') {
      return `$${amount.toLocaleString()}`;
    }
    return `${currency} ${amount.toLocaleString()}`;
  };

  const renderCurrencyRows = (data: Record<string, { count: number; total: number }>) => {
    const entries = Object.entries(data);
    if (entries.length === 0) {
      return (
        <tr>
          <td colSpan={3} style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            No payment data available
          </td>
        </tr>
      );
    }

    return entries.map(([currency, values]) => (
      <tr key={currency}>
        <td style={{ fontWeight: 600 }}>{currency}</td>
        <td>{values.count.toLocaleString()}</td>
        <td>{formatCurrency(currency, values.total)}</td>
      </tr>
    ));
  };

  return (
    <div>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>
        Dashboard
      </h1>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div key={index} className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    {card.title}
                  </p>
                  <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827' }}>
                    {card.value}
                  </p>
                </div>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '0.5rem',
                  backgroundColor: card.bgColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon size={24} color={card.color} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          System Overview
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Total Transactions
            </p>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {stats.usage.totalTransactions.toLocaleString()}
            </p>
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              License Conversion Rate
            </p>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {stats.tenants.total > 0
                ? ((stats.tenants.active - stats.tenants.trial) / stats.tenants.total * 100).toFixed(1)
                : 0}%
            </p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          License & Renewal Report
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
          <div>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Renewals Due (Next 7 Days)
            </p>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {stats.licenseReport.renewalsDueIn7Days.toLocaleString()}
            </p>
          </div>
          <div>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Renewals Due (Next 30 Days)
            </p>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {stats.licenseReport.renewalsDueIn30Days.toLocaleString()}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
          <div>
            <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Completed Payments (All Time)
            </p>
            <table style={{ width: '100%', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6b7280' }}>
                  <th>Currency</th>
                  <th>Count</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {renderCurrencyRows(stats.licenseReport.paymentsTotalByCurrency)}
              </tbody>
            </table>
          </div>
          <div>
            <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Completed Payments (Last 30 Days)
            </p>
            <table style={{ width: '100%', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6b7280' }}>
                  <th>Currency</th>
                  <th>Count</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {renderCurrencyRows(stats.licenseReport.paymentsLast30DaysByCurrency)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;

