import React from 'react';
import CustomReportBuilderPage, {
  type ReportDesignerPageProps,
} from '../../components/reports/customReportBuilder/CustomReportBuilderPage';
import {
  CUSTOM_REPORT_MODULE_PROJECT_CONSTRUCTION,
  CUSTOM_REPORT_MODULE_PROJECT_SELLING,
  CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS,
  type CustomReportModuleKey,
} from '../../services/api/customReportsApi';
import { MODULE_SCOPE_LABELS } from './config/moduleDefaults';

/** Universal Report Designer — full module picker (Accounting → Report Designer). */
const ReportDesignerPage: React.FC<ReportDesignerPageProps> = (props) => (
  <CustomReportBuilderPage
    title="Report Designer"
    subtitle="Build, save, and export custom reports across PBooks Pro modules."
    showModulePicker
    {...props}
  />
);

export function ProjectSellingCustomReportsPage() {
  return (
    <CustomReportBuilderPage
      initialModule={CUSTOM_REPORT_MODULE_PROJECT_SELLING}
      lockModule
      {...MODULE_SCOPE_LABELS[CUSTOM_REPORT_MODULE_PROJECT_SELLING]}
    />
  );
}

export function ProjectConstructionCustomReportsPage() {
  return (
    <CustomReportBuilderPage
      initialModule={CUSTOM_REPORT_MODULE_PROJECT_CONSTRUCTION}
      lockModule
      {...MODULE_SCOPE_LABELS[CUSTOM_REPORT_MODULE_PROJECT_CONSTRUCTION]}
    />
  );
}

export function RentalCustomReportsPage() {
  return (
    <CustomReportBuilderPage
      initialModule={CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS}
      lockModule
      {...MODULE_SCOPE_LABELS[CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS]}
    />
  );
}

export function ModuleCustomReportsPage({ module }: { module: CustomReportModuleKey }) {
  const labels = MODULE_SCOPE_LABELS[module];
  return (
    <CustomReportBuilderPage
      initialModule={module}
      lockModule
      title={labels.title}
      subtitle={labels.subtitle}
    />
  );
}

export default ReportDesignerPage;
export type { ReportDesignerPageProps };
