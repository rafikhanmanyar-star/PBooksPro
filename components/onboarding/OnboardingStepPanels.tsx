import React, { useMemo, useState } from 'react';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Select from '../ui/Select';
import Button from '../ui/Button';
const CURRENCY_OPTIONS = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'PKR', name: 'Pakistani Rupee' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'EUR', name: 'Euro' },
];
import { useAccounts, useBuildings, useDispatchOnly, usePrintSettings, useProperties, useStateSelector, useUsers } from '../../hooks/useSelectiveState';
import { _getAppState } from '../../context/appStateStore';
import { ContactType, PrintSettings, TransactionType } from '../../types';
import { accountingPeriodsApi } from '../../services/api/accountingPeriodsApi';
import { getAppStateApiService } from '../../services/api/appStateApi';
import { apiClient } from '../../services/api/client';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { useAuth } from '../../context/AuthContext';
import { ASSIGNABLE_ROLES } from '../../shared/rbac/permissions';
import type { OnboardingStepId } from '../../shared/onboarding/onboardingSteps';
import type { OnboardingState } from '../../services/api/onboardingApi';

export type StepPanelProps = {
  stepId: OnboardingStepId;
  state: OnboardingState;
  onStepDataChange: (partial: Record<string, unknown>) => void;
  setBusy: (v: boolean) => void;
  setStepError: (msg: string | null) => void;
};

function fiscalPeriodBounds(fiscalStartMonth: number): { startDate: string; endDate: string } {
  const now = new Date();
  const calMonth = now.getMonth() + 1;
  const calYear = now.getFullYear();
  const fyStartYear = calMonth >= fiscalStartMonth ? calYear : calYear - 1;
  const startDate = `${fyStartYear}-${String(fiscalStartMonth).padStart(2, '0')}-01`;
  const endYear = fiscalStartMonth === 1 ? fyStartYear : fyStartYear + 1;
  const endMonth = fiscalStartMonth === 1 ? 12 : fiscalStartMonth - 1;
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

export const WelcomeStepPanel: React.FC<{ tenantName?: string }> = ({ tenantName }) => (
  <div className="space-y-6 text-center sm:text-left">
    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-3xl shadow-lg shadow-indigo-200">
      🏢
    </div>
    <div>
      <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
        Welcome{tenantName ? `, ${tenantName}` : ''}!
      </h2>
      <p className="mt-3 text-slate-600 max-w-xl leading-relaxed">
        This guided setup takes about 10 minutes. You can save progress and resume anytime from Settings.
        We will configure your company profile, fiscal calendar, chart of accounts, and first property.
      </p>
    </div>
    <ul className="grid sm:grid-cols-2 gap-3 text-left text-sm text-slate-600">
      {['Company branding for invoices', 'Fiscal year & open period', 'Rental property structure', 'Team access (optional)'].map(
        (item) => (
          <li key={item} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
            <span className="text-emerald-500">✓</span>
            {item}
          </li>
        )
      )}
    </ul>
  </div>
);

export const BusinessSetupStepPanel: React.FC<StepPanelProps> = ({ state, onStepDataChange }) => {
  const data = (state.stepData.business_setup ?? {}) as Record<string, string>;
  return (
    <div className="space-y-5">
      <p className="text-slate-600">Help us tailor defaults for your organization.</p>
      <Select
        label="Primary business focus"
        value={data.businessType ?? 'property_management'}
        onChange={(e) => onStepDataChange({ businessType: e.target.value })}
      >
        <option value="property_management">Property management</option>
        <option value="real_estate_developer">Real estate developer</option>
        <option value="mixed">Mixed (rental + projects)</option>
      </Select>
      <Select
        label="Default currency"
        value={data.currency ?? 'USD'}
        onChange={(e) => onStepDataChange({ currency: e.target.value })}
      >
        {CURRENCY_OPTIONS.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name}
          </option>
        ))}
      </Select>
      <Select
        label="Team size (estimate)"
        value={data.teamSize ?? 'small'}
        onChange={(e) => onStepDataChange({ teamSize: e.target.value })}
      >
        <option value="solo">Just me</option>
        <option value="small">2–10 people</option>
        <option value="medium">11–50 people</option>
        <option value="large">50+ people</option>
      </Select>
    </div>
  );
};

