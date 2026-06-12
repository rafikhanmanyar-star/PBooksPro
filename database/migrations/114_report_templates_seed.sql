-- Seed system report template catalog (Universal Report Designer presets)

INSERT INTO report_templates (id, module, name, description, report_type, category, configuration_json, sort_order)
VALUES
  (
    'selling-customer-ledger',
    'project_selling',
    'Customer Ledger',
    'Bookings with paid and outstanding amounts',
    'ledger',
    'Selling',
    '{"reportType":"ledger","fields":["booking_no","customer_name","project_name","selling_price","invoice_paid_total","outstanding_vs_invoices"]}'::jsonb,
    10
  ),
  (
    'selling-receivable-aging',
    'project_selling',
    'Receivable Aging',
    'Outstanding by customer and project',
    'aging',
    'Selling',
    '{"reportType":"aging","fields":["customer_name","project_name","outstanding_vs_invoices"],"groupBy":["project_name"]}'::jsonb,
    20
  ),
  (
    'selling-defaulters',
    'project_selling',
    'Defaulter List',
    'Active agreements with outstanding balance',
    'tabular',
    'Selling',
    '{"reportType":"tabular","fields":["booking_no","customer_name","project_name","outstanding_vs_invoices","agreement_status"],"filters":[{"field":"outstanding_vs_invoices","operator":">","value":"0"}]}'::jsonb,
    30
  ),
  (
    'selling-collection-chart',
    'project_selling',
    'Collections by Project',
    'Chart of outstanding balances grouped by project',
    'chart',
    'Selling',
    '{"reportType":"chart","fields":["customer_name","project_name","outstanding_vs_invoices"],"groupBy":["project_name"],"aggregates":[{"field":"outstanding_vs_invoices","operation":"SUM"}]}'::jsonb,
    40
  ),
  (
    'construction-vendor-ledger',
    'project_construction',
    'Vendor Ledger',
    'Contracts with billed, paid, and outstanding',
    'ledger',
    'Construction',
    '{"reportType":"ledger","fields":["contract_number","vendor_name","project_name","contract_amount","billed_total","paid_total","outstanding"]}'::jsonb,
    10
  ),
  (
    'construction-site-expense',
    'project_construction',
    'Site Expense Report',
    'Bills and overdue by vendor and project',
    'summary',
    'Construction',
    '{"reportType":"summary","fields":["vendor_name","project_name","billed_total","paid_total","overdue_amount"],"groupBy":["project_name"]}'::jsonb,
    20
  ),
  (
    'rental-tenant-ledger',
    'rental_agreements',
    'Tenant Ledger',
    'Rental agreements with rent and status',
    'ledger',
    'Rental',
    '{"reportType":"ledger","fields":["agreement_number","tenant_name","property_name","building_name","monthly_rent","status","start_date","end_date"]}'::jsonb,
    10
  ),
  (
    'rental-rent-collection',
    'rental_agreements',
    'Rent Collection',
    'Agreements grouped by building',
    'grouped',
    'Rental',
    '{"reportType":"grouped","fields":["tenant_name","monthly_rent","building_name","property_name"],"groupBy":["building_name"]}'::jsonb,
    20
  ),
  (
    'rental-rent-collection-chart',
    'rental_agreements',
    'Rent by Building',
    'Chart of monthly rent totals by building',
    'chart',
    'Rental',
    '{"reportType":"chart","fields":["tenant_name","monthly_rent","building_name"],"groupBy":["building_name"],"aggregates":[{"field":"monthly_rent","operation":"SUM"}]}'::jsonb,
    25
  ),
  (
    'rental-contract-expiry',
    'rental_agreements',
    'Contract Expiry',
    'Agreements sorted by end date',
    'tabular',
    'Rental',
    '{"reportType":"tabular","fields":["agreement_number","tenant_name","property_name","end_date","status"]}'::jsonb,
    30
  ),
  (
    'accounting-transaction-ledger',
    'accounting_ledger',
    'Transaction Ledger',
    'All transactions with account, category, and project',
    'ledger',
    'Accounting',
    '{"reportType":"ledger","fields":["txn_date","txn_type","amount","description","account_name","category_name","project_name"]}'::jsonb,
    10
  )
ON CONFLICT (id) DO UPDATE SET
  module = EXCLUDED.module,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  report_type = EXCLUDED.report_type,
  category = EXCLUDED.category,
  configuration_json = EXCLUDED.configuration_json,
  sort_order = EXCLUDED.sort_order;
