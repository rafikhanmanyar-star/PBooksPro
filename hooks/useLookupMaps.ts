/**
 * Lookup Maps Hook
 * 
 * Creates fast lookup maps for entities to avoid repeated .find() calls.
 * This significantly improves performance when filtering/searching large datasets.
 */

import { useMemo } from 'react';
import { useStateSelector } from './useSelectiveState';

export interface InvoiceLookup {
  invoiceNumber?: string;
  invoiceType?: string;
  status?: string;
  projectId?: string;
  categoryId?: string;
  contactId?: string;
  vendorId?: string;
  buildingId?: string;
  propertyId?: string;
  unitId?: string;
  agreementId?: string;
}

export interface BillLookup {
  billNumber?: string;
  status?: string;
  projectId?: string;
  categoryId?: string;
  contactId?: string;
  vendorId?: string;
  buildingId?: string;
  propertyId?: string;
  contractId?: string;
}

export interface LookupMaps {
  accounts: Map<string, { name: string; type: string }>;
  categories: Map<string, { name: string; type: string; isRental?: boolean }>;
  contacts: Map<string, { name: string }>;
  vendors: Map<string, { name: string }>;
  projects: Map<string, { name: string }>;
  buildings: Map<string, { name: string }>;
  properties: Map<string, { name: string; buildingId?: string }>;
  units: Map<string, { name: string; projectId?: string }>;
  invoices: Map<string, InvoiceLookup>;
  bills: Map<string, BillLookup>;
  contracts: Map<string, { name: string; contractNumber: string }>;
  rentalAgreements: Map<string, { agreementNumber: string }>;
  projectAgreements: Map<string, { agreementNumber: string }>;
  users: Map<string, { name: string }>;
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
  const units = useStateSelector(s => s.units);
  const contracts = useStateSelector(s => s.contracts);
  const rentalAgreements = useStateSelector(s => s.rentalAgreements);
  const projectAgreements = useStateSelector(s => s.projectAgreements);
  const users = useStateSelector(s => s.users);

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

    const vendorsMap = new Map<string, { name: string }>();
    (vendors || []).forEach(vendor => {
      vendorsMap.set(vendor.id, { name: vendor.name });
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

    const unitsMap = new Map<string, { name: string; projectId?: string }>();
    (units || []).forEach(unit => {
      unitsMap.set(unit.id, { name: unit.name, projectId: unit.projectId });
    });

    const invoicesMap = new Map<string, InvoiceLookup>();
    (invoices || []).forEach(invoice => {
      invoicesMap.set(invoice.id, {
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: invoice.invoiceType,
        status: invoice.status,
        projectId: invoice.projectId,
        categoryId: invoice.categoryId,
        contactId: invoice.contactId,
        vendorId: invoice.vendorId,
        buildingId: invoice.buildingId,
        propertyId: invoice.propertyId,
        unitId: invoice.unitId,
        agreementId: invoice.agreementId,
      });
    });

    const billsMap = new Map<string, BillLookup>();
    (bills || []).forEach(bill => {
      billsMap.set(bill.id, {
        billNumber: bill.billNumber,
        status: bill.status,
        projectId: bill.projectId,
        categoryId: bill.categoryId,
        contactId: bill.contactId,
        vendorId: bill.vendorId,
        buildingId: bill.buildingId,
        propertyId: bill.propertyId,
        contractId: bill.contractId,
      });
    });

    const contractsMap = new Map<string, { name: string; contractNumber: string }>();
    (contracts || []).forEach(contract => {
      contractsMap.set(contract.id, {
        name: contract.name,
        contractNumber: contract.contractNumber,
      });
    });

    const rentalAgreementsMap = new Map<string, { agreementNumber: string }>();
    (rentalAgreements || []).forEach(agreement => {
      rentalAgreementsMap.set(agreement.id, { agreementNumber: agreement.agreementNumber });
    });

    const projectAgreementsMap = new Map<string, { agreementNumber: string }>();
    (projectAgreements || []).forEach(agreement => {
      projectAgreementsMap.set(agreement.id, { agreementNumber: agreement.agreementNumber });
    });

    const usersMap = new Map<string, { name: string }>();
    (users || []).forEach(user => {
      usersMap.set(user.id, { name: user.name || user.username || user.id });
    });

    return {
      accounts: accountsMap,
      categories: categoriesMap,
      contacts: contactsMap,
      vendors: vendorsMap,
      projects: projectsMap,
      buildings: buildingsMap,
      properties: propertiesMap,
      units: unitsMap,
      invoices: invoicesMap,
      bills: billsMap,
      contracts: contractsMap,
      rentalAgreements: rentalAgreementsMap,
      projectAgreements: projectAgreementsMap,
      users: usersMap,
    };
  }, [accounts, categories, contacts, vendors, projects, buildings, properties, units, invoices, bills, contracts, rentalAgreements, projectAgreements, users]);
}


