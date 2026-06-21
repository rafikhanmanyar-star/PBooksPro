import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmploymentStatus } from '../../../components/payroll/types';
import { useAuth } from '../../../context/AuthContext';
import { payrollApi } from '../../../services/api/payrollApi';
import { ContactsApiRepository } from '../../../services/api/repositories/contactsApi';
import { VendorsApiRepository } from '../../../services/api/repositories/vendorsApi';
import { useContacts, useProjects, useVendors } from '../../../hooks/useSelectiveState';
import type { Contact, Vendor } from '../../../types';

export type CatalogItem = { id: string; name: string; subtitle?: string };

const vendorsRepo = new VendorsApiRepository();
const contactsRepo = new ContactsApiRepository();

function catalogDisplayName(name?: string, companyName?: string, fallback = 'Unnamed'): string {
  return name?.trim() || companyName?.trim() || fallback;
}

function toVendorItems(vendors: Vendor[]): CatalogItem[] {
  return vendors
    .filter((v) => v.isActive !== false)
    .map((v) => ({
      id: v.id,
      name: catalogDisplayName(v.name, v.companyName),
      subtitle:
        [v.companyName && v.companyName !== v.name ? v.companyName : undefined, v.contactNo]
          .filter(Boolean)
          .join(' · ') || undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function toContactItems(contacts: Contact[]): CatalogItem[] {
  return contacts
    .filter((c) => c.isActive !== false)
    .map((c) => ({
      id: c.id,
      name: catalogDisplayName(c.name, c.companyName),
      subtitle: [c.companyName && c.companyName !== c.name ? c.companyName : undefined, c.contactNo]
        .filter(Boolean)
        .join(' · ') || undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Prefer API query results; fall back to AppState when deferred bootstrap already loaded slices. */
function pickCatalogSource<T>(queryData: T[] | undefined, appStateSlice: T[] | undefined): T[] {
  if (queryData && queryData.length > 0) return queryData;
  if (appStateSlice && appStateSlice.length > 0) return appStateSlice;
  return queryData ?? appStateSlice ?? [];
}

export function useQuickCaptureCatalog() {
  const { isAuthenticated, user } = useAuth();
  const tenantId = user?.tenantId;

  const appVendors = useVendors();
  const appContacts = useContacts();
  const projects = useProjects();

  const vendorsQuery = useQuery({
    queryKey: ['quick-capture-vendors', tenantId],
    queryFn: () => vendorsRepo.findAll(),
    enabled: isAuthenticated,
    staleTime: 120_000,
    retry: 2,
  });

  const contactsQuery = useQuery({
    queryKey: ['quick-capture-contacts', tenantId],
    queryFn: () => contactsRepo.findAll(),
    enabled: isAuthenticated,
    staleTime: 120_000,
    retry: 2,
  });

  const employeesQuery = useQuery({
    queryKey: ['quick-capture-employees', tenantId],
    queryFn: () => payrollApi.getEmployees(),
    enabled: isAuthenticated,
    staleTime: 120_000,
    retry: 2,
  });

  const vendorItems = useMemo(
    () => toVendorItems(pickCatalogSource(vendorsQuery.data, appVendors)),
    [vendorsQuery.data, appVendors]
  );

  const customerItems = useMemo(
    () => toContactItems(pickCatalogSource(contactsQuery.data, appContacts)),
    [contactsQuery.data, appContacts]
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
    customerItems,
    projectItems,
    isLoadingVendors: vendorsQuery.isLoading && vendorItems.length === 0,
    isLoadingEmployees: employeesQuery.isLoading && staffItems.length === 0,
    isLoadingContacts: contactsQuery.isLoading && customerItems.length === 0,
    vendorsError: vendorsQuery.error,
    employeesError: employeesQuery.error,
    contactsError: contactsQuery.error,
    refetchVendors: vendorsQuery.refetch,
    refetchEmployees: employeesQuery.refetch,
  };
}
