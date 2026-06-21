import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmploymentStatus } from '../../../components/payroll/types';
import { payrollApi } from '../../../services/api/payrollApi';
import { useProjects, useVendors } from '../../../hooks/useSelectiveState';

export type CatalogItem = { id: string; name: string; subtitle?: string };

export function useQuickCaptureCatalog() {
  const vendors = useVendors();
  const projects = useProjects();

  const employeesQuery = useQuery({
    queryKey: ['quick-capture-employees'],
    queryFn: () => payrollApi.getEmployees(),
    staleTime: 120_000,
  });

  const vendorItems = useMemo<CatalogItem[]>(
    () =>
      (vendors ?? [])
        .map((v) => ({ id: v.id, name: v.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [vendors]
  );

  const staffItems = useMemo<CatalogItem[]>(
    () =>
      (employeesQuery.data ?? [])
        .filter((e) => e.status !== EmploymentStatus.TERMINATED)
        .map((e) => ({
          id: e.id,
          name: e.name,
          subtitle: [e.designation, e.department].filter(Boolean).join(' · ') || undefined,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [employeesQuery.data]
  );

  const projectItems = useMemo<CatalogItem[]>(
    () =>
      (projects ?? [])
        .map((p) => ({ id: p.id, name: p.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  );

  return {
    vendorItems,
    staffItems,
    projectItems,
    isLoadingEmployees: employeesQuery.isLoading,
    employeesError: employeesQuery.error,
  };
}
