# Payroll Payment Flow After Approval

## Overview
This document explains the complete payment flow after a payroll run is **APPROVED**.

## Status Flow Diagram

```
DRAFT → PROCESSING → DRAFT → APPROVED → [Individual Payslip Payments] → PAID
                                                      ↓
                                              (Auto-update when all paid)
```

## Detailed Flow After Approval

### Step 1: Payroll Run is APPROVED ✅
- **Status**: `APPROVED`
- **What happens**:
  - `approved_by` and `approved_at` are set
  - All payslips are validated (all employees have payslips, totals match)
  - Run is locked from reprocessing
  - Individual payslips can now be paid

### Step 2: Individual Payslip Payment 💰

**For each employee payslip:**

1. **User Action**: Click "View / Pay" on a payslip
2. **Validation**:
   - Payslip must not already be paid
   - Run status must be `APPROVED` or `PAID`
3. **Payment Process**:
   - User selects:
     - Payment Account (Bank/Cash)
     - Category (defaults to "Salary Expenses")
     - Project (optional, auto-selected from employee's project allocation)
     - Description (auto-generated if not provided)
   - System creates:
     - **Transaction** (Expense type)
     - Updates **Account Balance** (decreases by net pay amount)
     - Marks **Payslip** as paid (`is_paid = true`, `paid_at = timestamp`, `transaction_id` linked)
4. **Auto-Check**: After each payslip payment, system checks if all payslips are paid

### Step 3: Run Status Update to PAID 🎯

**Two ways to reach PAID status:**

#### Option A: Automatic Update (Recommended)
- **Trigger**: When the last unpaid payslip is paid
- **Condition**: All payslips in the run are paid AND run status is `APPROVED`
- **Action**: 
  - Run status automatically changes to `PAID`
  - `paid_at` timestamp is set
  - WebSocket event is emitted for real-time updates
- **No user action required** ✅

#### Option B: Manual Update
- **Trigger**: User clicks "Mark as Paid" button
- **Validation**:
  - Run must be in `APPROVED` status
  - All payslips must be paid (validated before allowing)
- **Action**:
  - Run status changes to `PAID`
  - `paid_at` timestamp is set
- **Use case**: If automatic update didn't trigger (edge case)

### Step 4: Final State - PAID ✅

**When run is PAID:**
- All payslips are paid
- All transactions are created
- Account balances are updated
- Run is in final state (no further changes allowed)
- Can be used for reporting and audit trails

## Payment Validation Rules

### Before Paying Individual Payslip:
- ✅ Run must be `APPROVED` or `PAID`
- ✅ Payslip must not already be paid
- ✅ Valid payment account must be selected
- ✅ Account must belong to tenant

### Before Marking Run as PAID:
- ✅ Run must be `APPROVED`
- ✅ All payslips must be paid
- ✅ At least one payslip must exist

## Code Flow

### Individual Payslip Payment
```
POST /payroll/payslips/:id/pay
  ↓
1. Validate run status (APPROVED or PAID)
2. Validate payslip not already paid
3. Create transaction
4. Update account balance
5. Mark payslip as paid
6. Check if all payslips paid
7. If all paid AND run is APPROVED → Auto-update run to PAID
```

### Manual Run Status Update
```
PUT /payroll/runs/:id (status: PAID)
  ↓
1. Validate current status is APPROVED
2. Count total payslips
3. Count paid payslips
4. Validate all payslips are paid
5. Update run status to PAID
6. Set paid_at timestamp
```

## Transaction Details

**Each payslip payment creates:**
- **Transaction Type**: Expense
- **Amount**: Payslip net_pay
- **Account**: Selected payment account (balance decreases)
- **Category**: Salary Expenses (default: `sys-cat-sal-exp`)
- **Project**: Employee's primary project allocation (if assigned)
- **Description**: "Salary payment for [Employee Name] - [Month] [Year]"
- **Link**: `payslip_id` links transaction to payslip

## Example Flow

### Scenario: 10 Employee Payroll Run

1. **APPROVED** ✅
   - Run approved by manager
   - 10 payslips ready for payment

2. **Pay Employee 1** 💰
   - Payslip 1 marked as paid
   - Transaction created
   - Run status: Still `APPROVED` (9 unpaid)

3. **Pay Employees 2-9** 💰
   - Each payslip marked as paid
   - Transactions created
   - Run status: Still `APPROVED` (1 unpaid)

4. **Pay Employee 10** 💰 (Last one)
   - Payslip 10 marked as paid
   - Transaction created
   - **Auto-trigger**: All 10 payslips paid
   - **Run status automatically changes to `PAID`** ✅
   - `paid_at` timestamp set

5. **Final State** 🎯
   - Run status: `PAID`
   - All 10 payslips paid
   - 10 transactions created
   - Account balance decreased by total payroll amount

## Error Handling

### Cannot Pay Payslip:
- ❌ Run not approved: "Payroll run must be APPROVED first"
- ❌ Payslip already paid: "Payslip is already paid"
- ❌ Invalid account: "Payment account not found"

### Cannot Mark Run as PAID:
- ❌ Not approved: "Payroll run must be APPROVED before it can be marked as PAID"
- ❌ Unpaid payslips: "Cannot mark as PAID: X payslips are still unpaid"
- ❌ No payslips: "Cannot mark as PAID: No payslips found for this run"

## Best Practices

1. **Recommended Approach**: Let the system auto-update to PAID
   - Pay all individual payslips
   - System automatically updates run status when last payslip is paid
   - No manual intervention needed

2. **Manual Update**: Only if needed
   - Use "Mark as Paid" button if automatic update didn't trigger
   - System validates all payslips are paid before allowing

3. **Payment Order**: No specific order required
   - Pay payslips in any order
   - System tracks which are paid/unpaid
   - Auto-updates when all are complete

## Database Changes

### When Payslip is Paid:
```sql
UPDATE payslips SET 
  is_paid = true,
  paid_at = CURRENT_TIMESTAMP,
  transaction_id = '[transaction_id]'
WHERE id = '[payslip_id]';
```

### When Run Auto-Updates to PAID:
```sql
UPDATE payroll_runs SET 
  status = 'PAID',
  paid_at = CURRENT_TIMESTAMP,
  updated_by = '[user_id]'
WHERE id = '[run_id]';
```

## Summary

**After Approval Flow:**
1. ✅ Payroll run is APPROVED
2. 💰 Pay individual payslips (one by one)
3. 🔄 System checks after each payment
4. ✅ When all paid → Run auto-updates to PAID
5. 🎯 Final state: All payslips paid, all transactions created

**Key Features:**
- ✅ Automatic status update (no manual step needed)
- ✅ Real-time validation
- ✅ Transaction tracking
- ✅ Account balance updates
- ✅ Audit trail (who paid, when)
