
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Page, Transaction, Bill, Contract, RentalAgreement, ProjectAgreement, Contact, ContactType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import { ICONS, CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage: Page;
}

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  onClick: () => void;
}

const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, currentPage }) => {
  const { state, dispatch } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      return;
    }
    // Focus search input when modal opens
    setTimeout(() => {
      const input = document.getElementById('search-modal-input');
      input?.focus();
    }, 100);
  }, [isOpen]);

  const handleSearch = useMemo(() => {
    return () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      const query = searchQuery.toLowerCase().trim();
      const results: SearchResult[] = [];

      switch (currentPage) {
        case 'transactions': {
          state.transactions
            .filter(tx => {
              const description = tx.description?.toLowerCase() || '';
              const account = state.accounts.find(a => a.id === tx.accountId)?.name.toLowerCase() || '';
              const category = state.categories.find(c => c.id === tx.categoryId)?.name.toLowerCase() || '';
              const contact = state.contacts.find(c => c.id === tx.contactId)?.name.toLowerCase() || '';
              const amount = tx.amount.toString();
              return description.includes(query) || account.includes(query) || category.includes(query) || contact.includes(query) || amount.includes(query);
            })
            .slice(0, 20)
            .forEach(tx => {
              const account = state.accounts.find(a => a.id === tx.accountId)?.name || 'Unknown';
              results.push({
                id: tx.id,
                type: 'Transaction',
                title: tx.description || 'No description',
                subtitle: `${account} • ${CURRENCY}${tx.amount.toFixed(2)} • ${formatDate(tx.date)}`,
                onClick: () => {
                  sessionStorage.setItem('openTransactionId', tx.id);
                  dispatch({ type: 'SET_PAGE', payload: 'transactions' });
                  onClose();
                }
              });
            });
          break;
        }

        case 'bills': {
          state.bills
            .filter(bill => {
              const billNumber = bill.billNumber?.toLowerCase() || '';
              const description = bill.description?.toLowerCase() || '';
              const vendor = state.contacts.find(c => c.id === bill.contactId)?.name.toLowerCase() || '';
              const contract = state.contracts.find(c => c.id === bill.contractId)?.name.toLowerCase() || '';
              const amount = bill.amount.toString();
              return billNumber.includes(query) || description.includes(query) || vendor.includes(query) || contract.includes(query) || amount.includes(query);
            })
            .slice(0, 20)
            .forEach(bill => {
              const vendor = state.contacts.find(c => c.id === bill.contactId)?.name || 'Unknown';
              results.push({
                id: bill.id,
                type: 'Bill',
                title: bill.billNumber || 'No number',
                subtitle: `${vendor} • ${CURRENCY}${bill.amount.toFixed(2)} • ${formatDate(bill.issueDate)}`,
                onClick: () => {
                  sessionStorage.setItem('openBillId', bill.id);
                  dispatch({ type: 'SET_PAGE', payload: 'bills' });
                  onClose();
                }
              });
            });
          break;
        }

        case 'projectManagement': {
          // Search contracts
          state.contracts
            .filter(contract => {
              const contractNumber = contract.contractNumber?.toLowerCase() || '';
              const name = contract.name?.toLowerCase() || '';
              const vendor = state.contacts.find(c => c.id === contract.vendorId)?.name.toLowerCase() || '';
              return contractNumber.includes(query) || name.includes(query) || vendor.includes(query);
            })
            .slice(0, 20)
            .forEach(contract => {
              const vendor = state.contacts.find(c => c.id === contract.vendorId)?.name || 'Unknown';
              results.push({
                id: contract.id,
                type: 'Contract',
                title: contract.name || contract.contractNumber || 'No name',
                subtitle: `${vendor} • ${CURRENCY}${contract.totalAmount.toFixed(2)}`,
                onClick: () => {
                  sessionStorage.setItem('openContractId', contract.id);
                  dispatch({ type: 'SET_PAGE', payload: 'projectManagement' });
                  onClose();
                }
              });
            });

          // Search project agreements
          state.projectAgreements
            .filter(agreement => {
              const agreementNumber = agreement.agreementNumber?.toLowerCase() || '';
              const client = state.contacts.find(c => c.id === agreement.clientId)?.name.toLowerCase() || '';
              return agreementNumber.includes(query) || client.includes(query);
            })
            .slice(0, 10)
            .forEach(agreement => {
              const client = state.contacts.find(c => c.id === agreement.clientId)?.name || 'Unknown';
              results.push({
                id: agreement.id,
                type: 'Project Agreement',
                title: agreement.agreementNumber || 'No number',
                subtitle: `${client} • ${CURRENCY}${agreement.sellingPrice.toFixed(2)}`,
                onClick: () => {
                  sessionStorage.setItem('openProjectAgreementId', agreement.id);
                  dispatch({ type: 'SET_PAGE', payload: 'projectManagement' });
                  onClose();
                }
              });
            });
          break;
        }

        case 'rentalAgreements': {
          state.rentalAgreements
            .filter(agreement => {
              const agreementNumber = agreement.agreementNumber?.toLowerCase() || '';
              const tenant = state.contacts.find(c => c.id === agreement.tenantId)?.name.toLowerCase() || '';
              return agreementNumber.includes(query) || tenant.includes(query);
            })
            .slice(0, 20)
            .forEach(agreement => {
              const tenant = state.contacts.find(c => c.id === agreement.tenantId)?.name || 'Unknown';
              results.push({
                id: agreement.id,
                type: 'Rental Agreement',
                title: agreement.agreementNumber || 'No number',
                subtitle: `${tenant} • ${CURRENCY}${agreement.monthlyRent.toFixed(2)}/month`,
                onClick: () => {
                  sessionStorage.setItem('openRentalAgreementId', agreement.id);
                  dispatch({ type: 'SET_PAGE', payload: 'rentalAgreements' });
                  onClose();
                }
              });
            });
          break;
        }

        case 'vendorDirectory':
        case 'contacts': {
          state.contacts
            .filter(contact => {
              const name = contact.name?.toLowerCase() || '';
              const description = contact.description?.toLowerCase() || '';
              const type = contact.type?.toLowerCase() || '';
              return name.includes(query) || description.includes(query) || type.includes(query);
            })
            .slice(0, 20)
            .forEach(contact => {
              results.push({
                id: contact.id,
                type: contact.type || 'Contact',
                title: contact.name || 'No name',
                subtitle: contact.description || contact.type || '',
                onClick: () => {
                  if (currentPage === 'vendorDirectory') {
                    sessionStorage.setItem('openVendorId', contact.id);
                    dispatch({ type: 'SET_PAGE', payload: 'vendorDirectory' });
                  } else {
                    dispatch({ type: 'SET_EDITING_ENTITY', payload: { type: `CONTACT_${contact.type}`, id: contact.id } });
                    dispatch({ type: 'SET_PAGE', payload: 'settings' });
                  }
                  onClose();
                }
              });
            });
          break;
        }

        case 'payroll': {
          // Search employees/staff
          const employees = state.employees || [];
          employees
            .filter(emp => {
              const firstName = emp.personalDetails?.firstName?.toLowerCase() || '';
              const lastName = emp.personalDetails?.lastName?.toLowerCase() || '';
              const name = `${firstName} ${lastName}`.trim().toLowerCase();
              const employeeId = emp.employeeId?.toLowerCase() || '';
              const department = emp.employmentDetails?.department?.toLowerCase() || '';
              return name.includes(query) || employeeId.includes(query) || department.includes(query);
            })
            .slice(0, 20)
            .forEach(emp => {
              const firstName = emp.personalDetails?.firstName || '';
              const lastName = emp.personalDetails?.lastName || '';
              const name = `${firstName} ${lastName}`.trim() || 'No name';
              results.push({
                id: emp.id,
                type: 'Employee',
                title: name,
                subtitle: `${emp.employeeId || ''} • ${emp.employmentDetails?.department || ''}`,
                onClick: () => {
                  sessionStorage.setItem('openEmployeeId', emp.id);
                  dispatch({ type: 'SET_PAGE', payload: 'payroll' });
                  onClose();
                }
              });
            });
          break;
        }

        default:
          // Generic search across common entities
          state.contacts
            .filter(contact => contact.name?.toLowerCase().includes(query))
            .slice(0, 10)
            .forEach(contact => {
              results.push({
                id: contact.id,
                type: contact.type || 'Contact',
                title: contact.name || 'No name',
                subtitle: contact.type || '',
                onClick: () => {
                  dispatch({ type: 'SET_EDITING_ENTITY', payload: { type: `CONTACT_${contact.type}`, id: contact.id } });
                  dispatch({ type: 'SET_PAGE', payload: 'settings' });
                  onClose();
                }
              });
            });
          break;
      }

      setSearchResults(results);
    };
  }, [searchQuery, currentPage, state, dispatch, onClose]);

  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

  const getSearchPlaceholder = () => {
    switch (currentPage) {
      case 'transactions': return 'Search transactions...';
      case 'bills': return 'Search bills...';
      case 'projectManagement': return 'Search contracts and agreements...';
      case 'rentalAgreements': return 'Search rental agreements...';
      case 'vendorDirectory': return 'Search vendors...';
      case 'contacts': return 'Search contacts...';
      case 'payroll': return 'Search employees...';
      default: return 'Search...';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Search" size="lg">
      <div className="space-y-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <span className="h-5 w-5">{ICONS.search}</span>
          </div>
          <Input
            id="search-modal-input"
            placeholder={getSearchPlaceholder()}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`pl-10 ${searchQuery ? 'pr-10' : ''}`}
            autoFocus
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')} 
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 transition-colors"
              type="button"
              aria-label="Clear search"
            >
              <span className="h-5 w-5">{ICONS.x}</span>
            </button>
          )}
        </div>

        {searchResults.length > 0 ? (
          <div className="max-h-96 overflow-y-auto space-y-2">
            {searchResults.map((result) => (
              <button
                key={result.id}
                onClick={result.onClick}
                className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                <div className="font-medium text-gray-900">{result.title}</div>
                {result.subtitle && (
                  <div className="text-sm text-gray-500 mt-1">{result.subtitle}</div>
                )}
                <div className="text-xs text-gray-400 mt-1">{result.type}</div>
              </button>
            ))}
          </div>
        ) : searchQuery.trim() ? (
          <div className="text-center py-8 text-gray-500">
            No results found for "{searchQuery}"
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            Start typing to search...
          </div>
        )}
      </div>
    </Modal>
  );
};

export default SearchModal;

