# Payroll System Categories (Chart of Accounts)

## Overview
The payroll system includes default system categories (Chart of Accounts) that are automatically created for every tenant. These categories are protected from deletion and editing, but users can create additional custom categories for their payroll needs.

## System Categories

### Employee Compensation
- **Employee Salary** (`sys-cat-emp-sal`)
  - Primary category for enterprise employee salary payments
  - Used automatically when processing payslip payments
  - Description: System category for enterprise employee salaries

### Employee Benefits & Allowances
- **Employee Benefits** (`sys-cat-emp-benefits`)
  - For employee benefits expenses (health insurance, retirement, etc.)
  - Description: System category for employee benefits expenses

- **Employee Allowances** (`sys-cat-emp-allow`)
  - For employee allowances (transport, meal, housing, etc.)
  - Description: System category for employee allowances (transport, meal, etc.)

### Statutory Deductions
- **Provident Fund (PF)** (`sys-cat-pf-expense`)
  - For Provident Fund contributions and expenses
  - Description: System category for Provident Fund contributions

- **Employee State Insurance (ESI)** (`sys-cat-esi-expense`)
  - For ESI contributions and expenses
  - Description: System category for ESI contributions

- **Employee Deductions** (`sys-cat-emp-deduct`)
  - General category for employee deductions
  - Description: System category for employee deductions

### Taxes & Insurance
- **Payroll Tax Expense** (`sys-cat-payroll-tax`)
  - For payroll tax expenses
  - Description: System category for payroll tax expenses

- **Employee Insurance** (`sys-cat-emp-insurance`)
  - For employee insurance expenses (health, life, etc.)
  - Description: System category for employee insurance expenses

### Additional Compensation
- **Bonuses & Incentives** (`sys-cat-bonus-inc`)
  - For employee bonuses and incentives
  - Description: System category for employee bonuses and incentives

- **Overtime Pay** (`sys-cat-overtime`)
  - For overtime pay expenses
  - Description: System category for overtime pay expenses

- **Commission Expense** (`sys-cat-commission`)
  - For employee commission expenses
  - Description: System category for employee commission expenses

### Termination & Settlement
- **Gratuity Expense** (`sys-cat-gratuity`)
  - For gratuity payments to employees
  - Description: System category for gratuity payments

- **Leave Encashment** (`sys-cat-leave-encash`)
  - For leave encashment expenses
  - Description: System category for leave encashment expenses

- **Employee Termination Settlement** (`sys-cat-termination-settle`)
  - For employee termination settlement expenses
  - Description: System category for employee termination settlements

### Processing
- **Payroll Processing Fee** (`sys-cat-payroll-processing`)
  - For payroll processing fees (if using third-party services)
  - Description: System category for payroll processing fees

## How System Categories Work

1. **Automatic Creation**: System categories are automatically created when:
   - A tenant is initialized
   - Categories are fetched from the API (via `ensureSystemCategories`)

2. **Protection**: System categories are protected from:
   - Deletion (returns 403 error)
   - Editing (returns 403 error)
   - Frontend UI shows them as read-only

3. **Custom Categories**: Users can create additional categories:
   - Via the Category Management UI
   - These will be merged with system categories
   - Custom categories can be edited and deleted

4. **Usage in Payroll**:
   - When paying enterprise payslips, the system automatically uses "Employee Salary" category
   - Users can assign different categories to transactions if needed
   - Categories are used for financial reporting and analytics

## Creating Custom Payroll Categories

Users can create custom categories for specific payroll needs:

1. Go to Settings → Categories
2. Click "Add Category"
3. Select "Expense" as the type
4. Enter a descriptive name (e.g., "Department-Specific Allowances", "Performance Bonuses", etc.)
5. Save the category

Custom categories will appear alongside system categories and can be used in:
- Payslip payments
- Manual payroll transactions
- Financial reports
- Analytics and KPIs

## Category Assignment

When processing payroll payments:
- **Enterprise Payslips**: Automatically uses "Employee Salary" (`sys-cat-emp-sal`)
- **Project Staff Payslips**: Uses "Project Staff Salary" (`sys-cat-proj-sal`)
- **Rental Staff Payslips**: Uses "Rental Staff Salary" (`sys-cat-rent-sal`)

These can be manually changed in transactions if needed for specific accounting requirements.

## Technical Notes

- System categories have `isPermanent: true` flag
- Category IDs start with `sys-cat-` prefix
- System categories are defined in:
  - `context/AppContext.tsx` (frontend)
  - `server/services/tenantInitializationService.ts` (backend)
- Categories are synced to cloud database automatically
- System categories are ensured to exist on every category fetch
