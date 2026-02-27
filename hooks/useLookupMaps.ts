/**
 * Lookup Maps Hook
 * 
 * Creates fast lookup maps for entities to avoid repeated .find() calls.
 * This significantly improves performance when filtering/searching large datasets.
 */

import { useMemo } from 'react';
import { useStateSelector } from './useSelectiveState';

export interface LookupMaps {
  accounts: Map<string, { name: string; type: string }>;
  categories: Map<string, { name: string; type: string; isRental?: boolean }>;
  contacts: Map<string, { name: string }>;
  projects: Map<string, { name: string }>;
  buildings: Map<string, { name: string }>;
  properties: Map<string, { name: string; buildingId?: string }>;
  invoices: Map<string, { invoiceType?: string; status?: string; projectId?: string }>;
  bills: Map<string, { status?: string; projectId?: string }>;
}

/**
 * Hook that creates fast lookup maps for all entities
 * Use these maps instead of state.accounts.find() for better performance
 */
export function useLookupMaps(): LookupMaps {
  const accounts = useStateSelector(s => s.accounts);
  const categories = useStateSelector(s => s.categories);
  const contacts = useStateSelector(s => s.contacts);
  const vendors = useStateSelector(s => s.vendors);
  const projects = useStateSelector(s => s.projects);
  const buildings = useStateSelector(s => s.buildings);
  const properties = useStateSelector(s => s.properties);
  const invoices = useStateSelector(s => s.invoices);
  const bills = useStateSelector(s => s.bills);

  return useMemo(() => {
    const accountsMap = new Map<string, { name: string; type: string }>();
    (accounts || []).forEach(acc => {
      accountsMap.set(acc.id, { name: acc.name, type: acc.type });
    });

    const categoriesMap = new Map<string, { name: string; type: string; isRental?: boolean }>();
    (categories || []).forEach(cat => {
      categoriesMap.set(cat.id, {
        name: cat.name,
        type: cat.type,
        isRental: cat.isRental
      });
    });

    const contactsMap = new Map<string, { name: string }>();
    (contacts || []).forEach(contact => {
      contactsMap.set(contact.id, { name: contact.name });
    });
    (vendors || []).forEach(vendor => {
      contactsMap.set(vendor.id, { name: vendor.name });
    });

    const projectsMap = new Map<string, { name: string }>();
    (projects || []).forEach(project => {
      projectsMap.set(project.id, { name: project.name });
    });

    const buildingsMap = new Map<string, { name: string }>();
    (buildings || []).forEach(building => {
      buildingsMap.set(building.id, { name: building.name });
    });

    const propertiesMap = new Map<string, { name: string; buildingId?: string }>();
    (properties || []).forEach(property => {
      propertiesMap.set(property.id, {
        name: property.name,
        buildingId: property.buildingId
      });
    });

    const invoicesMap = new Map<string, { invoiceType?: string; status?: string; projectId?: string }>();
    (invoices || []).forEach(invoice => {
      invoicesMap.set(invoice.id, {
        invoiceType: invoice.invoiceType,
        status: invoice.status,
        projectId: invoice.projectId
      });
    });

    const billsMap = new Map<string, { status?: string; projectId?: string }>();
    (bills || []).forEach(bill => {
      billsMap.set(bill.id, {
        status: bill.status,
        projectId: bill.projectId
      });
    });

    return {
      accounts: accountsMap,
      categories: categoriesMap,
      contacts: contactsMap,
      projects: projectsMap,
      buildings: buildingsMap,
      properties: propertiesMap,
      invoices: invoicesMap,
      bills: billsMap,
    };
  }, [accounts, categories, contacts, vendors, projects, buildings, properties, invoices, bills]);
}


