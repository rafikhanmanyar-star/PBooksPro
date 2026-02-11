# Quick Fix Guide: Payroll Backdate Issue

## Problem
Employee created with joining date 25/12/2025, but payroll cycle didn't generate payslips for December and January.

## Root Cause
1. System didn't filter employees by joining date
2. No pro-rata calculation for partial months
3. No automatic generation of missing payslips

## Solution Applied

### Code Changes
✅ Modified `server/api/routes/payroll.ts`:
- Added joining date validation in payroll processing
- Implemented pro-rata salary calculation for mid-month joiners
- Added `period_start` and `period_end` tracking in payroll runs
- Created endpoints for missing payslips detection and generation

### What's Fixed
1. **Joining Date Validation**: Only employees who joined on or before the period end date are included
2. **Pro-rata Calculation**: Employees who joined mid-month get proportional salary
3. **Termination Handling**: Employees who terminated mid-month also get pro-rated salary
4. **Period Tracking**: Payroll runs now store exact period dates

## How to Fix Your Current Issue

### Option 1: Using UI (Recommended)
1. Go to Payroll → Runs
2. Create "December 2025" run (if not exists)
3. Click "Process Payroll"
   - System will generate pro-rated payslip for employee (7 days: 25th-31st Dec)
4. Create "January 2026" run (if not exists)
5. Click "Process Payroll"
   - System will generate full month payslip

### Option 2: Using API
```bash
# 1. Create December 2025 run
curl -X POST http://localhost:3000/api/payroll/runs \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "x-user-id: YOUR_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{"month": "December", "year": 2025}'

# 2. Process December run (replace RUN_ID with actual ID from step 1)
curl -X POST http://localhost:3000/api/payroll/runs/RUN_ID/process \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "x-user-id: YOUR_USER_ID"

# 3. Create January 2026 run
curl -X POST http://localhost:3000/api/payroll/runs \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "x-user-id: YOUR_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{"month": "January", "year": 2026}'

# 4. Process January run
curl -X POST http://localhost:3000/api/payroll/runs/RUN_ID/process \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "x-user-id: YOUR_USER_ID"
```

### Option 3: Detect & Auto-Generate Missing Payslips
```bash
# 1. Check for missing payslips
curl -X GET http://localhost:3000/api/payroll/missing-payslips \
  -H "x-tenant-id: YOUR_TENANT_ID"

# 2. Auto-generate all missing payslips
curl -X POST http://localhost:3000/api/payroll/generate-missing-payslips \
  -H "x-tenant-id: YOUR_TENANT_ID" \
  -H "x-user-id: YOUR_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Expected Results

### December 2025 Payslip
- **Days Worked**: 7 days (25th to 31st)
- **Pro-rata Factor**: 7/31 = 22.58%
- **Basic Pay**: 22.58% of monthly basic
- **Allowances**: Proportionally reduced
- **Net Pay**: Pro-rated amount

Example:
- Monthly Basic: ₹30,000
- December Basic: ₹6,774 (30,000 × 7/31)

### January 2026 Payslip
- **Days Worked**: Full month (31 days)
- **Pro-rata Factor**: 100%
- **Basic Pay**: Full monthly basic
- **Net Pay**: Full monthly amount

## Verification

### Check Logs
Look for this in server logs when processing December:
```
📅 Pro-rata calculation for [Employee Name]: Joined 2025-12-25, worked 7/31 days, factor: 0.2258
```

### Check Payslip
1. Go to Payroll → Runs → December 2025 → View Payslips
2. Find the employee's payslip
3. Verify Basic Pay is approximately 22.58% of monthly basic

### Database Query
```sql
SELECT 
  r.month,
  r.year,
  e.name,
  e.joining_date,
  p.basic_pay,
  p.net_pay,
  (e.salary->>'basic')::numeric as monthly_basic,
  ROUND(p.basic_pay / (e.salary->>'basic')::numeric * 100, 2) as percentage
FROM payslips p
JOIN payroll_employees e ON p.employee_id = e.id
JOIN payroll_runs r ON p.payroll_run_id = r.id
WHERE e.joining_date = '2025-12-25'
ORDER BY r.year, r.month;
```

## Important Notes

⚠️ **Approved/Paid Runs**: Cannot be modified. Revert to DRAFT first.

⚠️ **Adjustments**: One-time bonuses/deductions are NOT pro-rated.

⚠️ **Deductions**: Calculated on pro-rated gross pay.

✅ **Future Runs**: Will automatically handle new backdated employees.

## Testing

Run the test script:
```bash
cd /path/to/PBooksPro
TEST_TENANT_ID=your_tenant_id TEST_USER_ID=your_user_id node scripts/test-payroll-backdate.js
```

## Support

For detailed documentation, see: `doc/PAYROLL_BACKDATE_FIX.md`

---
**Fixed**: February 11, 2026
