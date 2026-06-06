import type { RegisteredField } from './fieldRegistryTypes.js';
import {
  getProjectSellingFieldRegistry,
  PROJECT_SELLING_MODULE_KEY,
} from './projectSellingFields.js';
import {
  getRentalAgreementsFieldRegistry,
  RENTAL_AGREEMENTS_GROUP_DIMENSIONS,
  RENTAL_AGREEMENTS_MODULE_KEY,
} from './rentalAgreementsFields.js';

/** Group-by tokens supported for project selling reports */
export const PROJECT_SELLING_GROUP_DIMENSIONS: Record<string, string> = {
  project_id: 'proj.id',
  project_name: 'proj.name',
  broker_id: 'broker.id',
  broker_name: 'broker.name',
  customer_id: 'client.id',
  customer_name: 'client.name',
  unit_type: 'uagg.primary_unit_type',
  issue_month: "date_trunc('month', pa.issue_date::timestamp)",
  issue_year: "date_trunc('year', pa.issue_date::timestamp)",
};

export type ReportModuleRegistry = {
  moduleKey: string;
  fields: RegisteredField[];
  groupDimensions: Record<string, string>;
};

export const REPORT_MODULE_CATALOG: { key: string; label: string }[] = [
  { key: PROJECT_SELLING_MODULE_KEY, label: 'Project selling' },
  { key: RENTAL_AGREEMENTS_MODULE_KEY, label: 'Rental agreements' },
];

export function getRegistryForModule(moduleKey: string): ReportModuleRegistry {
  switch (moduleKey) {
    case PROJECT_SELLING_MODULE_KEY:
      return {
        moduleKey: PROJECT_SELLING_MODULE_KEY,
        fields: getProjectSellingFieldRegistry(),
        groupDimensions: PROJECT_SELLING_GROUP_DIMENSIONS,
      };
    case RENTAL_AGREEMENTS_MODULE_KEY:
      return {
        moduleKey: RENTAL_AGREEMENTS_MODULE_KEY,
        fields: getRentalAgreementsFieldRegistry(),
        groupDimensions: RENTAL_AGREEMENTS_GROUP_DIMENSIONS,
      };
    default:
      throw new Error(`UNKNOWN_REPORT_MODULE:${moduleKey}`);
  }
}
