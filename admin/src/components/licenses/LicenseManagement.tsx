import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import { Key, Plus, Search, Copy, Check } from 'lucide-react';

interface License {
  id: string;
  license_key: string;
  tenant_id: string;
  tenant_name: string;
  company_name: string;
  license_type: string;
  status: string;
  is_used: boolean;
  issued_date: string;
  activated_date: string | null;
  expiry_date: string | null;
}

const LicenseManagement: React.FC = () => {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showGenerator, setShowGenerator] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    loadLicenses();
  }, []);

  const loadLicenses = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getLicenses();
      setLicenses(data);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load licenses');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const filteredLicenses = licenses.filter(license => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      license.license_key.toLowerCase().includes(search) ||
      license.tenant_name?.toLowerCase().includes(search) ||
      license.company_name?.toLowerCase().includes(search)
    );
  });

  if (loading) {
    return <div>Loading licenses...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>License Management</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowGenerator(true)}
        >
          <Plus size={20} style={{ marginRight: '0.5rem' }} />
          Generate License
        </button>
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative' }}>
          <Search size={20} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
          <input
            type="text"
            className="input"
            placeholder="Search licenses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '2.5rem' }}
          />
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '0.5rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Licenses Table */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>License Key</th>
              <th>Tenant</th>
              <th>Type</th>
              <th>Status</th>
              <th>Issued Date</th>
              <th>Activated Date</th>
              <th>Expiry Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLicenses.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  No licenses found
                </td>
              </tr>
            ) : (
              filteredLicenses.map(license => (
                <tr key={license.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <code style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                        {license.license_key}
                      </code>
                      <button
                        onClick={() => handleCopy(license.license_key)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}
                        title="Copy license key"
                      >
                        {copiedKey === license.license_key ? (
                          <Check size={16} color="#16a34a" />
                        ) : (
                          <Copy size={16} color="#6b7280" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td>
                    {license.tenant_name ? (
                      <div>
                        <div style={{ fontWeight: 500 }}>{license.company_name || license.tenant_name}</div>
                        {license.company_name && (
                          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{license.tenant_name}</div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#6b7280' }}>Unassigned</span>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-info">{license.license_type}</span>
                  </td>
                  <td>
                    <span className={`badge ${
                      license.status === 'active' ? 'badge-success' :
                      license.status === 'expired' ? 'badge-danger' :
                      license.status === 'revoked' ? 'badge-danger' :
                      'badge-warning'
                    }`}>
                      {license.status}
                    </span>
                  </td>
                  <td>{new Date(license.issued_date).toLocaleDateString()}</td>
                  <td>{license.activated_date ? new Date(license.activated_date).toLocaleDateString() : '-'}</td>
                  <td>
                    {license.expiry_date
                      ? new Date(license.expiry_date).toLocaleDateString()
                      : license.license_type === 'perpetual' ? 'Never' : '-'}
                  </td>
                  <td>
                    {license.status === 'active' && (
                      <button
                        className="btn btn-danger"
                        onClick={async () => {
                          if (confirm('Are you sure you want to revoke this license?')) {
                            try {
                              await adminApi.revokeLicense(license.id);
                              await loadLicenses();
                            } catch (err: any) {
                              alert(err.message || 'Failed to revoke license');
                            }
                          }
                        }}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* License Generator Modal */}
      {showGenerator && (
        <LicenseGeneratorModal
          onClose={() => setShowGenerator(false)}
          onGenerated={loadLicenses}
        />
      )}
    </div>
  );
};

const LicenseGeneratorModal: React.FC<{ onClose: () => void; onGenerated: () => void }> = ({ onClose, onGenerated }) => {
  const [formData, setFormData] = useState({
    tenantId: '',
    licenseType: 'monthly',
    deviceId: '',
  });
  const [generatedLicense, setGeneratedLicense] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      const data = await adminApi.getTenants();
      setTenants(data);
    } catch (err) {
      console.error('Failed to load tenants:', err);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const result = await adminApi.generateLicense({
        tenantId: formData.tenantId,
        licenseType: formData.licenseType,
        deviceId: formData.deviceId || undefined,
      });
      
      setGeneratedLicense(result.licenseKey);
      onGenerated();
    } catch (err: any) {
      setError(err.message || 'Failed to generate license');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }} onClick={onClose}>
      <div className="card" style={{ maxWidth: '500px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Generate License Key</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
        </div>

        {generatedLicense ? (
          <div>
            <div style={{ padding: '1rem', backgroundColor: '#d1fae5', borderRadius: '0.5rem', marginBottom: '1rem' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#065f46' }}>License Key Generated:</p>
              <code style={{ 
                display: 'block', 
                padding: '0.75rem', 
                backgroundColor: 'white', 
                borderRadius: '0.375rem',
                fontFamily: 'monospace',
                fontSize: '1rem',
                wordBreak: 'break-all'
              }}>
                {generatedLicense}
              </code>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                navigator.clipboard.writeText(generatedLicense);
                alert('License key copied to clipboard!');
              }}
              style={{ width: '100%' }}
            >
              <Copy size={20} style={{ marginRight: '0.5rem' }} />
              Copy to Clipboard
            </button>
            <button
              className="btn btn-secondary"
              onClick={onClose}
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleGenerate}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                Tenant
              </label>
              <select
                className="input"
                value={formData.tenantId}
                onChange={(e) => setFormData({...formData, tenantId: e.target.value})}
                required
              >
                <option value="">Select a tenant</option>
                {tenants.map(tenant => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.company_name || tenant.name} ({tenant.email})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                License Type
              </label>
              <select
                className="input"
                value={formData.licenseType}
                onChange={(e) => setFormData({...formData, licenseType: e.target.value})}
                required
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="perpetual">Perpetual</option>
              </select>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                Device ID (Optional)
              </label>
              <input
                type="text"
                className="input"
                value={formData.deviceId}
                onChange={(e) => setFormData({...formData, deviceId: e.target.value})}
                placeholder="Leave empty for tenant-based license"
              />
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                If provided, license will be bound to this device ID
              </p>
            </div>

            {error && (
              <div style={{ padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ flex: 1 }}
              >
                {loading ? 'Generating...' : 'Generate License'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default LicenseManagement;