export const CompanyInfoStepPanel: React.FC<StepPanelProps> = ({ state, onStepDataChange }) => {
  const printSettings = usePrintSettings();
  const saved = (state.stepData.company_info ?? {}) as Partial<PrintSettings>;
  const [form, setForm] = useState<Partial<PrintSettings>>({
    companyName: saved.companyName ?? printSettings.companyName ?? '',
    companyAddress: saved.companyAddress ?? printSettings.companyAddress ?? '',
    companyContact: saved.companyContact ?? printSettings.companyContact ?? '',
    taxId: saved.taxId ?? printSettings.taxId ?? '',
    showLogo: saved.showLogo ?? printSettings.showLogo ?? true,
    showDatePrinted: saved.showDatePrinted ?? printSettings.showDatePrinted ?? true,
  });

  const update = (field: keyof PrintSettings, value: string | boolean) => {
    const next = { ...form, [field]: value };
    setForm(next);
    onStepDataChange(next);
  };

  return (
    <div className="space-y-4">
      <p className="text-slate-600">Shown on invoices, receipts, and printed reports.</p>
      <Input label="Company / legal name" value={form.companyName ?? ''} onChange={(e) => update('companyName', e.target.value)} required />
      <Textarea label="Address" value={form.companyAddress ?? ''} onChange={(e) => update('companyAddress', e.target.value)} rows={3} />
      <Input label="Phone / email" value={form.companyContact ?? ''} onChange={(e) => update('companyContact', e.target.value)} />
      <Input label="Tax / registration ID (optional)" value={form.taxId ?? ''} onChange={(e) => update('taxId', e.target.value)} />
    </div>
  );
};

export const FiscalYearStepPanel: React.FC<StepPanelProps> = ({ state, onStepDataChange }) => {
  const data = (state.stepData.fiscal_year ?? {}) as { fiscalStartMonth?: number };
  const month = data.fiscalStartMonth ?? 1;
  const bounds = useMemo(() => fiscalPeriodBounds(month), [month]);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return (
    <div className="space-y-5">
      <p className="text-slate-600">Choose when your financial year begins. We will open your first accounting period.</p>
      <Select
        label="Fiscal year starts in"
        value={String(month)}
        onChange={(e) => {
          const m = Number(e.target.value);
          const b = fiscalPeriodBounds(m);
          onStepDataChange({ fiscalStartMonth: m, startDate: b.startDate, endDate: b.endDate });
        }}
      >
        {months.map((m, i) => (
          <option key={m} value={String(i + 1)}>
            {m}
          </option>
        ))}
      </Select>
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-sm text-indigo-900">
        <p className="font-medium">Current period preview</p>
        <p className="mt-1 text-indigo-700">
          {bounds.startDate} → {bounds.endDate}
        </p>
      </div>
    </div>
  );
};

export const ChartOfAccountsStepPanel: React.FC = () => {
  const accounts = useAccounts();
  const categories = useStateSelector((s) => s.categories);
  const systemAccounts = accounts.filter((a) => a.isPermanent);
  return (
    <div className="space-y-4">
      <p className="text-slate-600">
        PBooksPro ships with a property-management chart of accounts. System accounts are ready for rental income,
        owner payouts, payroll, and project workflows.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-3xl font-bold text-indigo-600">{accounts.length}</p>
          <p className="text-sm text-slate-500">Ledger accounts</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-3xl font-bold text-violet-600">{categories.length}</p>
          <p className="text-sm text-slate-500">Income & expense categories</p>
        </div>
      </div>
      <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs font-mono text-slate-600 space-y-1">
        {systemAccounts.slice(0, 8).map((a) => (
          <div key={a.id}>• {a.name} ({a.type})</div>
        ))}
        {systemAccounts.length > 8 && <div className="text-slate-400">+ {systemAccounts.length - 8} more…</div>}
      </div>
      <p className="text-xs text-slate-500">Add custom accounts anytime under Settings → Accounts.</p>
    </div>
  );
};

export const PropertySetupStepPanel: React.FC<StepPanelProps> = ({ state, onStepDataChange }) => {
  const buildings = useBuildings();
  const properties = useProperties();
  const { isAuthenticated } = useAuth();
  const data = (state.stepData.property_setup ?? {}) as Record<string, string>;
  const [ownerName, setOwnerName] = useState(data.ownerName ?? '');
  const [buildingName, setBuildingName] = useState(data.buildingName ?? '');
  const [propertyName, setPropertyName] = useState(data.propertyName ?? '');

  const sync = () => onStepDataChange({ ownerName, buildingName, propertyName });

  const hasProperty = properties.length > 0;

  return (
    <div className="space-y-4">
      {hasProperty ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 text-sm">
          You already have {properties.length} propert{properties.length === 1 ? 'y' : 'ies'} configured. Continue or add another below.
        </div>
      ) : (
        <p className="text-slate-600">Create your first building, owner, and rental property.</p>
      )}
      <Input label="Owner name" value={ownerName} onChange={(e) => { setOwnerName(e.target.value); sync(); }} placeholder="e.g. ABC Holdings" />
      <Input label="Building name" value={buildingName} onChange={(e) => { setBuildingName(e.target.value); sync(); }} placeholder="e.g. Tower A" />
      <Input label="Property / unit label" value={propertyName} onChange={(e) => { setPropertyName(e.target.value); sync(); }} placeholder="e.g. Unit 101" />
      {!hasProperty && buildings.length === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          On continue, we will create these records using your company APIs.
        </p>
      )}
    </div>
  );
};

