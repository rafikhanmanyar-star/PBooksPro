# Payroll Backdate Processing Flow

## Before Fix ❌

```
Employee Created (11 Feb 2026)
├─ Joining Date: 25 Dec 2025
└─ Status: ACTIVE

Payroll Run: December 2025
├─ Query: SELECT * FROM payroll_employees WHERE status = 'ACTIVE'
├─ Result: ✅ Employee included (no date check)
└─ Payslip: ❌ NOT GENERATED (bug in processing)

Payroll Run: January 2026
├─ Query: SELECT * FROM payroll_employees WHERE status = 'ACTIVE'
├─ Result: ✅ Employee included
└─ Payslip: ❌ NOT GENERATED (bug in processing)

Issue: No payslips generated despite employee being active
```

## After Fix ✅

```
Employee Created (11 Feb 2026)
├─ Joining Date: 25 Dec 2025
└─ Status: ACTIVE

Payroll Run: December 2025
├─ Period: 1 Dec 2025 to 31 Dec 2025
├─ Query: SELECT * FROM payroll_employees 
│         WHERE status = 'ACTIVE'
│         AND joining_date <= '2025-12-31'
│         AND (termination_date IS NULL OR termination_date >= '2025-12-01')
├─ Result: ✅ Employee included (joined on 25th)
├─ Pro-rata Calculation:
│   ├─ Days in Month: 31
│   ├─ Days Worked: 7 (25th to 31st)
│   ├─ Pro-rata Factor: 7/31 = 0.2258 (22.58%)
│   ├─ Monthly Basic: ₹30,000
│   └─ December Basic: ₹6,774 (30,000 × 0.2258)
└─ Payslip: ✅ GENERATED with pro-rated amounts

Payroll Run: January 2026
├─ Period: 1 Jan 2026 to 31 Jan 2026
├─ Query: SELECT * FROM payroll_employees 
│         WHERE status = 'ACTIVE'
│         AND joining_date <= '2026-01-31'
│         AND (termination_date IS NULL OR termination_date >= '2026-01-01')
├─ Result: ✅ Employee included (joined before period)
├─ Pro-rata Calculation:
│   ├─ Joining Date: 25 Dec 2025 (before period start)
│   ├─ Days Worked: 31 (full month)
│   ├─ Pro-rata Factor: 1.0 (100%)
│   └─ January Basic: ₹30,000 (full amount)
└─ Payslip: ✅ GENERATED with full month amounts

Result: Both payslips generated correctly with appropriate amounts
```

## Pro-rata Calculation Details

### Scenario 1: Mid-Month Joiner (Your Case)

```
Timeline: December 2025
┌─────────────────────────────────────────────────────────┐
│  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18  │
│ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌  │
│ 19 20 21 22 23 24 [25 26 27 28 29 30 31]               │
│ ❌ ❌ ❌ ❌ ❌ ❌  ✅ ✅ ✅ ✅ ✅ ✅ ✅                │
└─────────────────────────────────────────────────────────┘
                        ↑ Joining Date

Calculation:
- Days Worked: 7 (from 25th to 31st, inclusive)
- Total Days: 31
- Pro-rata Factor: 7 ÷ 31 = 0.2258
- Salary Components:
  ├─ Basic: ₹30,000 × 0.2258 = ₹6,774
  ├─ HRA (40%): ₹12,000 × 0.2258 = ₹2,710
  ├─ Transport: ₹2,000 × 0.2258 = ₹452
  ├─ Gross: ₹44,000 × 0.2258 = ₹9,936
  ├─ PF (12%): ₹9,936 × 0.12 = ₹1,192
  └─ Net Pay: ₹9,936 - ₹1,192 = ₹8,744
```

### Scenario 2: Full Month (January 2026)

