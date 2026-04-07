# PBooksPro Financial Reports – Accounting Audit Report

**Date:** March 2025  
**Scope:** Balance Sheet, Profit & Loss Statement, Cash Flow Statement  
**Standards:** IFRS / GAAP  
**Context:** Local-first, SQLite, single-tenant, Electron/PWA

---

## 1. Compliance Score (0–100)

| Area | Score | Notes |
|------|-------|--------|
| **Balance Sheet structure** | 78 | Correct Assets / Liabilities / Equity; equation checked. Retained earnings formula non-standard; Potential Revenue as asset is memo-only. |
| **P&L structure** | 62 | Single-step (Income − Expenses = Net Profit). No COGS, Gross Profit, Operating / Other breakdown. |
| **Cash Flow structure** | 68 | Operating / Investing / Financing present. Owner contributions in Investing (should be Financing); no non-cash adjustments. |
| **Chart of accounts mapping** | 72 | BS mapping by account type is correct. P&L is category-based; no formal CoA document. |
| **Debit / credit logic** | 88 | Asset/Liability/Equity treatment and display signs are consistent with double-entry. |
| **Data integrity** | 75 | Deleted tx excluded at load; BS excludes voided invoices; P&L/Cash Flow void handling improved. |
| **Output format** | 85 | Clear sections, subtotals, export, and equation check. |

**Overall compliance score: 73/100**

---

## 2. Issues Found

### 2.1 Accounting Violations

1. **Retained earnings formula (Balance Sheet)**  
   - **Current:** `(companyRevenue - companyExpense) + accountsReceivable - accountsPayable`  
   - **Standard:** Retained Earnings = Opening RE + Net Income − Dividends.  
   - **Issue:** No opening RE or closing process; mixes cumulative P&L with accruals (AR − AP). Label or implement standard RE.

2. **Profit & Loss – single-step only**  
   - **Current:** Income (by category) and Expenses (by category) → Net Profit.  
   - **Missing:** Revenue, COGS, Gross Profit, Operating Expenses, Operating Profit, Other Income/Expenses.  
   - **Impact:** Less useful for analysis and comparison with standard formats.

3. **Cash Flow – classification**  
   - Owner/Investor contributions and withdrawals are in **Investing**.  
   - Under IFRS/GAAP these are **Financing** activities. Loans are correctly in Financing.

4. **Cash Flow – no non-cash adjustments**  
   - No depreciation, amortization, or reconciliation from net profit (indirect method).  
   - Operating section is direct cash only; no working-capital changes (e.g. Δ AR, Δ AP).

5. **Potential Revenue (Unsold Units)**  
   - Shown under Assets. Under strict GAAP this is not a recognized asset; treat as memo/management information only.

### 2.2 Data Integrity

6. **Voided / cancelled invoices**  
   - Balance Sheet excludes invoices from cancelled agreements and with "VOIDED" in description.  
   - P&L and Cash Flow now explicitly exclude voided/cancelled invoices and related transactions where applicable (see fixes).

7. **Cash Flow “All Projects” opening balance**  
   - Uses `acc.balance - periodChange`; assumes `state.accounts.balance` is current.  
   - Balance Sheet recomputes from transactions as-of date; Cash Flow for “All Projects” does not, so opening can diverge if balances are out of sync.

### 2.3 Code Quality

8. **Duplicated project resolution**  
   - Resolving `projectId` from invoice/bill when missing on transaction was repeated in all three reports.  
   - Addressed by shared `resolveProjectIdForTransaction(tx, state)` helper.

9. **Magic category names**  
   - Categories like 'Owner Equity', 'Owner Withdrawn', 'Security Deposit', 'Rental Income', 'Internal Clearing' are matched by name.  
   - Risk if names change; prefer stable IDs or system flags for critical categories.

10. **Security Liability and RE formula**  
    - Security Liability balance is maintained in AppContext; Balance Sheet uses the account.  
    - Retained earnings formula is documented in code as non-standard (project equity / net position).

---

## 3. Suggested Fixes (Implemented or Recommended)

### Implemented

- **Shared project resolution:** `reportUtils.resolveProjectIdForTransaction(tx, state)` used in Balance Sheet, P&L, and Cash Flow to avoid duplication and keep logic consistent.
- **Voided/cancelled handling in P&L and Cash Flow:**  
  - P&L: exclude transactions tied to voided invoices or cancelled project agreements.  
  - Cash Flow: exclude income/expense tied to voided invoices or cancelled agreements when classifying operating flows.