export const UserSetupStepPanel: React.FC<StepPanelProps> = ({ state, onStepDataChange }) => {
  const users = useUsers();
  const data = (state.stepData.user_setup ?? {}) as Record<string, string>;
  return (
    <div className="space-y-4">
      <p className="text-slate-600">
        {users.length > 1
          ? `${users.length} users are on this organization. Add another teammate below (optional).`
          : 'Invite a colleague with the right role (optional — skip if you work solo).'}
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Input label="Display name" value={data.name ?? ''} onChange={(e) => onStepDataChange({ name: e.target.value })} />
        <Input label="Username" value={data.username ?? ''} onChange={(e) => onStepDataChange({ username: e.target.value })} />
      </div>
      <Input label="Email (optional)" type="email" value={data.email ?? ''} onChange={(e) => onStepDataChange({ email: e.target.value })} />
      <Input label="Temporary password" type="password" value={data.password ?? ''} onChange={(e) => onStepDataChange({ password: e.target.value })} />
      <Select label="Role" value={data.role ?? 'Accounts'} onChange={(e) => onStepDataChange({ role: e.target.value })}>
        {ASSIGNABLE_ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </Select>
    </div>
  );
};

export const FirstTransactionStepPanel: React.FC<StepPanelProps> = ({ state, onStepDataChange }) => {
  const accounts = useAccounts();
  const data = (state.stepData.first_transaction ?? {}) as Record<string, string>;
  const cashAccount = accounts.find((a) => a.name.toLowerCase().includes('cash')) ?? accounts[0];
  return (
    <div className="space-y-4">
      <p className="text-slate-600">
        Record an opening cash balance or sample receipt to verify your ledger. This step is optional — you can explore
        the Transactions page later.
      </p>
      <Input
        label="Description"
        value={data.description ?? 'Opening cash balance'}
        onChange={(e) => onStepDataChange({ description: e.target.value })}
      />
      <Input
        label="Amount"
        type="number"
        min="0"
        step="0.01"
        value={data.amount ?? ''}
        onChange={(e) => onStepDataChange({ amount: e.target.value })}
      />
      {cashAccount && (
        <p className="text-xs text-slate-500">Will post to: <strong>{cashAccount.name}</strong></p>
      )}
    </div>
  );
};

export const CompletionStepPanel: React.FC<{ state: OnboardingState; tenantName?: string }> = ({ state, tenantName }) => {
  const completed = state.completedSteps;
  const checklist = [
    { id: 'business_setup', label: 'Business profile' },
    { id: 'company_info', label: 'Company information' },
    { id: 'fiscal_year', label: 'Fiscal year' },
    { id: 'chart_of_accounts', label: 'Chart of accounts' },
    { id: 'property_setup', label: 'Property setup' },
    { id: 'user_setup', label: 'Team users' },
    { id: 'first_transaction', label: 'First transaction' },
  ];
  return (
    <div className="space-y-6 text-center sm:text-left">
      <div className="inline-flex w-16 h-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">🎉</div>
      <div>
        <h2 className="text-2xl font-bold text-slate-900">You are ready to go!</h2>
        <p className="mt-2 text-slate-600">
          {tenantName ? `${tenantName} is` : 'Your organization is'} configured. Open the dashboard to start managing properties and finances.
        </p>
      </div>
      <ul className="space-y-2 text-sm">
        {checklist.map((item) => {
          const done = completed.includes(item.id as OnboardingStepId) || item.id === 'chart_of_accounts';
          return (
            <li key={item.id} className="flex items-center gap-2 text-slate-700">
              <span className={done ? 'text-emerald-500' : 'text-slate-300'}>{done ? '✓' : '○'}</span>
              {item.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** Apply side effects when advancing past a step */
export async function applyOnboardingStepActions(
  stepId: OnboardingStepId,
  state: OnboardingState,
  deps: { dispatch: ReturnType<typeof useDispatchOnly>; isAuthenticated: boolean }
): Promise<void> {
  const { dispatch, isAuthenticated } = deps;
  const api = getAppStateApiService();

  if (stepId === 'company_info') {
    const ps = state.stepData.company_info as Partial<PrintSettings> | undefined;
    if (ps && ps.companyName) {
      dispatch({ type: 'UPDATE_PRINT_SETTINGS', payload: { ...ps } as PrintSettings });
      if (!isLocalOnlyMode() && isAuthenticated) {
        const settingsRepo = await import('../../services/api/repositories/appSettingsApi').then((m) => new m.AppSettingsApiRepository());
        await settingsRepo.bulkUpsert({ printSettings: ps });
      }
    }
  }

  if (stepId === 'fiscal_year' && !isLocalOnlyMode() && isAuthenticated) {
    const fy = state.stepData.fiscal_year as { fiscalStartMonth?: number; startDate?: string; endDate?: string };
    const bounds =
      fy?.startDate && fy?.endDate
        ? { startDate: fy.startDate, endDate: fy.endDate }
        : fiscalPeriodBounds(fy?.fiscalStartMonth ?? 1);
    try {
      const existing = await accountingPeriodsApi.list();
      if (!existing.length) {
        await accountingPeriodsApi.openPeriod(bounds.startDate, bounds.endDate);
      }
    } catch {
      /* period may already exist */
    }
  }

  if (stepId === 'property_setup') {
    const ps = state.stepData.property_setup as Record<string, string> | undefined;
    if (!ps?.buildingName || !ps?.propertyName) return;
    const properties = _getPropertiesCount();
    if (properties > 0 && !ps.ownerName) return;

    let ownerId = '';
    if (ps.ownerName?.trim()) {
      if (!isLocalOnlyMode() && isAuthenticated) {
        const saved = await api.saveContact({
          name: ps.ownerName.trim(),
          type: ContactType.OWNER,
          contactNo: '',
        });
        ownerId = saved.id;
        dispatch({ type: 'ADD_CONTACT', payload: saved });
      } else {
        ownerId = `owner_${Date.now()}`;
        dispatch({
          type: 'ADD_CONTACT',
          payload: { id: ownerId, name: ps.ownerName.trim(), type: ContactType.OWNER, contactNo: '' },
        });
      }
    }

    let buildingId = '';
    if (!isLocalOnlyMode() && isAuthenticated) {
      const b = await api.saveBuilding({ name: ps.buildingName.trim(), description: '' });
      buildingId = b.id;
      dispatch({ type: 'ADD_BUILDING', payload: b });
    } else {
      buildingId = `bld_${Date.now()}`;
      dispatch({ type: 'ADD_BUILDING', payload: { id: buildingId, name: ps.buildingName.trim() } });
    }

    if (ownerId && buildingId) {
      if (!isLocalOnlyMode() && isAuthenticated) {
        const prop = await api.saveProperty({
          name: ps.propertyName.trim(),
          ownerId,
          buildingId,
          description: '',
          monthlyServiceCharge: 0,
        });
        dispatch({ type: 'ADD_PROPERTY', payload: prop });
      } else {
        dispatch({
          type: 'ADD_PROPERTY',
          payload: {
            id: `prop_${Date.now()}`,
            name: ps.propertyName.trim(),
            ownerId,
            buildingId,
            monthlyServiceCharge: 0,
          },
        });
      }
    }
  }

  if (stepId === 'user_setup') {
    const u = state.stepData.user_setup as Record<string, string> | undefined;
    if (!u?.username?.trim() || !u?.name?.trim() || !u?.password?.trim()) return;
    if (!isLocalOnlyMode() && isAuthenticated) {
      await apiClient.post('/users', {
        username: u.username.trim(),
        name: u.name.trim(),
        email: u.email?.trim() || undefined,
        password: u.password,
        role: u.role ?? 'Accounts',
      });
    }
  }

  if (stepId === 'first_transaction') {
    const tx = state.stepData.first_transaction as Record<string, string> | undefined;
    const amount = Number(tx?.amount);
    if (!amount || amount <= 0) return;
    const accounts = _getAccountsSnapshot();
    const cash = accounts.find((a) => a.name.toLowerCase().includes('cash')) ?? accounts[0];
    if (!cash) return;
    const today = new Date().toISOString().slice(0, 10);
    if (!isLocalOnlyMode() && isAuthenticated) {
      await api.saveTransaction({
        type: TransactionType.INCOME,
        amount,
        date: today,
        description: tx?.description ?? 'Opening balance',
        accountId: cash.id,
        categoryId: undefined,
      });
    } else {
      dispatch({
        type: 'ADD_TRANSACTION',
        payload: {
          id: `tx_${Date.now()}`,
          type: TransactionType.INCOME,
          amount,
          date: today,
          description: tx?.description ?? 'Opening balance',
          accountId: cash.id,
        },
      });
    }
  }
}

function _getPropertiesCount(): number {
  return _getAppState().properties.length;
}

function _getAccountsSnapshot() {
  return _getAppState().accounts;
}