```
Timeline: January 2026
┌─────────────────────────────────────────────────────────┐
│ [1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18] │
│  ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅  │
│ [19 20 21 22 23 24 25 26 27 28 29 30 31]               │
│  ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅                │
└─────────────────────────────────────────────────────────┘

Calculation:
- Days Worked: 31 (full month)
- Total Days: 31
- Pro-rata Factor: 31 ÷ 31 = 1.0
- Salary Components:
  ├─ Basic: ₹30,000 × 1.0 = ₹30,000
  ├─ HRA (40%): ₹12,000 × 1.0 = ₹12,000
  ├─ Transport: ₹2,000 × 1.0 = ₹2,000
  ├─ Gross: ₹44,000 × 1.0 = ₹44,000
  ├─ PF (12%): ₹44,000 × 0.12 = ₹5,280
  └─ Net Pay: ₹44,000 - ₹5,280 = ₹38,720
```

### Scenario 3: Mid-Month Termination

```
Timeline: March 2026 (example)
┌─────────────────────────────────────────────────────────┐
│ [1  2  3  4  5  6  7  8  9 10 11 12 13 14 15] 16 17 18 │
│  ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅  ❌ ❌ ❌  │
│ 19 20 21 22 23 24 25 26 27 28 29 30 31                 │
│ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌                  │
└─────────────────────────────────────────────────────────┘
                              ↑ Termination Date (15th)

Calculation:
- Days Worked: 15 (from 1st to 15th)
- Total Days: 31
- Pro-rata Factor: 15 ÷ 31 = 0.4839
- Net Pay: ₹44,000 × 0.4839 - deductions = ~₹18,730
```

## API Endpoints

### 1. Create Payroll Run
```http
POST /api/payroll/runs
Content-Type: application/json

{
  "month": "December",
  "year": 2025
}

Response:
{
  "id": "run-123",
  "month": "December",
  "year": 2025,
  "period_start": "2025-12-01",
  "period_end": "2025-12-31",
  "status": "DRAFT",
  "employee_count": 10
}
```

### 2. Process Payroll
```http
POST /api/payroll/runs/:id/process

Response:
{
  "id": "run-123",
  "status": "DRAFT",
  "total_amount": 87440.50,
  "processing_summary": {
    "new_payslips_generated": 10,
    "existing_payslips_skipped": 0,
    "total_payslips": 10
  }
}
```

### 3. Detect Missing Payslips
```http
GET /api/payroll/missing-payslips

Response:
{
  "total_runs_checked": 12,
  "runs_with_missing_payslips": 2,
  "missing_payslips": [
    {
      "run_id": "run-123",
      "month": "December",
      "year": 2025,
      "missing_employees": [...]
    }
  ]
}
```

### 4. Generate Missing Payslips
```http
POST /api/payroll/generate-missing-payslips
Content-Type: application/json

{
  "employee_id": "emp-456"  // Optional
}

Response:
{
  "success": true,
  "total_runs_processed": 2,
  "total_payslips_generated": 2,
  "results": [...]
}
```

## Database Schema Updates

### Payroll Runs Table
```sql
-- Now properly uses period_start and period_end
CREATE TABLE payroll_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  period_start DATE,      -- ✅ Now populated
  period_end DATE,        -- ✅ Now populated
  status TEXT NOT NULL,
  total_amount DECIMAL(15, 2),
  employee_count INTEGER,
  ...
);
```

### Query Changes

**Before:**
```sql
SELECT * FROM payroll_employees 
WHERE tenant_id = $1 AND status = 'ACTIVE'
```

**After:**
```sql
SELECT * FROM payroll_employees 
WHERE tenant_id = $1 
AND status = 'ACTIVE'
AND joining_date <= $2  -- period_end
AND (termination_date IS NULL OR termination_date >= $3)  -- period_start
```

## Console Logs

When processing payroll, you'll see:

```
📅 Pro-rata calculation for John Doe: Joined 2025-12-25, worked 7/31 days, factor: 0.2258
💰 Basic Pay: ₹30,000 → ₹6,774 (pro-rated)
💰 HRA: ₹12,000 → ₹2,710 (pro-rated)
💰 Transport: ₹2,000 → ₹452 (pro-rated)
✅ Payslip generated: Gross ₹9,936, Net ₹8,744
```

---

**Visual Guide Created:** February 11, 2026