- **Retained earnings formula:** Comment added in Balance Sheet code explaining that the figure is “Project equity / net position” (cumulative P&L + AR − AP), not standard opening RE + net income − dividends.

### Recommended (future)

- **Retained earnings:** Either (a) label the current line as “Project equity / net position” in the UI, or (b) introduce opening retained earnings and a closing process (e.g. period-end close) and use standard RE.
- **P&L:** Add optional breakdown (e.g. COGS, Operating, Other) via category metadata or tags and a second layout (multi-step P&L).
- **Cash Flow:**  
  - Move owner/investor contributions and withdrawals from Investing to Financing.  
  - Optionally add indirect method (reconciliation from net profit) and non-cash adjustments if the data exists (e.g. depreciation category or fixed-asset register).
- **Data:** Keep excluding voided/cancelled invoices and related transactions in P&L and Cash Flow; consider excluding soft-deleted transactions in report code if state can ever include them (e.g. after restore).
- **Code:** Replace critical category name checks with stable category IDs or `isPermanent`/system flags where possible.

---

## 4. Recommended Report Structure (IFRS/GAAP-style)

### 4.1 Balance Sheet (Statement of Financial Position)

```
ASSETS
  Current assets
    Cash and cash equivalents
    Accounts receivable
    Inventory (if applicable)
    Prepayments
    Other current assets
  Non-current assets
    Property, plant and equipment
    Intangible assets
    Long-term investments
    Other non-current assets
  TOTAL ASSETS

LIABILITIES
  Current liabilities
    Accounts payable
    Short-term debt
    Current portion of long-term debt
    Accruals
    Other current liabilities
  Non-current liabilities
    Long-term debt
    Other non-current liabilities
  TOTAL LIABILITIES

EQUITY
  Share capital / Owner's capital
  Retained earnings (Opening RE + Net income − Dividends)
  Other reserves (if any)
  TOTAL EQUITY

Assets = Liabilities + Equity
```

**Mapping from current implementation:**  
Current/Long-term assets map to BANK/CASH/ASSET + AR + received assets. “Potential Revenue (Unsold Units)” = memo only. Liabilities map to LIABILITY + AP + loans + security + owner funds. Equity = EQUITY accounts + Owner’s contribution + current “Retained Earnings” (to be relabelled or recomputed as above).

### 4.2 Profit & Loss (Income Statement) – Multi-step

```
Revenue / Sales
  (−) Cost of goods sold (COGS)
= Gross profit

  (−) Operating expenses
= Operating profit (EBIT)

  (+/−) Other income / expenses
  (+/−) Finance costs
= Profit before tax

  (−) Tax expense
= Net profit / (loss)
```

**Mapping:** Current “Income” → Revenue (and optionally split into Revenue vs Other income via categories). Current “Expenses” → split into COGS, Operating expenses, Other, and Finance costs via category metadata or tags.

### 4.3 Cash Flow Statement

```
OPERATING ACTIVITIES
  (Direct) Cash from customers
  (Direct) Cash to suppliers and employees
  Other operating cash
  OR (Indirect) Net profit, + depreciation, +/− Δ working capital, etc.
= Net cash from operating activities

INVESTING ACTIVITIES
  Proceeds from sale of assets
  Purchase of property, plant and equipment
  Other investing
= Net cash from investing activities

FINANCING ACTIVITIES
  Proceeds from borrowings
  Repayment of borrowings
  Owner/investor contributions
  Owner/investor withdrawals / dividends
  Other financing
= Net cash from financing activities

Net increase/(decrease) in cash
Opening cash and cash equivalents
Closing cash and cash equivalents
```

**Mapping:** Move owner contributions/withdrawals from current “Investing” to “Financing”. Add optional indirect operating section and non-cash adjustments if data is available.

---

## 5. Appendix – Context and Constraints

- **Local-first / SQLite:** No server-side report queries; all aggregation is in-memory (React state). Suitable for offline use; for very large datasets, consider date-indexed or pre-aggregated queries.
- **Single-tenant:** No tenant_id filtering in report logic beyond what is in state.
- **Electron/PWA:** Reports run in the same process as the rest of the app; export is client-side (e.g. Excel).
- **No double-entry journal:** Transactions store a single amount and type (Income/Expense/Transfer/Loan); account balances are derived. Debit/credit is implicit (assets: + debit, − credit; liabilities/equity: displayed with sign inverted).
- **Categories vs accounts:** P&L uses category type (Income/Expense); Balance Sheet uses account type (BANK, CASH, ASSET, LIABILITY, EQUITY). There is no unified “chart of accounts” config file; mapping is in report code.

---

*End of Audit Report*
