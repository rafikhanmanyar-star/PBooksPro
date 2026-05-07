import type { RegisteredField } from './fieldRegistryTypes.js';
import {
  getProjectSellingFieldRegistry,
  PROJECT_SELLING_MODULE_KEY,
} from './projectSellingFields.js';

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

export function getRegistryForModule(moduleKey: string): ReportModuleRegistry {
  switch (moduleKey) {
    case PROJECT_SELLING_MODULE_KEY:
      return {
        moduleKey: PROJECT_SELLING_MODULE_KEY,
        fields: getProjectSellingFieldRegistry(),
        groupDimensions: PROJECT_SELLING_GROUP_DIMENSIONS,
      };
    default:
      throw new Error(`UNKNOWN_REPORT_MODULE:${moduleKey}`);
  }
}
