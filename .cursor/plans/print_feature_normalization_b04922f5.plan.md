---
name: Print Feature Normalization
overview: Normalize and standardize print functionality across all pages, modals, and reports. Create a centralized print utility, standardize print icons, and ensure consistent print behavior (data printing vs snapshot printing).
todos:
  - id: create-print-service
    content: Create centralized print service (services/printService.ts) with printPrintableArea, printFromTemplate, and printWindow functions
    status: pending
  - id: create-print-styles
    content: Create print styles utility (utils/printStyles.ts) with standardized CSS constants
    status: pending
  - id: create-print-hook
    content: Create usePrint React hook (hooks/usePrint.ts) for consistent print handling
    status: pending
    dependencies:
      - create-print-service
  - id: create-print-button
    content: Create reusable PrintButton component (components/ui/PrintButton.tsx) with consistent styling
    status: pending
    dependencies:
      - create-print-hook
  - id: update-report-toolbar
    content: Update ReportToolbar component to use centralized print utilities and PrintButton
    status: pending
    dependencies:
      - create-print-button
  - id: update-report-components
    content: Update all 30+ report components to use centralized print utilities, remove inline styles, and use PrintButton
    status: pending
    dependencies:
      - create-print-button
      - update-report-toolbar
  - id: update-modal-components
    content: Update all modal components (ProjectContractDetailModal, PayslipDetailModal, InvoiceDetailView, etc.) to use centralized print utilities
    status: completed
    dependencies:
      - create-print-button
  - id: verify-icon-consistency
    content: Audit and verify all print icons use ICONS.print from constants.tsx, replace any hardcoded icons
    status: in_progress
  - id: test-print-functionality
    content: Test print functionality across all pages, modals, and reports on different browsers
    status: pending
    dependencies:
      - update-report-components
      - update-modal-components
  - id: document-print-utilities
    content: Add JSDoc comments and documentation for print utilities and components
    status: pending
    dependencies:
      - create-print-service
      - create-print-hook
      - create-print-button
  - id: integrate-print-template
    content: Integrate print template settings (company name, logo, address, footer) into all print outputs. Ensure print service uses printSettings from state
    status: pending
    dependencies:
      - create-print-service
  - id: ensure-report-header-footer
    content: Ensure all report components use ReportHeader and ReportFooter components to display print template settings consistently
    status: pending
    dependencies:
      - integrate-print-template
      - update-report-components
  - id: update-print-service-template
    content: Update print service to automatically inject print template header/footer when printing reports
    status: pending
    dependencies:
      - create-print-service
      - integrate-print-template
---

# Print Featu

re Normalization and Upgrade Plan

## Current State Analysis

### Print Implementation Types Found:

1. **Data Printing (Most Common)**: Uses `window.print()` with `.printable-area` class to print report data

- Found in: All report components (30+ files), modals, ledger pages
- Pattern: CSS `@media print` styles hide everything except `.printable-area`

2. **Template-Based Printing (InvoiceDetailView)**: Uses HTML template replacement before printing

- Found in: `components/invoices/InvoiceDetailView.tsx`
- Pattern: Replaces placeholders in HTML template, opens new window, then prints

3. **Icon Usage**: All components use `ICONS.print` from `constants.tsx` (consistent)

### Issues Identified:

- Print styles duplicated across 30+ files with slight variations
- No centralized print utility/service
- Inconsistent print button styling (some use `variant="secondary"`, some use primary)
- Print styles embedded inline in each component
- No standardized print configuration
- **Print template settings not consistently applied**: While `ReportHeader` and `ReportFooter` components exist and use `printSettings`, not all reports use them consistently. Some reports print raw data without company branding (logo, name, address, footer text)
- **Template settings only used in invoices**: Currently, only `InvoiceDetailView` uses the full print template with HTML replacement. Other reports should also follow the print template from settings

## Implementation Plan

### Phase 1: Create Centralized Print Utilities

#### 1.1 Create Print Utility Service

**File**: `services/printService.ts`

- Create `printPrintableArea()` function for standard data printing
- Create `printFromTemplate()` function for template-based printing
- Create `printWindow()` function for window-based printing
- **Integrate print template settings**: All print functions should automatically include company branding from `printSettings` (logo, company name, address, footer text, header text)
- Export standardized print CSS styles as constants
- Handle print preview and error handling
- Create `getPrintTemplateWrapper()` function that wraps content with print template header/footer based on settings

#### 1.2 Create Print Styles Utility

**File**: `utils/printStyles.ts`

- Extract common print CSS into reusable constants
- Create `getPrintStyles()` function that returns standardized print CSS
- Support customization options (page size, margins, etc.)

