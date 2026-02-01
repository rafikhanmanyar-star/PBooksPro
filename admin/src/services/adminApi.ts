// Use environment variable with fallback to production for backwards compatibility
const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL || 'https://pbookspro-api.onrender.com/api/admin';

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

  async updateTenant(tenantId: string, data: { maxUsers?: number; name?: string; companyName?: string; email?: string; phone?: string; address?: string; subscriptionTier?: string; licenseType?: string; licenseStatus?: string }) {
    const response = await fetch(`${ADMIN_API_URL}/tenants/${tenantId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update tenant');
    }
    return response.json();
  }

  async deleteTenant(tenantId: string) {
    const response = await fetch(`${ADMIN_API_URL}/tenants/${tenantId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete tenant');
    }
    return response.json();
  }

  // License Management
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
    try {
      const response = await fetch(`${ADMIN_API_URL}/stats/dashboard`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        // Log detailed error for debugging
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}` };
        }

        console.error('Dashboard stats API error:', {
          status: response.status,
          statusText: response.statusText,
          url: `${ADMIN_API_URL}/stats/dashboard`,
          error: errorData
        });

        throw new Error(errorData.error || `Failed to fetch dashboard stats (${response.status})`);
      }

      return response.json();
    } catch (error: any) {
      // Re-throw with more context
      if (error.message) {
        throw error;
      }
      throw new Error(`Network error: ${error.message || 'Failed to fetch dashboard stats'}`);
    }
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

  // Tenant User Management
  async getTenantUsers(tenantId: string) {
    const response = await fetch(`${ADMIN_API_URL}/tenants/${tenantId}/users`, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch tenant users');
    }
    return response.json();
  }

  async resetTenantUserPassword(tenantId: string, userId: string, newPassword: string) {
    const response = await fetch(`${ADMIN_API_URL}/tenants/${tenantId}/users/${userId}/reset-password`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ newPassword }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reset password');
    }
    return response.json();
  }

  async deleteTenantUser(tenantId: string, userId: string) {
    const response = await fetch(`${ADMIN_API_URL}/tenants/${tenantId}/users/${userId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.message || 'Failed to delete user');
    }
    return response.json();
  }

  async forceLogoutTenantUser(tenantId: string, userId: string) {
    const response = await fetch(`${ADMIN_API_URL}/tenants/${tenantId}/users/${userId}/force-logout`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to force logout');
    }
    return response.json();
  }

  // Marketplace Management
  async getMarketplaceAds() {
    const response = await fetch(`${ADMIN_API_URL}/marketplace/ads`, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch marketplace ads');
    return response.json();
  }

  async approveMarketplaceAd(adId: string) {
    const response = await fetch(`${ADMIN_API_URL}/marketplace/ads/${adId}/approve`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to approve ad');
    return response.json();
  }

  async rejectMarketplaceAd(adId: string, reason?: string) {
    const response = await fetch(`${ADMIN_API_URL}/marketplace/ads/${adId}/reject`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) throw new Error('Failed to reject ad');
    return response.json();
  }

  async getMarketplaceCategories() {
    const response = await fetch(`${ADMIN_API_URL}/marketplace/categories`, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch marketplace categories');
    return response.json();
  }

  async createMarketplaceCategory(data: { id: string; name: string; display_order?: number }) {
    const response = await fetch(`${ADMIN_API_URL}/marketplace/categories`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create category');
    }
    return response.json();
  }

  async updateMarketplaceCategory(categoryId: string, data: { name: string; display_order: number }) {
    const response = await fetch(`${ADMIN_API_URL}/marketplace/categories/${categoryId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update category');
    }
    return response.json();
  }

  async deleteMarketplaceCategory(categoryId: string) {
    const response = await fetch(`${ADMIN_API_URL}/marketplace/categories/${categoryId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete category');
    }
    return response.json();
  }
}

export const adminApi = new AdminApi();

