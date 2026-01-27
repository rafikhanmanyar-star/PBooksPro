/**
 * Lookup Maps Hook
 * 
 * Creates fast lookup maps for entities to avoid repeated .find() calls.
 * This significantly improves performance when filtering/searching large datasets.
 */

import { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';

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
  const { state } = useAppContext();

  return useMemo(() => {
    // Early return if state is not available (during initialization)
    if (!state) {
      return {
        accounts: new Map(),
        categories: new Map(),
        contacts: new Map(),
        projects: new Map(),
        buildings: new Map(),
        properties: new Map(),
        invoices: new Map(),
        bills: new Map(),
      };
    }

    // Create Maps for O(1) lookups instead of O(n) .find() calls
    // Add defensive checks to handle undefined/null arrays during initialization
    const accountsMap = new Map<string, { name: string; type: string }>();
    (state.accounts || []).forEach(acc => {
      accountsMap.set(acc.id, { name: acc.name, type: acc.type });
    });

    const categoriesMap = new Map<string, { name: string; type: string; isRental?: boolean }>();
    (state.categories || []).forEach(cat => {
      categoriesMap.set(cat.id, { 
        name: cat.name, 
        type: cat.type,
        isRental: cat.isRental 
      });
    });

    const contactsMap = new Map<string, { name: string }>();
    (state.contacts || []).forEach(contact => {
      contactsMap.set(contact.id, { name: contact.name });
    });

    const projectsMap = new Map<string, { name: string }>();
    (state.projects || []).forEach(project => {
      projectsMap.set(project.id, { name: project.name });
    });

    const buildingsMap = new Map<string, { name: string }>();
    (state.buildings || []).forEach(building => {
      buildingsMap.set(building.id, { name: building.name });
    });

    const propertiesMap = new Map<string, { name: string; buildingId?: string }>();
    (state.properties || []).forEach(property => {
      propertiesMap.set(property.id, { 
        name: property.name, 
        buildingId: property.buildingId 
      });
    });

    const invoicesMap = new Map<string, { invoiceType?: string; status?: string; projectId?: string }>();
    (state.invoices || []).forEach(invoice => {
      invoicesMap.set(invoice.id, {
        invoiceType: invoice.invoiceType,
        status: invoice.status,
        projectId: invoice.projectId
      });
    });

    const billsMap = new Map<string, { status?: string; projectId?: string }>();
    (state.bills || []).forEach(bill => {
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
  }, [
    state?.accounts,
    state?.categories,
    state?.contacts,
    state?.projects,
    state?.buildings,
    state?.properties,
    state?.invoices,
    state?.bills,
  ]);
}