#### 1.3 Create Print Hook

**File**: `hooks/usePrint.ts`

- Custom React hook for print functionality
- Handles print button state (loading, error)
- Provides consistent print handler interface

### Phase 2: Standardize Print Components

#### 2.1 Update ReportToolbar Component

**File**: `components/reports/ReportToolbar.tsx`

- Ensure consistent print button styling
- Use centralized print utility
- Standardize icon usage (`ICONS.print`)

#### 2.2 Create PrintButton Component

**File**: `components/ui/PrintButton.tsx`

- Reusable print button component
- Consistent styling and icon
- Supports different variants (primary, secondary)
- Handles print loading states

### Phase 3: Update All Report Components

#### 3.1 Update Report Components (30+ files)

**Files to update**:

- `components/reports/BMAnalysisReport.tsx`
- `components/reports/TenantLedgerReport.tsx`
- `components/reports/BuildingAccountsReport.tsx`
- `components/reports/VendorLedgerReport.tsx`
- `components/reports/BrokerFeeReport.tsx`
- `components/reports/ClientLedgerReport.tsx`
- `components/reports/ProjectReport.tsx`
- `components/reports/ProjectMaterialReport.tsx`
- `components/reports/RevenueAnalysisReport.tsx`
- `components/reports/ProjectPMCostReport.tsx`
- `components/reports/ProjectSummaryReport.tsx`
- `components/reports/ProjectBalanceSheetReport.tsx`
- `components/reports/ProjectCashFlowReport.tsx`
- `components/reports/ProjectCategoryReport.tsx`
- `components/reports/ProjectProfitLossReport.tsx`
- `components/reports/ProjectUnitReport.tsx`
- `components/reports/ProjectContractReport.tsx`
- `components/reports/ProjectInvestorReport.tsx`
- `components/reports/ProjectLayoutReport.tsx`
- `components/reports/ProjectBrokerReport.tsx`
- `components/reports/VendorComparisonReport.tsx`
- `components/reports/ServiceChargesDeductionReport.tsx`
- `components/reports/OwnerSecurityDepositReport.tsx`
- `components/reports/OwnerPayoutsReport.tsx`
- `components/reports/EmployeePaymentReport.tsx`
- `components/reports/UnitStatusReport.tsx`
- `components/reports/PropertyLayoutReport.tsx`
- `components/reports/TransferStatisticsReport.tsx`
- `components/reports/LoanAnalysisReport.tsx`

**Changes for each**:

- Replace inline print styles with centralized utility
- Replace `handlePrint` with `usePrint` hook
- Use `PrintButton` component or ensure consistent button styling
- Ensure `.printable-area` class is properly applied
- **Ensure ReportHeader and ReportFooter are included**: All reports must include `<ReportHeader />` at the top and `<ReportFooter />` at the bottom of the printable area to display company branding from print settings
- Verify print template settings are applied (company name, logo, address, footer text, header text, printed date)

### Phase 4: Update Modal Components

#### 4.1 Update Modal Components

**Files to update**:

- `components/projectManagement/ProjectContractDetailModal.tsx`
- `components/payroll/PayslipDetailModal.tsx`
- `components/invoices/InvoiceDetailView.tsx` (special case - template-based)
- `components/transactions/TransactionDetailDrawer.tsx`
- `components/loans/LoanManagementPage.tsx`
- `components/transactions/EnhancedLedgerPage.tsx`
- `components/projectManagement/ProjectEquityManagement.tsx`
- `components/settings/TransactionLogViewer.tsx`

**Changes**:

- Use centralized print utilities
- Standardize print button styling
- Ensure consistent print behavior

### Phase 5: Integrate Print Template Settings

#### 5.1 Update Print Service for Template Integration

**File**: `services/printService.ts`

- Modify `printPrintableArea()` to automatically include print template header/footer
- Access `printSettings` from app context/state
- Inject company branding (logo, name, address) into print output
- Include footer text and printed date based on settings
- Support conditional rendering (show logo only if `showLogo` is true, etc.)

#### 5.2 Enhance ReportHeader and ReportFooter

**Files**:

- `components/reports/ReportHeader.tsx`
- `components/reports/ReportFooter.tsx`
- Ensure these components work correctly in print mode (currently use `hidden print:block` classes)
- Verify all print settings are properly displayed
- Add fallback values if settings are missing
- Ensure logo displays correctly in print (proper sizing, positioning)

#### 5.3 Audit All Reports for Template Compliance

