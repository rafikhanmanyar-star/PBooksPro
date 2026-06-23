/**
 * EmployeeList - Displays all employees in the payroll system
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Search, UserPlus, FileDown, Mail, Phone, Loader2 } from 'lucide-react';
import { storageService } from './services/storageService';
import { payrollApi } from '../../services/api/payrollApi';
import {
  getPayrollSyncCoordinator,
  isPayrollCacheFresh,
  requestPayrollSync,
} from './services/payrollSyncCoordinator';
import { PayrollEmployee, EmployeeListProps } from './types';
import { useAuth } from '../../context/AuthContext';
import { usePayrollContext } from '../../context/PayrollContext';
import { todayLocalYyyyMmDd } from '../../utils/dateUtils';
import VirtualizedEmployeeTable from './VirtualizedEmployeeTable';
import { useDebouncedSearch } from '../../hooks/search';
import { isAccountingBackedByRemoteApi } from '../../config/apiUrl';

const EmployeeList: React.FC<EmployeeListProps> = ({ onSelect, onAdd }) => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id || '';
  
  // Use PayrollContext for preserving search term across navigation
  const { workforceSearchTerm, setWorkforceSearchTerm } = usePayrollContext();

  const {
    value: searchInput,
    debouncedValue: debouncedSearch,
    setValue: setSearchInput,
    debounceGeneration,
    isLatestGeneration,
  } = useDebouncedSearch({ initialValue: workforceSearchTerm, delayMs: 300 });

  useEffect(() => {
    setWorkforceSearchTerm(searchInput);
  }, [searchInput, setWorkforceSearchTerm]);
  
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [serverSearchResults, setServerSearchResults] = useState<PayrollEmployee[] | null>(null);
  const [isServerSearching, setIsServerSearching] = useState(false);

  // Deduplicate by id so each employee appears once
  const dedupeById = (list: PayrollEmployee[]): PayrollEmployee[] => {
    const byId = new Map<string, PayrollEmployee>();
    list.forEach(emp => byId.set(emp.id, emp));
    return Array.from(byId.values());
  };

  // Cache-first: render from localStorage immediately; refresh in background when stale.
  useEffect(() => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }

    storageService.init(tenantId);
    setEmployees(dedupeById(storageService.getEmployees(tenantId)));
    setIsLoading(false);

    if (!isAccountingBackedByRemoteApi()) return;

    let cancelled = false;

    const refreshIfStale = async () => {
      const coordinator = getPayrollSyncCoordinator();

      if (isPayrollCacheFresh(tenantId)) {
        coordinator.recordCacheHit();
        return;
      }

      coordinator.recordCacheMiss();

      if (coordinator.isSyncRunning(tenantId)) {
        try {
          await requestPayrollSync(tenantId, { source: 'employee-list-wait' });
        } catch (error) {
          console.warn('Payroll sync wait failed for employee list:', error);
        }
        if (!cancelled) {
          setEmployees(dedupeById(storageService.getEmployees(tenantId)));
        }
        return;
      }

      try {
        const apiEmployees = await payrollApi.getEmployees();
        if (cancelled) return;
        const unique = dedupeById(apiEmployees);
        setEmployees(unique);
        storageService.setEmployees(tenantId, unique);
      } catch (error) {
        console.warn('Failed to refresh employees from API, using cache:', error);
      }
    };

    void refreshIfStale();

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const onStorageUpdated = (ev: Event) => {
      const t = (ev as CustomEvent<{ tenantId?: string }>).detail?.tenantId;
      if (t && t !== tenantId) return;
      storageService.init(tenantId);
      setEmployees(dedupeById(storageService.getEmployees(tenantId)));
    };
    window.addEventListener('pbooks-payroll-storage-updated', onStorageUpdated);
    return () => window.removeEventListener('pbooks-payroll-storage-updated', onStorageUpdated);
  }, [tenantId]);

  useEffect(() => {
    const term = debouncedSearch.trim();
    if (!term || !isAccountingBackedByRemoteApi() || !tenantId) {
      setServerSearchResults(null);
      setIsServerSearching(false);
      return;
    }

    const generation = debounceGeneration;
    let cancelled = false;
    setIsServerSearching(true);

    (async () => {
      try {
        const page = await payrollApi.findEmployeesPage({
          page: 1,
          pageSize: 200,
          search: term,
        });
        if (!cancelled && isLatestGeneration(generation)) {
          setServerSearchResults(dedupeById(page.data));
        }
      } catch (error) {
        console.warn('Server employee search failed:', error);
        if (!cancelled && isLatestGeneration(generation)) {
          setServerSearchResults(null);
        }
      } finally {
        if (!cancelled && isLatestGeneration(generation)) {
          setIsServerSearching(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, debounceGeneration, tenantId, isLatestGeneration]);

  // Filter employees based on search (local fallback when not on API search path)
  const filteredEmployees = useMemo(() => {
    if (serverSearchResults) return serverSearchResults;
    if (!debouncedSearch) return employees;
    const term = debouncedSearch.toLowerCase();
    return employees.filter(emp => 
      emp.name.toLowerCase().includes(term) ||
      emp.department.toLowerCase().includes(term) ||
      emp.designation.toLowerCase().includes(term) ||
      emp.id.toLowerCase().includes(term) ||
      (emp.email?.toLowerCase().includes(term))
    );
  }, [employees, debouncedSearch, serverSearchResults]);

  const handleExportCSV = () => {
    setIsExporting(true);
    setTimeout(() => {
      const headers = ['ID', 'Name', 'Email', 'Phone', 'Designation', 'Department', 'Grade', 'Status', 'Joining Date', 'Basic Salary'];
      const rows = filteredEmployees.map(emp => [
        emp.id,
        emp.name,
        emp.email || '',
        emp.phone || '',
        emp.designation,
        emp.department,
        emp.grade,
        emp.status,
        emp.joining_date,
        emp.salary.basic
      ]);

      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `Workforce_Export_${todayLocalYyyyMmDd()}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsExporting(false);
    }, 800);
  };

  if (!tenantId || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={32} className="text-primary animate-spin" />
        <p className="text-app-muted font-bold">Loading workforce...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-app-text tracking-tight">Workforce</h1>
          <p className="text-app-muted text-xs sm:text-sm">Management of employee payroll profiles and status.</p>
        </div>
        <button 
          onClick={onAdd}
          className="bg-primary text-ds-on-primary px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold hover:opacity-90 transition-all shadow-ds-card flex items-center justify-center gap-2 text-sm"
        >
          <UserPlus size={18} /> Add Employee
        </button>
      </div>

      {/* Search and Export */}
      <div className="flex items-center gap-2 sm:gap-4 bg-app-card p-3 sm:p-4 rounded-2xl border border-app-border shadow-ds-card focus-within:ring-2 ring-primary/20 transition-all">
        <Search size={18} className="text-app-muted shrink-0" />
        <input 
          type="text" 
          placeholder="Search workforce..." 
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1 min-w-0 outline-none text-app-text placeholder:text-[color:var(--text-placeholder)] bg-transparent text-sm font-medium"
        />
        <div className="h-6 w-[1px] bg-app-border hidden sm:block"></div>
        <button 
          onClick={handleExportCSV}
          disabled={isExporting}
          className="text-app-muted hover:text-app-text transition-colors p-2 hover:bg-app-toolbar rounded-lg disabled:opacity-50 shrink-0"
          title="Export Filtered CSV"
        >
          {isExporting ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
        </button>
      </div>

      {/* Employee Cards (Mobile) */}
      <div className="block md:hidden space-y-3">
        {filteredEmployees.length > 0 ? (
          filteredEmployees.map((emp) => (
            <div 
              key={emp.id} 
              className="bg-app-card rounded-2xl border border-app-border p-4 shadow-ds-card active:bg-primary/5 transition-colors" 
              onClick={() => onSelect(emp)}
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-app-toolbar flex items-center justify-center font-bold text-app-muted uppercase shrink-0">
                  {emp.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-app-text">{emp.name}</div>
                  <div className="text-xs text-app-muted font-medium truncate">
                    {emp.employee_code || `ID: ${emp.id}`}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="text-xs font-bold text-app-text bg-app-toolbar px-2 py-0.5 rounded">{emp.designation}</span>
                    <span className="text-xs font-medium text-app-muted bg-app-toolbar/60 px-2 py-0.5 rounded">{emp.department}</span>
                  </div>
                  {(emp.email || emp.phone) && (
                    <div className="mt-2 space-y-1">
                      {emp.email && (
                        <div className="flex items-center gap-1.5 text-xs text-app-muted font-medium truncate">
                          <Mail size={10} /> {emp.email}
                        </div>
                      )}
                      {emp.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-app-muted font-medium">
                          <Phone size={10} /> {emp.phone}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-app-card rounded-2xl border border-app-border px-4 py-12 text-center text-app-muted font-medium text-sm">
            {debouncedSearch || isServerSearching ? 'No employees found matching your search.' : 'No employees added yet.'}
          </div>
        )}
      </div>

      {/* Employee Table (Desktop) */}
      <div className="hidden md:block bg-app-card rounded-3xl shadow-ds-card border border-app-border overflow-hidden">
        <VirtualizedEmployeeTable
          employees={filteredEmployees}
          onSelect={onSelect}
          emptyMessage={
            debouncedSearch || isServerSearching
              ? 'No employees found matching your search.'
              : 'No employees added yet. Click "Add Employee" to get started.'
          }
        />
      </div>
    </div>
  );
};

export default EmployeeList;
