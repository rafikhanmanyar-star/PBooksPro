// HARDCODED: Always use production API URL
// This ensures the deployed version always uses the correct URL
const ADMIN_API_URL = 'https://pbookspro-api.onrender.com/api/admin';

// Debug: Log the API URL being used
console.log('🔧 Admin API URL:', ADMIN_API_URL);
console.log('🔧 Hostname:', typeof window !== 'undefined' ? window.location.hostname : 'server');

class AdminApi {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('admin_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  }

  async login(username: string, password: string) {
    const response = await fetch(`${ADMIN_API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }
    return response.json();
  }

  async getCurrentAdmin(token: string) {
    const response = await fetch(`${ADMIN_API_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Invalid session');
    return response.json();
  }

  // Tenant Management
  async getTenants(filters?: any) {
    const params = new URLSearchParams(filters);
    const response = await fetch(`${ADMIN_API_URL}/tenants?${params}`, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch tenants');
    return response.json();
  }

  async getTenant(tenantId: string) {
    const response = await fetch(`${ADMIN_API_URL}/tenants/${tenantId}`, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch tenant');
    return response.json();
  }

  async getTenantStats(tenantId: string) {
    const response = await fetch(`${ADMIN_API_URL}/tenants/${tenantId}/stats`, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch tenant stats');
    return response.json();
  }

  async suspendTenant(tenantId: string) {
    const response = await fetch(`${ADMIN_API_URL}/tenants/${tenantId}/suspend`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to suspend tenant');
    return response.json();
  }

  async activateTenant(tenantId: string) {
    const response = await fetch(`${ADMIN_API_URL}/tenants/${tenantId}/activate`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to activate tenant');
    return response.json();
  }

  // License Management
  async generateLicense(data: { tenantId: string; licenseType: string; deviceId?: string }) {
    const response = await fetch(`${ADMIN_API_URL}/licenses/generate`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate license');
    }
    return response.json();
  }

  async getLicenses(filters?: any) {
    const params = new URLSearchParams(filters);
    const response = await fetch(`${ADMIN_API_URL}/licenses?${params}`, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch licenses');
    return response.json();
  }

  async getLicenseHistory(tenantId: string) {
    const response = await fetch(`${ADMIN_API_URL}/licenses/tenant/${tenantId}/history`, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch license history');
    return response.json();
  }

  async revokeLicense(licenseId: string) {
    const response = await fetch(`${ADMIN_API_URL}/licenses/${licenseId}/revoke`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to revoke license');
    return response.json();
  }

  // Dashboard Stats
  async getDashboardStats() {
    const response = await fetch(`${ADMIN_API_URL}/stats/dashboard`, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch dashboard stats');
    return response.json();
  }

  // Admin User Management
  async getAdminUsers(filters?: any) {
    const params = new URLSearchParams(filters);
    const response = await fetch(`${ADMIN_API_URL}/users?${params}`, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch admin users');
    }
    return response.json();
  }

  async getAdminUser(userId: string) {
    const response = await fetch(`${ADMIN_API_URL}/users/${userId}`, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch admin user');
    }
    return response.json();
  }

  async createAdminUser(data: { username: string; name: string; email: string; password: string; role?: string }) {
    const response = await fetch(`${ADMIN_API_URL}/users`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create admin user');
    }
    return response.json();
  }

  async updateAdminUser(userId: string, data: { username?: string; name?: string; email?: string; password?: string; role?: string; is_active?: boolean }) {
    const response = await fetch(`${ADMIN_API_URL}/users/${userId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update admin user');
    }
    return response.json();
  }

  async deleteAdminUser(userId: string) {
    const response = await fetch(`${ADMIN_API_URL}/users/${userId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete admin user');
    }
    return response.json();
  }
}

export const adminApi = new AdminApi();