- Verify all 30+ report components include `<ReportHeader />` and `<ReportFooter />`
- Check that reports display company branding when printed
- Ensure print template settings are respected (logo visibility, footer text, etc.)
- Update any reports that don't currently use ReportHeader/ReportFooter

### Phase 6: Verify Icon Consistency

#### 5.1 Audit All Print Icons

- Verify all components use `ICONS.print` from `constants.tsx`
- Replace any hardcoded print icons
- Ensure icon size is consistent (w-4 h-4 or w-5 h-5)

### Phase 7: Testing and Documentation

#### 7.1 Testing Checklist

- Test print functionality on all report pages
- Test print functionality on all modals
- Verify print preview shows correct content
- Test print on different browsers (Chrome, Firefox, Safari)
- Verify print styles are consistent
- Test with different page sizes (A4, Letter)
- **Verify print template integration**: Test that all printed reports show company name, logo (if enabled), address, footer text, and printed date from settings
- Test with different print settings configurations (with/without logo, with/without footer text, etc.)
- Verify ReportHeader and ReportFooter appear correctly in print preview

#### 7.2 Documentation

- Document print utility usage
- Add JSDoc comments to print functions
- Update component documentation

## Implementation Details

### Print Service Structure

```typescript
// services/printService.ts
import { PrintSettings } from '../types';

export const printPrintableArea = (
  elementId?: string, 
  printSettings?: PrintSettings
) => {
  // Standard print implementation
  // Automatically includes print template header/footer if printSettings provided
}

export const printFromTemplate = (html: string) => {
  // Template-based print (for invoices)
  // Uses invoiceHtmlTemplate from settings
}

export const getPrintTemplateWrapper = (
  content: string, 
  printSettings: PrintSettings
) => {
  // Wraps content with print template header/footer
  // Returns HTML string with company branding
}

export const STANDARD_PRINT_STYLES = `...` // Centralized CSS
```

### Print Hook Structure

```typescript
// hooks/usePrint.ts
import { PrintSettings } from '../types';

export interface PrintOptions {
  printSettings?: PrintSettings; // Automatically fetched from context if not provided
  includeTemplate?: boolean; // Whether to include print template header/footer
}

export const usePrint = (printType: 'data' | 'template', options?: PrintOptions) => {
  // Returns: { handlePrint, isPrinting, printError }
  // Automatically integrates print template settings from app context
}
```

### Print Button Component

```typescript
// components/ui/PrintButton.tsx
interface PrintButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  onPrint: () => void;
  disabled?: boolean;
}
```

## Benefits

1. **Consistency**: All print functionality uses the same utilities and patterns
2. **Maintainability**: Print styles and logic centralized in one place
3. **Reusability**: Print utilities can be easily reused in new components
4. **Icon Consistency**: All print buttons use the same icon
5. **Better UX**: Consistent print behavior across the application
6. **Easier Testing**: Centralized code is easier to test
7. **Brand Consistency**: All printed documents follow the same template from settings, ensuring consistent company branding (logo, name, address, footer) across all reports and documents
8. **Template Compliance**: All print outputs automatically use the print template settings configured in the settings page, eliminating manual branding in each component

## Migration Strategy

1. Create new utilities first (non-breaking)
2. Update components one by one, testing after each
3. Remove old inline print styles after migration
4. Update documentation

## Files to Create

- `services/printService.ts`
- `utils/printStyles.ts`
- `hooks/usePrint.ts`
- `components/ui/PrintButton.tsx`

## Files to Modify

- All report components (30+ files)
- All modal components with print (8+ files)
- `components/reports/ReportToolbar.tsx`
- `components/reports/ReportHeader.tsx` (enhance if needed)
- `components/reports/ReportFooter.tsx` (enhance if needed)
- `constants.tsx` (verify print icon)

## Estimated Impact

- **Files to create**: 4
- **Files to modify**: ~40
- **Lines of code to add**: ~600 (includes print template integration)
- **Lines of code to remove**: ~1000 (duplicated styles)

## Print Template Integration Details

### Current State

- `PrintSettings` interface includes: `companyName`, `companyAddress`, `companyContact`, `logoUrl`, `showLogo`, `footerText`, `headerText`, `showDatePrinted`
- `ReportHeader` and `ReportFooter` components exist and use these settings
- Only `InvoiceDetailView` fully uses template-based printing with HTML replacement
- Most reports don't consistently include ReportHeader/ReportFooter

### Target State

- All print outputs automatically include company branding from print settings
- Print service integrates with print settings from app context
- All reports use ReportHeader and ReportFooter components
- Print template settings are respected (logo visibility, footer text, printed date)
- Consistent branding across all printed documents (reports, invoices, payslips, contracts, etc.)

### Implementation Approach