# Payroll Backdate & Pro-rata Fix

## Overview

This document describes the fix for the payroll system to properly handle backdated employee creation and pro-rata salary calculations.

## Problem Statement

When an employee was created with a backdated joining date (e.g., joining date: 25/12/2025), the payroll system had the following issues:

1. **No joining date validation**: The system processed ALL active employees regardless of their joining date
2. **No pro-rata calculation**: Employees who joined mid-month received full month salary instead of proportional amounts
3. **Missing payslips**: Backdated employees didn't automatically get payslips for the months between their joining date and current date

### Example Scenario

- Employee created on: 11/02/2026
- Joining date: 25/12/2025
- Payroll cycles run: December 2025, January 2026
- **Expected**: 
  - December payslip with pro-rata salary (25th Dec to 31st Dec = 7 days out of 31)
  - January payslip with full month salary
- **Actual (before fix)**: No payslips generated

## Solution Implemented

### 1. Joining Date Validation

The payroll processing now only includes employees whose `joining_date` is on or before the last day of the payroll period.

**Query Update** (in `/api/payroll/runs/:id/process`):
```sql
SELECT * FROM payroll_employees 
WHERE tenant_id = $1 AND status = 'ACTIVE'
AND joining_date <= $2  -- Period end date
AND (termination_date IS NULL OR termination_date >= $3)  -- Period start date
AND id NOT IN (
  SELECT employee_id FROM payslips 
  WHERE payroll_run_id = $4 AND tenant_id = $1
)
```

### 2. Pro-rata Salary Calculation

The system now calculates pro-rata salary for:
- **Mid-month joiners**: Employees who joined during the payroll month
- **Mid-month terminators**: Employees who were terminated during the payroll month

**Pro-rata Formula**:
```
Pro-rata Factor = Days Worked / Total Days in Month
Pro-rated Salary = Monthly Salary × Pro-rata Factor
```

**Example**:
- Monthly Basic Salary: ₹30,000
- Joining Date: 25th December 2025
- Days in December: 31
- Days Worked: 7 (25th to 31st)
- Pro-rata Factor: 7/31 = 0.2258
- Pro-rated Basic Salary: ₹30,000 × 0.2258 = ₹6,774

**Components Affected**:
- ✅ Basic Pay (pro-rated)
- ✅ Allowances (pro-rated based on pro-rated basic)
- ✅ Deductions (calculated on pro-rated gross)
- ❌ Adjustments (NOT pro-rated - applied as-is)

### 3. Period Start/End Tracking

Payroll runs now properly store `period_start` and `period_end` dates for accurate tracking.

**Update** (in `/api/payroll/runs` POST):
```typescript
const periodStart = new Date(year, monthIndex, 1);
const periodEnd = new Date(year, monthIndex + 1, 0); // Last day of month

INSERT INTO payroll_runs 
(tenant_id, month, year, period_start, period_end, status, employee_count, created_by)
VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, $7)
```

### 4. Missing Payslips Detection

New endpoint to detect employees with missing payslips across all payroll runs.

**Endpoint**: `GET /api/payroll/missing-payslips`

**Response**:
```json
{
  "total_runs_checked": 12,
  "runs_with_missing_payslips": 2,
  "missing_payslips": [
    {
      "run_id": "run-123",
      "month": "December",
      "year": 2025,
      "period_start": "2025-12-01",
      "period_end": "2025-12-31",
      "missing_employees": [
        {
          "id": "emp-456",
          "name": "John Doe",
          "employee_code": "EID-0001",
          "joining_date": "2025-12-25",
          "designation": "Software Engineer",
          "department": "Engineering"
        }
      ]
    }
  ]
}
```

### 5. Automatic Missing Payslips Generation

New endpoint to automatically generate missing payslips for backdated employees.

**Endpoint**: `POST /api/payroll/generate-missing-payslips`

**Request Body**:
```json
{
  "employee_id": "emp-456",  // Optional: specific employee
  "run_ids": ["run-123", "run-124"]  // Optional: specific runs
}
```

**Response**:
```json
{
  "success": true,
  "total_runs_processed": 2,
  "total_payslips_generated": 2,
  "results": [
    {
      "run_id": "run-123",
      "month": "December",
      "year": 2025,
      "status": "success",
      "new_payslips": 1
    },
    {
      "run_id": "run-124",
      "month": "January",
      "year": 2026,
      "status": "success",
      "new_payslips": 1
    }
  ]
}
```

## How to Fix Existing Data

### Step 1: Detect Missing Payslips

```bash
curl -X GET http://localhost:3000/api/payroll/missing-payslips \
  -H "x-tenant-id: YOUR_TENANT_ID"
```

### Step 2: Review the Results

Check the response to see which employees are missing payslips and for which months.

### Step 3: Generate Missing Payslips

