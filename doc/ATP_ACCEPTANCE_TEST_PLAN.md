# Acceptance Test Plan (ATP)
## PBooksPro - Finance and Project Management Application
**Version:** 1.1.1  
**Date:** [Current Date]  
**Tester:** [Engineer Name]  
**Status:** [Pending/In Progress/Completed]

---

## Table of Contents
1. [Test Environment Setup](#test-environment-setup)
2. [Authentication & License Management](#authentication--license-management)
3. [Dashboard](#dashboard)
4. [General Ledger (Transactions)](#general-ledger-transactions)
5. [Payments](#payments)
6. [Rental Management](#rental-management)
7. [Project Management](#project-management)
8. [Investment Management](#investment-management)
9. [PM Configuration](#pm-configuration)
10. [Loan Manager](#loan-manager)
12. [Vendor Directory](#vendor-directory)
13. [Contacts](#contacts)
14. [Budget Planner](#budget-planner)
15. [Settings & Configuration](#settings--configuration)
17. [Import/Export](#importexport)
18. [Reports](#reports)
19. [Backup & Restore](#backup--restore)
20. [Sync Service](#sync-service)
21. [Update Notifications](#update-notifications)
22. [Performance & UI/UX](#performance--uiux)
23. [Error Handling](#error-handling)

---

## Test Environment Setup

### Prerequisites
- [ ] Application installed (Electron or Browser mode)
- [ ] Database initialized
- [ ] Test data available (or use sample data)
- [ ] Browser DevTools accessible (F12)
- [ ] Network connection (for sync/updates)

### Test Data Preparation
- [ ] Create test users (Admin, Manager, Accounts)
- [ ] Create test accounts (Bank, Cash, Asset, Liability, Equity)
- [ ] Create test contacts (Owner, Tenant, Vendor, Staff, Broker, etc.)
- [ ] Create test categories (Income, Expense)
- [ ] Create test projects and buildings
- [ ] Create test properties and units

---

## Authentication & License Management

### Test Case 1.1: User Login
**Steps:**
1. Launch the application
2. Enter valid username and password
3. Click "Login"

**Expected Result:**
- [ ] User successfully logs in
- [ ] Dashboard is displayed
- [ ] User name appears in header/sidebar
- [ ] No error messages displayed

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 1.2: Invalid Login Credentials
**Steps:**
1. Enter invalid username
2. Enter invalid password
3. Click "Login"

**Expected Result:**
- [ ] Error message displayed
- [ ] User remains on login page
- [ ] Password field is cleared (optional)

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 1.3: User Logout
**Steps:**
1. Log in as any user
2. Click logout button/menu option
3. Confirm logout if prompted

**Expected Result:**
- [ ] User is logged out
- [ ] Login page is displayed
- [ ] Session is cleared

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 1.4: License Expiration Check
**Steps:**
1. Set system date to after license expiration (if applicable)
2. Launch application
3. Attempt to login

**Expected Result:**
- [ ] License lock screen is displayed
- [ ] User cannot access application
- [ ] Appropriate message shown

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 1.5: User Role Permissions
**Steps:**
1. Log in as "Accounts" role user
2. Navigate to Settings page
3. Verify access restrictions

**Expected Result:**
- [ ] Accounts role cannot access Settings (or limited access)
- [ ] Appropriate restrictions are enforced
- [ ] No unauthorized access possible

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Dashboard

### Test Case 2.1: Dashboard Load
**Steps:**
1. Log in as any user
2. Navigate to Dashboard (default page)

**Expected Result:**
- [ ] Dashboard loads without errors
- [ ] KPI cards are displayed
- [ ] Charts/graphs render correctly
- [ ] Data is accurate and up-to-date

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 2.2: KPI Panel Display
**Steps:**
1. Navigate to Dashboard
2. Check KPI panel on right side
3. Click on different KPIs

**Expected Result:**
- [ ] KPI panel opens/closes correctly
- [ ] KPIs are displayed correctly
- [ ] KPI drilldown works when clicked
- [ ] Values are accurate

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 2.3: Dashboard Configuration
**Steps:**
1. Navigate to Dashboard
2. Open dashboard configuration/settings
3. Select/deselect KPIs to display
4. Save configuration

**Expected Result:**
- [ ] Configuration modal opens
- [ ] KPI selection works
- [ ] Changes are saved
- [ ] Dashboard updates to reflect changes

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 2.4: Dashboard Reports
**Steps:**
1. Navigate to Dashboard
2. Check Bank Accounts Report
3. Check Budget Status
4. Check Project Building Funds Report

**Expected Result:**
- [ ] All reports display correctly
- [ ] Data is accurate
- [ ] Reports are readable and formatted properly

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## General Ledger (Transactions)

### Test Case 3.1: View Transactions
**Steps:**
1. Navigate to "General Ledger" / "Transactions"
2. View transaction list

**Expected Result:**
- [ ] Transaction list loads
- [ ] All transactions are displayed
- [ ] Filters work correctly
- [ ] Sorting works correctly
- [ ] Pagination works (if applicable)

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 3.2: Create Income Transaction
**Steps:**
1. Navigate to Transactions
2. Click "New Transaction" or "+" button
3. Select "Income" type
4. Fill in required fields:
   - Amount
   - Date
   - Account
   - Category
   - Description
5. Save transaction

**Expected Result:**
- [ ] Transaction form opens
- [ ] All fields are editable
- [ ] Validation works (required fields)
- [ ] Transaction is saved successfully
- [ ] Account balance updates
- [ ] Transaction appears in list

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 3.3: Create Expense Transaction
**Steps:**
1. Navigate to Transactions
2. Click "New Transaction"
3. Select "Expense" type
4. Fill in required fields
5. Save transaction

**Expected Result:**
- [ ] Transaction is created successfully
- [ ] Account balance decreases
- [ ] Transaction appears in ledger

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 3.4: Create Transfer Transaction
**Steps:**
1. Navigate to Transactions
2. Click "New Transaction"
3. Select "Transfer" type
4. Select "From Account" and "To Account"
5. Enter amount and date
6. Save transaction

**Expected Result:**
- [ ] Transfer is created
- [ ] From account balance decreases
- [ ] To account balance increases
- [ ] Both accounts show transaction

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 3.5: Edit Transaction
**Steps:**
1. Navigate to Transactions
2. Click on an existing transaction
3. Modify fields
4. Save changes

**Expected Result:**
- [ ] Transaction opens in edit mode
- [ ] Changes are saved
- [ ] Account balances update correctly
- [ ] Transaction list reflects changes

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 3.6: Delete Transaction
**Steps:**
1. Navigate to Transactions
2. Select a transaction
3. Click delete button
4. Confirm deletion

**Expected Result:**
- [ ] Confirmation dialog appears
- [ ] Transaction is deleted
- [ ] Account balances reverse correctly
- [ ] Transaction removed from list

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 3.7: Transaction Filtering
**Steps:**
1. Navigate to Transactions
2. Apply filters:
   - By date range
   - By account
   - By category
   - By type (Income/Expense/Transfer)
   - By contact
   - By project

**Expected Result:**
- [ ] Filters work correctly
- [ ] Results update immediately
- [ ] Multiple filters can be combined
- [ ] Clear filters button works

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 3.8: Transaction Search
**Steps:**
1. Navigate to Transactions
2. Use search box
3. Enter search term (description, amount, etc.)

**Expected Result:**
- [ ] Search results update in real-time
- [ ] Search is case-insensitive (if applicable)
- [ ] Search works across multiple fields

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 3.9: System Transactions Visibility
**Steps:**
1. Navigate to Settings
2. Toggle "Show System Transactions"
3. Navigate to Transactions
4. Check if system transactions are visible

**Expected Result:**
- [ ] Toggle works correctly
- [ ] System transactions appear/disappear based on setting
- [ ] Setting persists after page refresh

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Payments

### Test Case 4.1: View Mobile Payments
**Steps:**
1. Navigate to "Payments" page
2. View payment list

**Expected Result:**
- [ ] Payments page loads
- [ ] Payment list displays correctly
- [ ] All payment methods are shown

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 4.2: Record Mobile Payment
**Steps:**
1. Navigate to Payments
2. Click "New Payment" or "+"
3. Fill in payment details:
   - Payment method (JazzCash, EasyPaisa, etc.)
   - Amount
   - Date
   - Account
   - Description
4. Save payment

**Expected Result:**
- [ ] Payment form opens
- [ ] Payment is saved successfully
- [ ] Transaction is created in ledger
- [ ] Account balance updates

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Rental Management

### Test Case 5.1: View Rental Management Page
**Steps:**
1. Navigate to "My Rentals"
2. Check all tabs/sections available

**Expected Result:**
- [ ] Rental Management page loads
- [ ] All sections are accessible:
   - Properties
   - Invoices
   - Agreements
   - Owner Payouts
   - Reports
   - Settings

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 5.2: Create Building
**Steps:**
1. Navigate to Rental Management > Settings
2. Click "New Building"
3. Enter building name and description
4. Set color (optional)
5. Save

**Expected Result:**
- [ ] Building is created
- [ ] Building appears in building list
- [ ] Building can be selected when creating properties

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 5.3: Create Property
**Steps:**
1. Navigate to Rental Management
2. Click "New Property"
3. Fill in:
   - Property name
   - Building
   - Owner
   - Monthly service charge
   - Description
4. Save

**Expected Result:**
- [ ] Property is created
- [ ] Property appears in property list
- [ ] Property can be used in agreements

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 5.4: Create Rental Agreement
**Steps:**
1. Navigate to Rental Management > Agreements
2. Click "New Agreement"
3. Fill in:
   - Agreement number (auto-generated)
   - Tenant
   - Property
   - Start date
   - End date
   - Monthly rent
   - Rent due date
   - Security deposit
   - Broker (optional)
   - Broker fee (optional)
4. Save

**Expected Result:**
- [ ] Agreement is created
- [ ] Agreement number is generated correctly
- [ ] Agreement appears in list
- [ ] Agreement status is "Active"

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 5.5: Generate Rental Invoice
**Steps:**
1. Navigate to Rental Management > Invoices
2. Click "New Invoice" or "Generate Invoice"
3. Select property/agreement
4. Select rental month
5. Generate invoice

**Expected Result:**
- [ ] Invoice is generated
- [ ] Invoice number is assigned
- [ ] Amount is calculated correctly (rent + service charges)
- [ ] Invoice status is "Unpaid"
- [ ] Invoice appears in invoice list

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 5.6: Record Rental Payment
**Steps:**
1. Navigate to Rental Management > Invoices
2. Select an unpaid invoice
3. Click "Record Payment" or "Pay"
4. Enter payment details:
   - Payment amount
   - Payment date
   - Account
5. Save payment

**Expected Result:**
- [ ] Payment is recorded
- [ ] Invoice status updates (Paid/Partially Paid)
- [ ] Transaction is created in ledger
- [ ] Account balance updates

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 5.7: Generate Monthly Service Charges
**Steps:**
1. Navigate to Rental Management > Monthly Service Charges
2. Click "Generate Service Charges"
3. Select month
4. Generate charges

**Expected Result:**
- [ ] Service charges are generated for all properties
- [ ] Invoices are created automatically
- [ ] Amounts are calculated correctly

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 5.8: Create Owner Payout
**Steps:**
1. Navigate to Rental Management > Owner Payouts
2. Click "New Payout"
3. Select owner/property
4. Enter payout details:
   - Amount
   - Date
   - Account
   - Description
5. Save

**Expected Result:**
- [ ] Payout is created
- [ ] Transaction is recorded
- [ ] Owner ledger updates
- [ ] Payout appears in list

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 5.9: Terminate Rental Agreement
**Steps:**
1. Navigate to Rental Management > Agreements
2. Select an active agreement
3. Click "Terminate" or "End Agreement"
4. Enter termination date
5. Confirm termination

**Expected Result:**
- [ ] Agreement status changes to "Terminated"
- [ ] Agreement end date is updated
- [ ] No new invoices are generated after termination date

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 5.10: Rental Reports
**Steps:**
1. Navigate to Rental Management > Reports
2. Test various reports:
   - Rental Summary
   - Owner Ledger
   - Tenant Ledger
   - Broker Report
   - Income by Category
   - Expense by Category

**Expected Result:**
- [ ] All reports generate correctly
- [ ] Data is accurate
- [ ] Reports are formatted properly
- [ ] Reports can be exported (if applicable)

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Project Management

### Test Case 6.1: View Project Management Page
**Steps:**
1. Navigate to "My Projects"
2. Check all available sections

**Expected Result:**
- [ ] Project Management page loads
- [ ] All sections accessible:
   - Agreements
   - Contracts
   - Invoices
   - Bills
   - Sales Returns
   - Broker Payouts
   - PM Payouts
   - Reports

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 6.2: Create Project
**Steps:**
1. Navigate to Project Management > Settings
2. Click "New Project"
3. Fill in:
   - Project name
   - Description
   - Status (Active/Completed/On Hold)
   - Color
   - Installment configuration (optional)
4. Save

**Expected Result:**
- [ ] Project is created
- [ ] Project appears in project list
- [ ] Project can be selected in other modules

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 6.3: Create Unit
**Steps:**
1. Navigate to Project Management
2. Click "New Unit"
3. Select project
4. Enter unit name
5. Enter sale price (optional)
6. Save

**Expected Result:**
- [ ] Unit is created
- [ ] Unit is linked to project
- [ ] Unit appears in unit list

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 6.4: Create Project Agreement
**Steps:**
1. Navigate to Project Management > Agreements
2. Click "New Agreement"
3. Fill in:
   - Client
   - Project
   - Units (can select multiple)
   - List price
   - Discounts (Customer, Floor, Lump Sum, Misc)
   - Selling price (auto-calculated)
   - Issue date
   - Description
4. Save

**Expected Result:**
- [ ] Agreement is created
- [ ] Agreement number is generated
- [ ] Selling price is calculated correctly
- [ ] Agreement status is "Active"
- [ ] Agreement appears in list

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 6.5: Generate Project Invoice (Installment)
**Steps:**
1. Navigate to Project Management > Invoices
2. Click "New Invoice" or "Generate Installment"
3. Select agreement
4. Select installment number/frequency
5. Generate invoice

**Expected Result:**
- [ ] Invoice is generated
- [ ] Invoice number is assigned
- [ ] Amount is calculated correctly
- [ ] Due date is set correctly
- [ ] Invoice status is "Unpaid"

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 6.6: Record Project Payment
**Steps:**
1. Navigate to Project Management > Invoices
2. Select an unpaid invoice
3. Click "Record Payment"
4. Enter payment details
5. Save

**Expected Result:**
- [ ] Payment is recorded
- [ ] Invoice status updates
- [ ] Transaction is created
- [ ] Client ledger updates

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 6.7: Create Contract
**Steps:**
1. Navigate to Project Management > Contracts
2. Click "New Contract"
3. Fill in:
   - Contract number
   - Contract name
   - Project
   - Vendor
   - Start date
   - End date
   - Total amount
   - Expense category items (with units, quantities, prices)
   - Terms and conditions
   - Payment terms
4. Save

**Expected Result:**
- [ ] Contract is created
- [ ] Contract number is generated
- [ ] Contract appears in list
- [ ] Contract status is "Active"

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 6.8: Create Bill
**Steps:**
1. Navigate to Project Management > Bills
2. Click "New Bill"
3. Fill in:
   - Bill number
   - Vendor
   - Amount
   - Issue date
   - Due date
   - Category
   - Project
   - Description
   - Expense category items (if linked to contract)
4. Save

**Expected Result:**
- [ ] Bill is created
- [ ] Bill number is generated
- [ ] Bill status is "Unpaid"
- [ ] Bill appears in list

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 6.9: Record Bill Payment
**Steps:**
1. Navigate to Project Management > Bills
2. Select an unpaid bill
3. Click "Pay" or "Record Payment"
4. Enter payment details
5. Save

**Expected Result:**
- [ ] Payment is recorded
- [ ] Bill status updates
- [ ] Transaction is created
- [ ] Vendor ledger updates

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 6.10: Bulk Bill Payment
**Steps:**
1. Navigate to Project Management > Bills
2. Select multiple unpaid bills
3. Click "Bulk Payment"
4. Enter payment details
5. Save

**Expected Result:**
- [ ] All selected bills are paid
- [ ] Multiple transactions are created
- [ ] All bill statuses update
- [ ] Account balance updates correctly

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 6.11: Cancel Project Agreement
**Steps:**
1. Navigate to Project Management > Agreements
2. Select an active agreement
3. Click "Cancel Agreement"
4. Enter:
   - Cancellation date
   - Penalty percentage
   - Reason
5. Confirm cancellation

**Expected Result:**
- [ ] Agreement status changes to "Cancelled"
- [ ] Penalty amount is calculated
- [ ] Refund amount is calculated
- [ ] Sales return record is created
- [ ] Appropriate transactions are created

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 6.12: Sales Return Processing
**Steps:**
1. Navigate to Project Management > Sales Returns
2. View sales return list
3. Process a pending return
4. Mark return as refunded

**Expected Result:**
- [ ] Sales returns list displays correctly
- [ ] Return can be processed
- [ ] Refund bill is created (if applicable)
- [ ] Return status updates correctly

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 6.13: Broker Payouts
**Steps:**
1. Navigate to Project Management > Broker Payouts
2. Click "New Payout"
3. Select broker
4. Enter payout details
5. Save

**Expected Result:**
- [ ] Payout is created
- [ ] Broker ledger updates
- [ ] Transaction is recorded

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 6.14: PM Payouts
**Steps:**
1. Navigate to Project Management > PM Payouts
2. View PM cost calculations
3. Create PM payout
4. Record payment

**Expected Result:**
- [ ] PM costs are calculated correctly
- [ ] Payout can be created
- [ ] Payment is recorded
- [ ] Transaction is created

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 6.15: Project Reports
**Steps:**
1. Navigate to Project Management > Reports
2. Test various reports:
   - Visual Layout
   - Tabular View
   - Project Summary
   - Profit & Loss
   - Balance Sheet
   - Investor Distribution
   - Revenue Analysis
   - Owner Ledger
   - Broker Report
   - Income/Expense by Category
   - Vendor Ledger
   - PM Cost Report
   - Contract Report
   - Budget vs Actual

**Expected Result:**
- [ ] All reports generate correctly
- [ ] Data is accurate
- [ ] Reports are formatted properly
- [ ] Reports can be exported (if applicable)

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Investment Management

### Test Case 7.1: View Investment Management
**Steps:**
1. Navigate to "Inv. Mgmt." / "Investment Management"
2. View investment page

**Expected Result:**
- [ ] Investment Management page loads
- [ ] All investment features are accessible

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 7.2: Create Investment Transaction
**Steps:**
1. Navigate to Investment Management
2. Create investment transaction
3. Link to project/account
4. Save

**Expected Result:**
- [ ] Investment is recorded
- [ ] Transaction is created
- [ ] Investment appears in list

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## PM Configuration

### Test Case 8.1: View PM Config
**Steps:**
1. Navigate to "PM Config."
2. View configuration page

**Expected Result:**
- [ ] PM Config page loads
- [ ] All projects are listed
- [ ] PM settings are visible

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 8.2: Configure PM Rate
**Steps:**
1. Navigate to PM Config
2. Select a project
3. Set PM rate
4. Set frequency (Monthly/Weekly/Yearly)
5. Set excluded categories (optional)
6. Save

**Expected Result:**
- [ ] PM configuration is saved
- [ ] Configuration is applied to PM cost calculations
- [ ] Changes persist after page refresh

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Loan Manager

### Test Case 10.1: View Loan Manager
**Steps:**
1. Navigate to "Loan Manager"
2. View loan page

**Expected Result:**
- [ ] Loan Manager page loads
- [ ] All loan types are accessible

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 10.2: Give Loan
**Steps:**
1. Navigate to Loan Manager
2. Click "New Loan"
3. Select "Give Loan"
4. Fill in:
   - Contact
   - Amount
   - Date
   - Account
   - Description
5. Save

**Expected Result:**
- [ ] Loan is recorded
- [ ] Transaction is created
- [ ] Account balance decreases
- [ ] Loan appears in loan list

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 10.3: Receive Loan
**Steps:**
1. Navigate to Loan Manager
2. Click "New Loan"
3. Select "Receive Loan"
4. Fill in loan details
5. Save

**Expected Result:**
- [ ] Loan is recorded
- [ ] Transaction is created
- [ ] Account balance increases
- [ ] Loan appears in list

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 10.4: Repay Loan
**Steps:**
1. Navigate to Loan Manager
2. Select an existing "Give Loan"
3. Click "Repay"
4. Enter repayment amount and date
5. Save

**Expected Result:**
- [ ] Repayment is recorded
- [ ] Loan balance decreases
- [ ] Transaction is created
- [ ] Account balance updates

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 10.5: Collect Loan
**Steps:**
1. Navigate to Loan Manager
2. Select an existing "Receive Loan"
3. Click "Collect"
4. Enter collection amount and date
5. Save

**Expected Result:**
- [ ] Collection is recorded
- [ ] Loan balance decreases
- [ ] Transaction is created
- [ ] Account balance updates

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Vendor Directory

### Test Case 11.1: View Vendor Directory
**Steps:**
1. Navigate to "Vendors"
2. View vendor list

**Expected Result:**
- [ ] Vendor Directory page loads
- [ ] All vendors are listed
- [ ] Vendor details are visible

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 11.2: Create Vendor
**Steps:**
1. Navigate to Vendors
2. Click "New Vendor"
3. Fill in:
   - Name
   - Contact number
   - Company name
   - Address
   - Description
4. Save

**Expected Result:**
- [ ] Vendor is created
- [ ] Vendor appears in list
- [ ] Vendor can be selected in bills/contracts

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 11.3: Edit Vendor
**Steps:**
1. Navigate to Vendors
2. Select a vendor
3. Click "Edit"
4. Modify details
5. Save

**Expected Result:**
- [ ] Vendor details are updated
- [ ] Changes are saved
- [ ] Updated info appears in list

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 11.4: Delete Vendor
**Steps:**
1. Navigate to Vendors
2. Select a vendor
3. Click "Delete"
4. Confirm deletion

**Expected Result:**
- [ ] Confirmation dialog appears
- [ ] Vendor is deleted
- [ ] Vendor removed from list
- [ ] Check for references (bills, contracts) - should warn or prevent deletion

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 11.5: Vendor Ledger
**Steps:**
1. Navigate to Vendors
2. Select a vendor
3. View vendor ledger/report

**Expected Result:**
- [ ] Vendor ledger displays
- [ ] All transactions with vendor are shown
- [ ] Outstanding balance is calculated correctly

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 11.6: Create Quotation
**Steps:**
1. Navigate to Vendors
2. Select a vendor
3. Create quotation
4. Add quotation items (with quantities, units, prices)
5. Upload document (optional)
6. Save

**Expected Result:**
- [ ] Quotation is created
- [ ] Total amount is calculated correctly
- [ ] Quotation appears in vendor record
- [ ] Document is attached (if uploaded)

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Contacts

### Test Case 12.1: View Contacts
**Steps:**
1. Navigate to "Contacts"
2. View contact list

**Expected Result:**
- [ ] Contacts page loads
- [ ] All contacts are listed
- [ ] Contact types are visible

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 12.2: Create Contact
**Steps:**
1. Navigate to Contacts
2. Click "New Contact"
3. Fill in:
   - Name
   - Type (Owner/Tenant/Vendor/Staff/Broker/etc.)
   - Contact number
   - Company name (optional)
   - Address (optional)
   - Description (optional)
4. Save

**Expected Result:**
- [ ] Contact is created
- [ ] Contact appears in list
- [ ] Contact can be used in other modules

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 12.3: Edit Contact
**Steps:**
1. Navigate to Contacts
2. Select a contact
3. Click "Edit"
4. Modify details
5. Save

**Expected Result:**
- [ ] Contact details are updated
- [ ] Changes are saved
- [ ] Updated info appears in list

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 12.4: Delete Contact
**Steps:**
1. Navigate to Contacts
2. Select a contact
3. Click "Delete"
4. Confirm deletion

**Expected Result:**
- [ ] Confirmation dialog appears
- [ ] Contact is deleted
- [ ] Check for references - should warn if contact is used elsewhere

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 12.5: Send WhatsApp Message
**Steps:**
1. Navigate to Contacts
2. Select a contact with phone number
3. Click "Send WhatsApp" or message icon
4. Select template or enter message
5. Send message

**Expected Result:**
- [ ] WhatsApp message modal opens
- [ ] Message can be sent (if WhatsApp Business API configured)
- [ ] Message template works (if applicable)

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Budget Planner

### Test Case 13.1: View Budget Planner
**Steps:**
1. Navigate to "Budget Planner"
2. View budget page

**Expected Result:**
- [ ] Budget Planner page loads
- [ ] All budgets are listed
- [ ] Budget vs Actual comparison is visible

**Actual Result:**  
**Issues Found:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 13.2: Create Budget
**Steps:**
1. Navigate to Budget Planner
2. Click "New Budget"
3. Select category
4. Enter budget amount
5. Select project (optional, for project-specific budgets)
6. Save

**Expected Result:**
- [ ] Budget is created
- [ ] Budget appears in list
- [ ] Budget is used in reports

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 13.3: Edit Budget
**Steps:**
1. Navigate to Budget Planner
2. Select a budget
3. Click "Edit"
4. Modify amount
5. Save

**Expected Result:**
- [ ] Budget is updated
- [ ] Changes are saved
- [ ] Reports reflect updated budget

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 13.4: Delete Budget
**Steps:**
1. Navigate to Budget Planner
2. Select a budget
3. Click "Delete"
4. Confirm deletion

**Expected Result:**
- [ ] Budget is deleted
- [ ] Budget removed from list

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 13.5: Budget vs Actual Report
**Steps:**
1. Navigate to Budget Planner
2. View budget vs actual comparison
3. Check variance calculations

**Expected Result:**
- [ ] Comparison is displayed correctly
- [ ] Actual amounts are accurate
- [ ] Variance is calculated correctly
- [ ] Visual indicators work (if applicable)

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Settings & Configuration

### Test Case 15.1: View Settings
**Steps:**
1. Navigate to "Configuration" / "Settings"
2. View all settings categories

**Expected Result:**
- [ ] Settings page loads
- [ ] All categories are accessible:
   - Users
   - Accounts
   - Categories
   - Projects & Buildings
   - Agreement Settings
   - Invoice Settings
   - Print Settings
   - WhatsApp Templates
   - Dashboard Config
   - Data Management
   - Backup & Restore
   - Help

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 15.2: User Management
**Steps:**
1. Navigate to Settings > Users
2. Create new user
3. Edit existing user
4. Delete user
5. Change user role

**Expected Result:**
- [ ] User can be created
- [ ] User can be edited
- [ ] User can be deleted
- [ ] Role changes are saved
- [ ] Password can be changed

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 15.3: Account Management
**Steps:**
1. Navigate to Settings > Accounts
2. Create new account (Bank/Cash/Asset/Liability/Equity)
3. Edit account
4. Delete account
5. Create sub-account (if applicable)

**Expected Result:**
- [ ] Account can be created
- [ ] Account type is correct
- [ ] Account can be edited
- [ ] Account can be deleted (with validation)
- [ ] Sub-accounts work correctly

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 15.4: Category Management
**Steps:**
1. Navigate to Settings > Categories
2. Create new category (Income/Expense)
3. Edit category
4. Delete category
5. Create sub-category (if applicable)

**Expected Result:**
- [ ] Category can be created
- [ ] Category type is correct
- [ ] Category can be edited
- [ ] Category can be deleted (with validation)
- [ ] Sub-categories work correctly

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 15.5: Agreement Settings
**Steps:**
1. Navigate to Settings > Agreement Settings
2. Configure:
   - Agreement number prefix
   - Next number
   - Number padding
3. Save settings

**Expected Result:**
- [ ] Settings are saved
- [ ] New agreements use configured format
- [ ] Number sequence is correct

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 15.6: Invoice Settings
**Steps:**
1. Navigate to Settings > Invoice Settings
2. Configure rental invoice settings
3. Configure project invoice settings
4. Save settings

**Expected Result:**
- [ ] Settings are saved
- [ ] New invoices use configured format
- [ ] Number sequences are correct

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 15.7: Print Settings
**Steps:**
1. Navigate to Settings > Print Settings
2. Configure:
   - Company name
   - Company address
   - Company contact
   - Logo (upload)
   - Header/footer text
3. Save settings

**Expected Result:**
- [ ] Settings are saved
- [ ] Logo uploads correctly
- [ ] Settings are used in print previews

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 15.8: WhatsApp Templates
**Steps:**
1. Navigate to Settings > WhatsApp Templates
2. Edit templates:
   - Invoice reminder
   - Invoice receipt
   - Bill payment
   - Vendor greeting
3. Save templates

**Expected Result:**
- [ ] Templates are saved
- [ ] Templates are used when sending messages
- [ ] Variables are replaced correctly (if applicable)

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 15.9: Dashboard Configuration
**Steps:**
1. Navigate to Settings > Dashboard Config
2. Select/deselect KPIs to display
3. Save configuration

**Expected Result:**
- [ ] Configuration is saved
- [ ] Dashboard updates to reflect changes
- [ ] Selected KPIs are displayed

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 15.10: System Preferences
**Steps:**
1. Navigate to Settings
2. Toggle preferences:
   - Show System Transactions
   - Enable Color Coding
   - Enable Beep on Save
3. Save preferences

**Expected Result:**
- [ ] Preferences are saved
- [ ] Preferences are applied immediately
- [ ] Preferences persist after page refresh

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Import/Export

### Test Case 16.1: View Import Page
**Steps:**
1. Navigate to "Import Data"
2. View import page

**Expected Result:**
- [ ] Import page loads
- [ ] All import types are listed
- [ ] Import instructions are visible

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 16.2: Import Transactions
**Steps:**
1. Navigate to Import
2. Select "Transactions" import type
3. Upload Excel/CSV file
4. Map columns
5. Preview import
6. Confirm import

**Expected Result:**
- [ ] File uploads correctly
- [ ] Column mapping works
- [ ] Preview shows correct data
- [ ] Import completes successfully
- [ ] Transactions are created
- [ ] Import log is generated

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 16.3: Import Contacts
**Steps:**
1. Navigate to Import
2. Select "Contacts" import type
3. Upload file
4. Map columns
5. Import

**Expected Result:**
- [ ] Contacts are imported
- [ ] Data is validated
- [ ] Duplicates are handled
- [ ] Import log shows results

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 16.4: Export Data
**Steps:**
1. Navigate to Settings > Data Management
2. Click "Export Data"
3. Select data types to export
4. Export to Excel/CSV

**Expected Result:**
- [ ] Export file is generated
- [ ] All selected data is exported
- [ ] File downloads successfully
- [ ] Data format is correct

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Reports

### Test Case 17.1: Generate General Reports
**Steps:**
1. Navigate to various report sections
2. Generate reports:
   - Profit & Loss
   - Balance Sheet
   - Cash Flow
   - Trial Balance
3. Verify data accuracy

**Expected Result:**
- [ ] Reports generate correctly
- [ ] Data is accurate
- [ ] Reports are formatted properly
- [ ] Reports can be exported/printed

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 17.2: Export Reports
**Steps:**
1. Generate any report
2. Click "Export" or "Download"
3. Select format (PDF/Excel/CSV)
4. Download report

**Expected Result:**
- [ ] Report exports successfully
- [ ] File format is correct
- [ ] Data is complete
- [ ] File downloads to default location

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 17.3: Print Reports
**Steps:**
1. Generate any report
2. Click "Print"
3. Check print preview
4. Print report

**Expected Result:**
- [ ] Print preview displays correctly
- [ ] Company logo/header appears (if configured)
- [ ] Report prints correctly
- [ ] Page breaks are appropriate

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Backup & Restore

### Test Case 18.1: Create Backup
**Steps:**
1. Navigate to Settings > Backup & Restore
2. Click "Create Backup"
3. Wait for backup to complete
4. Verify backup file is created

**Expected Result:**
- [ ] Backup process starts
- [ ] Progress indicator shows
- [ ] Backup completes successfully
- [ ] Backup file is saved
- [ ] Success message is displayed

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 18.2: Restore Backup
**Steps:**
1. Navigate to Settings > Backup & Restore
2. Click "Restore Backup"
3. Select backup file
4. Confirm restoration
5. Wait for restore to complete

**Expected Result:**
- [ ] File picker opens
- [ ] Backup file can be selected
- [ ] Confirmation dialog appears
- [ ] Restore process completes
- [ ] Data is restored correctly
- [ ] Application refreshes with restored data

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 18.3: Backup via Menu (Electron)
**Steps:**
1. In Electron app, use menu: File > Create Backup
2. Verify backup is created

**Expected Result:**
- [ ] Menu option works
- [ ] Backup is created successfully

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 18.4: Restore via Menu (Electron)
**Steps:**
1. In Electron app, use menu: File > Restore Backup
2. Select backup file
3. Verify restore works

**Expected Result:**
- [ ] Menu option works
- [ ] Restore completes successfully

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Sync Service

### Test Case 19.1: Sync Connection
**Steps:**
1. Navigate to Settings > Sync (if available)
2. Initiate sync
3. Check sync status

**Expected Result:**
- [ ] Sync connects successfully
- [ ] Sync status is displayed
- [ ] Data syncs correctly

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 19.2: Sync Data
**Steps:**
1. Make changes to data
2. Trigger sync
3. Verify data is synced

**Expected Result:**
- [ ] Changes are synced
- [ ] No data loss occurs
- [ ] Conflicts are handled (if applicable)

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Update Notifications

### Test Case 20.1: Check for Updates (Electron)
**Steps:**
1. Launch Electron app
2. Wait for update check (30 seconds after launch)
3. Check if update notification appears (if update available)

**Expected Result:**
- [ ] Update check runs automatically
- [ ] Notification appears if update is available
- [ ] No errors in console

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 20.2: Install Update (Electron)
**Steps:**
1. If update is available, click "Update" or "Install"
2. Wait for download
3. Restart application

**Expected Result:**
- [ ] Update downloads
- [ ] Application restarts
- [ ] Update is installed
- [ ] Application works with new version

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Performance & UI/UX

### Test Case 21.1: Page Load Performance
**Steps:**
1. Navigate between different pages
2. Measure load times
3. Check for loading indicators

**Expected Result:**
- [ ] Pages load within acceptable time (< 2-3 seconds)
- [ ] Loading indicators appear during navigation
- [ ] No freezing or hanging

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 21.2: Large Dataset Performance
**Steps:**
1. Create/import large number of transactions (1000+)
2. Navigate to Transactions page
3. Test filtering, sorting, searching

**Expected Result:**
- [ ] Page loads without significant delay
- [ ] Filtering works smoothly
- [ ] Sorting is responsive
- [ ] Search is fast
- [ ] Virtual scrolling works (if implemented)

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 21.3: Responsive Design
**Steps:**
1. Resize browser window (or Electron window)
2. Test on different screen sizes
3. Check mobile view (if applicable)

**Expected Result:**
- [ ] Layout adapts to screen size
- [ ] All features are accessible
- [ ] No horizontal scrolling (unless necessary)
- [ ] Mobile footer navigation works

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 21.4: Keyboard Navigation
**Steps:**
1. Navigate using keyboard only
2. Test Tab navigation
3. Test Enter/Space to activate
4. Test Escape to close modals

**Expected Result:**
- [ ] All interactive elements are accessible via keyboard
- [ ] Focus indicators are visible
- [ ] Keyboard shortcuts work (if applicable)

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 21.5: Custom Keyboard (Mobile/Touch)
**Steps:**
1. On touch device or mobile view
2. Focus on numeric input field
3. Verify custom keyboard appears
4. Test input with custom keyboard

**Expected Result:**
- [ ] Custom keyboard appears when needed
- [ ] Input works correctly
- [ ] Keyboard closes when done

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Error Handling

### Test Case 22.1: Invalid Input Validation
**Steps:**
1. Try to create transaction with:
   - Negative amount (if not allowed)
   - Missing required fields
   - Invalid date
   - Invalid account
2. Attempt to save

**Expected Result:**
- [ ] Validation errors are displayed
- [ ] Form does not submit
- [ ] Error messages are clear
- [ ] Invalid fields are highlighted

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 22.2: Database Error Handling
**Steps:**
1. Perform operations that might cause database errors
2. Check error messages
3. Verify application doesn't crash

**Expected Result:**
- [ ] Errors are caught and displayed
- [ ] User-friendly error messages
- [ ] Application remains stable
- [ ] Error logs are created (if applicable)

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 22.3: Network Error Handling (if applicable)
**Steps:**
1. Disconnect network
2. Attempt sync or update check
3. Check error handling

**Expected Result:**
- [ ] Error message is displayed
- [ ] Application doesn't crash
- [ ] User can retry when network is restored

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Test Case 22.4: Error Boundary
**Steps:**
1. Trigger a component error (if possible)
2. Check if error boundary catches it
3. Verify error display

**Expected Result:**
- [ ] Error boundary catches errors
- [ ] Error message is displayed
- [ ] Application doesn't completely crash
- [ ] User can navigate away

**Actual Result:**  
**Issues Found:**  
**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Test Summary

### Overall Test Results
- **Total Test Cases:** [Count]
- **Passed:** [Count]
- **Failed:** [Count]
- **Blocked:** [Count]
- **Not Tested:** [Count]

### Critical Issues Found
1. [Issue description]
2. [Issue description]
3. [Issue description]

### High Priority Issues
1. [Issue description]
2. [Issue description]
3. [Issue description]

### Medium Priority Issues
1. [Issue description]
2. [Issue description]
3. [Issue description]

### Low Priority Issues / Enhancements
1. [Issue description]
2. [Issue description]
3. [Issue description]

### Recommendations
- [Recommendation 1]
- [Recommendation 2]
- [Recommendation 3]

---

## Sign-off

**Tester Name:** _________________________  
**Date:** _________________________  
**Signature:** _________________________

**Reviewed By:** _________________________  
**Date:** _________________________  
**Signature:** _________________________

---

## Notes Section

### Additional Observations
[Space for additional notes, observations, or comments during testing]

### Test Environment Details
- **OS:** [Operating System]
- **Browser/Electron Version:** [Version]
- **Database:** [Database type/version]
- **Screen Resolution:** [Resolution]
- **Test Data:** [Description of test data used]

### Known Limitations
[Any known limitations or constraints during testing]

---

**End of Acceptance Test Plan**

