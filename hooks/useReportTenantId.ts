import { useAuth } from '../context/AuthContext';

/** Active organization id for server-backed financial reports (must change on demo / org switch). */
export function useReportTenantId(): string | null {
  const { tenant } = useAuth();
  if (tenant?.id?.trim()) return tenant.id.trim();
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('tenant_id')?.trim();
    if (stored) return stored;
  }
  return null;
}