**Option A: Generate for all missing payslips**
```bash
curl -X POST http://localhost:3000/api/payroll/generate-missing-payslips \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "x-user-id: YOUR_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Option B: Generate for specific employee**
```bash
curl -X POST http://localhost:3000/api/payroll/generate-missing-payslips \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "x-user-id: YOUR_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{"employee_id": "emp-456"}'
```

**Option C: Generate for specific runs**
```bash
curl -X POST http://localhost:3000/api/payroll/generate-missing-payslips \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "x-user-id: YOUR_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{"run_ids": ["run-123", "run-124"]}'
```

### Step 4: Re-process Existing Payroll Runs

For the specific case mentioned (employee joined 25/12/2025):

1. **Create December 2025 payroll run** (if not exists):
   ```bash
   curl -X POST http://localhost:3000/api/payroll/runs \
     -H "x-tenant-id: YOUR_TENANT_ID" \
     -H "x-user-id: YOUR_USER_ID" \
     -H "Content-Type: application/json" \
     -d '{"month": "December", "year": 2025}'
   ```

2. **Process December run**:
   ```bash
   curl -X POST http://localhost:3000/api/payroll/runs/RUN_ID/process \
     -H "x-tenant-id: YOUR_TENANT_ID" \
     -H "x-user-id: YOUR_USER_ID"
   ```
   
   This will generate a pro-rated payslip for December (7 days).

3. **Create/Process January 2026 run**:
   ```bash
   curl -X POST http://localhost:3000/api/payroll/runs \
     -H "x-tenant-id: YOUR_TENANT_ID" \
     -H "x-user-id: YOUR_USER_ID" \
     -H "Content-Type: application/json" \
     -d '{"month": "January", "year": 2026}'
   
   curl -X POST http://localhost:3000/api/payroll/runs/RUN_ID/process \
     -H "x-tenant-id: YOUR_TENANT_ID" \
     -H "x-user-id: YOUR_USER_ID"
   ```
   
   This will generate a full month payslip for January.

## Verification

### Check Pro-rata Calculation

Look for console logs during payroll processing:
```
📅 Pro-rata calculation for John Doe: Joined 2025-12-25, worked 7/31 days, factor: 0.2258
```

### Verify Payslip Amounts

1. Check the payslip for December:
   - Basic Pay should be approximately 22.58% of monthly basic
   - Allowances should be proportionally reduced
   - Net Pay should reflect the pro-rata calculation

2. Check the payslip for January:
   - Should have full month salary

### Query Database

```sql
-- Check payslips for a specific employee
SELECT 
  p.id,
  r.month,
  r.year,
  e.name,
  e.joining_date,
  p.basic_pay,
  p.gross_pay,
  p.net_pay,
  (e.salary->>'basic')::numeric as monthly_basic,
  ROUND(p.basic_pay / NULLIF((e.salary->>'basic')::numeric, 0) * 100, 2) as percentage_of_monthly
FROM payslips p
JOIN payroll_employees e ON p.employee_id = e.id
JOIN payroll_runs r ON p.payroll_run_id = r.id
WHERE e.id = 'YOUR_EMPLOYEE_ID'
ORDER BY r.year, r.month;
```

## Important Notes

### 1. Approved/Paid Runs

- The system will **NOT** modify payroll runs that are in `APPROVED` or `PAID` status
- You must revert them to `DRAFT` status first if you need to regenerate payslips

### 2. Adjustments

- One-time adjustments (bonuses, deductions) are **NOT** pro-rated
- They are applied as-is to the payslip
- This is intentional as adjustments are typically fixed amounts

### 3. Deductions

- Deductions are calculated on the **pro-rated gross pay**
- If a deduction is percentage-based, it will be proportionally lower for partial months
- If a deduction is fixed amount, it will be applied to the reduced gross pay

### 4. Multiple Runs

- The system prevents duplicate payslips for the same employee in the same run
- If you need to regenerate, delete the existing payslip first or revert the run to DRAFT

### 5. Termination Date

- The system also handles mid-month terminations with pro-rata calculations
- Terminated employees are excluded from future payroll runs

## Testing Checklist

- [ ] Create employee with backdated joining date (mid-month)
- [ ] Create payroll run for the joining month
- [ ] Process payroll - verify pro-rata calculation in logs
- [ ] Check payslip amounts are proportional
- [ ] Create payroll run for next full month
- [ ] Process payroll - verify full month salary
- [ ] Test missing payslips detection endpoint
- [ ] Test automatic generation of missing payslips
- [ ] Verify employee count in payroll runs is correct
- [ ] Test termination date handling (mid-month)

## Future Enhancements

1. **UI Indicators**: Show pro-rata indicator on payslips in the UI
2. **Bulk Generation**: Add UI button to generate missing payslips
3. **Notification**: Alert users when backdated employees are detected
4. **Attendance Integration**: Consider actual working days instead of calendar days
5. **Custom Pro-rata Rules**: Allow configuration of pro-rata calculation method

## Support

For issues or questions, please contact the development team or create a ticket in the project management system.

---

**Last Updated**: February 11, 2026
**Version**: 1.0.0
**Author**: AI Assistant
