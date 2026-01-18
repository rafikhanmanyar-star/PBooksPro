# Payroll System - Implementation Requirements

## Summary
The payroll system infrastructure is in place (database schemas, reducer actions, API routes), but several UI components are missing. This document outlines what needs to be implemented.

## Database Schemas ✅ COMPLETE
Both local (SQLite) and cloud (PostgreSQL) schemas are complete with all required tables.

## Required Implementations

### 1. Enterprise Payroll Payment System ⚠️ CRITICAL

**Missing:**
- `MARK_PAYSLIP_PAID` action in reducer for enterprise payroll (state.payslips array)
- Payment modal component for enterprise payslips
- Integration in payroll management UI

**Files to Create/Update:**
- `context/AppContext.tsx` - Add `MARK_PAYSLIP_PAID` action handler
- `components/payroll/EnterprisePayslipPaymentModal.tsx` - New component
- `components/payroll/PayrollReports.tsx` or similar - Add payment buttons

**Functionality:**
- Pay individual enterprise payslip
- Create transaction linked to payslip
- Update payslip status and paidAmount
- Handle cost allocations (multi-project)
- Support bulk payments

### 2. Employee Lifecycle Management UI ⚠️ CRITICAL

**Missing Components:**
- Termination modal with settlement calculation
- Promotion modal with salary update
- Transfer modal with project assignment update

**Files to Create:**
- `components/payroll/EmployeeTerminationModal.tsx`
- `components/payroll/EmployeePromotionModal.tsx`
- `components/payroll/EmployeeTransferModal.tsx`

**Integration:**
- Add buttons/actions in `EmployeeManagement.tsx` or `EmployeeDetailView.tsx`
- Connect to existing reducer actions: `TERMINATE_EMPLOYEE`, `PROMOTE_EMPLOYEE`, `TRANSFER_EMPLOYEE`

**Features Needed:**
- Termination: Calculate final settlement, gratuity, leave encashment
- Promotion: Update designation, salary, department, grade
- Transfer: Update project assignments, cost allocations

### 3. Attendance Management System ⚠️ HIGH PRIORITY

**Missing Components:**
- Main attendance management page
- Attendance entry modal (individual/bulk)
- Calendar view
- Reports

**Files to Create:**
- `components/payroll/AttendanceManagement.tsx`
- `components/payroll/AttendanceEntryModal.tsx`
- `components/payroll/AttendanceCalendar.tsx` (optional)

**Integration:**
- Add route in navigation
- Connect to existing reducer actions: `ADD_ATTENDANCE`, `UPDATE_ATTENDANCE`, `BULK_ADD_ATTENDANCE`
- Integrate with payroll processing (used in payroll calculation)

**Features Needed:**
- Mark check-in/check-out
- Mark leave, absent, half-day, holiday
- Bulk entry for multiple employees
- Project-wise attendance tracking
- Reports and summaries

### 4. Bonus & Deduction Management UI ⚠️ MEDIUM PRIORITY

**Missing Components:**
- Bonus management page
- Bonus form modal
- Payroll adjustment management page
- Adjustment form modal

**Files to Create:**
- `components/payroll/BonusManagement.tsx`
- `components/payroll/BonusFormModal.tsx`
- `components/payroll/PayrollAdjustmentManagement.tsx`
- `components/payroll/PayrollAdjustmentFormModal.tsx`

**Integration:**
- Add routes in navigation
- Connect to existing reducer actions: `ADD_BONUS`, `UPDATE_BONUS`, `ADD_PAYROLL_ADJUSTMENT`, etc.
- Approval workflow UI

**Features Needed:**
- Add/edit bonuses with approval workflow
- Add/edit deductions/adjustments
- Recurring bonuses/adjustments
- Project-wise allocations

### 5. API Route Enhancements ⚠️ LOW PRIORITY

**Routes to Check/Enhance:**
- `/api/payslips` - Add payment endpoint (if not exists)
- `/api/employees` - Ensure termination/promotion/transfer endpoints exist
- `/api/attendance` - Create or enhance if missing
- `/api/bonus-records` - Enhance if needed
- `/api/payroll-adjustments` - Enhance if needed

## Implementation Order

1. **Phase 1 (Critical):**
   - Enterprise payroll payment system
   - Employee termination/promotion/transfer UI

2. **Phase 2 (High Priority):**
   - Attendance management system

3. **Phase 3 (Medium Priority):**
   - Bonus/deduction management UI
   - API route enhancements

## Notes

- All database schemas are already in place
- Most reducer actions already exist
- Focus on creating UI components that connect to existing actions
- Ensure proper transaction creation and linking
- Support multi-project cost allocations where applicable
