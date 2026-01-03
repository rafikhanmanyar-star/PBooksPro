
import React from 'react';
import { Page } from '../../types';
import Modal from '../ui/Modal';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage: Page;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, currentPage }) => {
  const getPageHelp = (page: Page) => {
    switch (page) {
      case 'dashboard':
        return {
          title: 'Dashboard Help',
          content: (
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Overview</h3>
                <p>The Dashboard provides an overview of your financial KPIs and quick access to key features.</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Key Features:</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>KPI Cards:</strong> View important metrics like Total Balance, Accounts Receivable, Accounts Payable, and Outstanding Loans</li>
                  <li><strong>KPI Panel:</strong> Click the chart icon to customize visible KPIs, add category-based KPIs, and access reports</li>
                  <li><strong>Quick Actions:</strong> Use action buttons to quickly create transactions, invoices, bills, or navigate to different modules</li>
                  <li><strong>Recent Transactions:</strong> View recent financial activity at a glance</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Navigation:</h3>
                <p>Use the sidebar or mobile footer to navigate to specific modules like Rental Management, Project Management, or General Ledger.</p>
              </div>
            </div>
          )
        };

      case 'transactions':
        return {
          title: 'General Ledger Help',
          content: (
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Overview</h3>
                <p>The General Ledger records all financial transactions including income, expenses, transfers, and loans.</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Key Features:</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>View Mode:</strong> Switch between "This Month" and "All Time" views using the toggle</li>
                  <li><strong>Search:</strong> Use the search bar to find transactions by description, account, category, or contact</li>
                  <li><strong>Filters:</strong> Click the filter icon to filter by date range, account, category, project, contact, or transaction type</li>
                  <li><strong>Sort:</strong> Click column headers to sort transactions by date, amount, account, etc.</li>
                  <li><strong>Export:</strong> Export transactions to Excel for external analysis</li>
                  <li><strong>Edit/Delete:</strong> Click on any transaction to edit or delete it</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Transaction Types:</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Income:</strong> Money received - increases account balance</li>
                  <li><strong>Expense:</strong> Money spent - decreases account balance</li>
                  <li><strong>Transfer:</strong> Move money between accounts</li>
                  <li><strong>Loan:</strong> Record loan transactions (give, receive, repay, collect)</li>
                </ul>
              </div>
            </div>
          )
        };

      case 'bills':
        return {
          title: 'Bill Management Help',
          content: (
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Overview</h3>
                <p>Manage vendor bills, track payments, and monitor outstanding balances.</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Key Features:</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Tree View:</strong> Browse bills organized by project, building, or vendor</li>
                  <li><strong>Search:</strong> Search bills by bill number, vendor name, description, or amount</li>
                  <li><strong>Filters:</strong> Filter by date range, project, status, or vendor</li>
                  <li><strong>Status Tracking:</strong> Bills can be Unpaid, Partially Paid, or Paid</li>
                  <li><strong>Payment Recording:</strong> Click on a bill to record payments</li>
                  <li><strong>Export:</strong> Export bills to Excel for reporting</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Bill Workflow:</h3>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Create a new bill for a vendor</li>
                  <li>Link to project/contract if applicable</li>
                  <li>Record payments as they are made</li>
                  <li>Track remaining balance</li>
                </ol>
              </div>
            </div>
          )
        };

      case 'loans':
        return {
          title: 'Loan Manager Help',
          content: (
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Overview</h3>
                <p>Track loans given to or received from contacts, including repayments and balances.</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Key Features:</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Loan Summary:</strong> View outstanding loan balances by contact</li>
                  <li><strong>Transaction History:</strong> See all loan-related transactions for each contact</li>
                  <li><strong>Search:</strong> Search loans by contact name</li>
                  <li><strong>Loan Types:</strong> Track both loans given (you lending) and loans received (you borrowing)</li>
                  <li><strong>Export:</strong> Export loan statements to Excel</li>
                </ul>
              </div>
            </div>
          )
        };

      case 'rentalManagement':
      case 'rentalInvoices':
        return {
          title: 'Rental Management Help',
          content: (
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Overview</h3>
                <p>Manage rental properties, tenants, invoices, and owner payouts.</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Key Features:</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Invoices Tab:</strong> Create and manage rental invoices, record payments</li>
                  <li><strong>Agreements Tab:</strong> Create rental agreements, track tenant details and rent amounts</li>
                  <li><strong>Reports Tab:</strong> View rental reports and analytics</li>
                  <li><strong>Payouts Tab:</strong> Manage owner payouts and distributions</li>
                </ul>
              </div>
            </div>
          )
        };

      case 'rentalAgreements':
        return {
          title: 'Rental Agreements Help',
          content: (
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Overview</h3>
                <p>Create and manage rental agreements with tenants.</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Key Features:</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Create Agreement:</strong> Add new rental agreements with tenant, property, rent amount, and dates</li>
                  <li><strong>Search:</strong> Search agreements by agreement number or tenant name</li>
                  <li><strong>Terminate:</strong> Terminate agreements when tenants move out</li>
                  <li><strong>Status Tracking:</strong> Monitor active, terminated, and completed agreements</li>
                </ul>
              </div>
            </div>
          )
        };

      case 'projectManagement':
      case 'projectInvoices':
        return {
          title: 'Project Management Help',
          content: (
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Overview</h3>
                <p>Manage construction projects, agreements, contracts, and project finances.</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Key Features:</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Invoices Tab:</strong> Create project invoices for clients</li>
                  <li><strong>Agreements Tab:</strong> Manage project agreements with buyers</li>
                  <li><strong>Contracts Tab:</strong> Track vendor contracts and payments</li>
                  <li><strong>Reports Tab:</strong> View project financial reports including P&L and balance sheets</li>
                  <li><strong>Equity Tab:</strong> Manage investor equity and distributions</li>
                </ul>
              </div>
            </div>
          )
        };


      case 'vendorDirectory':
        return {
          title: 'Vendor Directory Help',
          content: (
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Overview</h3>
                <p>Manage vendor information, quotations, bills, and payments.</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Key Features:</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Add Vendor:</strong> Create new vendor/supplier profiles</li>
                  <li><strong>Search:</strong> Search vendors by name</li>
                  <li><strong>View Details:</strong> Click on a vendor to view quotations, bills, and payment history</li>
                  <li><strong>Quotations:</strong> Manage vendor quotations</li>
                  <li><strong>Bill Tracking:</strong> View all bills from each vendor</li>
                </ul>
              </div>
            </div>
          )
        };

      case 'contacts':
        return {
          title: 'Contacts Help',
          content: (
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Overview</h3>
                <p>Manage all contacts including tenants, owners, vendors, staff, and brokers.</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Key Features:</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Contact Types:</strong> Organize contacts by type (Tenant, Owner, Vendor, Staff, Broker)</li>
                  <li><strong>Search:</strong> Search contacts by name</li>
                  <li><strong>View Ledger:</strong> Click on a contact to view their transaction ledger</li>
                  <li><strong>Filter by Type:</strong> Use tabs to filter contacts by type</li>
                </ul>
              </div>
            </div>
          )
        };

      case 'payroll':
        return {
          title: 'Payroll Help',
          content: (
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Overview</h3>
                <p>Manage employees, process payroll, track attendance, and handle salary components.</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Key Features:</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Employee Management:</strong> Add and manage employee profiles</li>
                  <li><strong>Salary Structure:</strong> Define salary components and structures</li>
                  <li><strong>Payroll Processing:</strong> Generate and process payroll cycles</li>
                  <li><strong>Payslips:</strong> View and manage employee payslips</li>
                </ul>
              </div>
            </div>
          )
        };

      case 'settings':
        return {
          title: 'Settings Help',
          content: (
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Overview</h3>
                <p>Configure accounts, categories, contacts, projects, and application settings.</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Key Sections:</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Accounts:</strong> Manage bank accounts, cash, and other account types</li>
                  <li><strong>Categories:</strong> Create and manage income and expense categories</li>
                  <li><strong>Contacts:</strong> Manage contacts (moved to dedicated Contacts page)</li>
                  <li><strong>Projects:</strong> Create and configure projects</li>
                  <li><strong>Data Management:</strong> Export data, clear transactions, or perform factory reset</li>
                  <li><strong>Print Settings:</strong> Configure company information for invoices</li>
                </ul>
              </div>
            </div>
          )
        };

      default:
        return {
          title: 'Help',
          content: (
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">General Help</h3>
                <p>Use the search icon in the header to find specific items on this page.</p>
                <p>Navigate between pages using the sidebar (desktop) or footer (mobile).</p>
                <p>For detailed help about specific features, visit the Settings page and click on Help section.</p>
              </div>
            </div>
          )
        };
    }
  };

  const helpContent = getPageHelp(currentPage);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={helpContent.title} size="lg">
      <div className="max-h-[70vh] overflow-y-auto">
        {helpContent.content}
      </div>
    </Modal>
  );
};

export default HelpModal;

