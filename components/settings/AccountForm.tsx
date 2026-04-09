
import React, { useState, useMemo, useEffect } from 'react';
import { Account, AccountType } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import Select from '../ui/Select';
import ComboBox from '../ui/ComboBox';
import { useAppContext } from '../../context/AppContext';

const SYSTEM_ACCOUNT_NAMES = new Set([
    'cash', 'accounts receivable', 'accounts payable', 'owner equity', 'internal clearing',
    'security liability', 'project received assets'
]);

function isBankLikeType(t: AccountType): boolean {
    return t === AccountType.BANK || t === AccountType.CASH;
}

interface AccountFormProps {
    onSubmit: (account: Omit<Account, 'id' | 'balance'> & { initialBalance?: number; openingBalance?: number }) => void;
    onCancel: () => void;
    onDelete?: () => void;
    accountToEdit?: Account;
    initialName?: string;
}

const AccountForm: React.FC<AccountFormProps> = ({ onSubmit, onCancel, onDelete, accountToEdit, initialName }) => {
    const { state } = useAppContext();
    const [name, setName] = useState(accountToEdit?.name || initialName || '');
    const [description, setDescription] = useState(accountToEdit?.description || '');
    const [type, setType] = useState<AccountType>(accountToEdit?.type || AccountType.BANK);
    const [parentAccountId, setParentAccountId] = useState(accountToEdit?.parentAccountId || '');

    const [openingAmount, setOpeningAmount] = useState(() => {
        if (!accountToEdit) return '0';
        if (isBankLikeType(accountToEdit.type)) return String(accountToEdit.openingBalance ?? 0);
        return '0';
    });
    const [nonBankInitial, setNonBankInitial] = useState(() =>
        accountToEdit && !isBankLikeType(accountToEdit.type) ? String(accountToEdit.balance) : '0'
    );

    const isPermanent = accountToEdit?.isPermanent;
    const bankLike = isBankLikeType(type);

    useEffect(() => {
        if (!accountToEdit) return;
        if (isBankLikeType(accountToEdit.type)) {
            setOpeningAmount(String(accountToEdit.openingBalance ?? 0));
        } else {
            setNonBankInitial(String(accountToEdit.balance));
        }
    }, [accountToEdit]);

    // Reset parent when type changes, as sub-account must match parent type
    useEffect(() => {
        if (accountToEdit && type !== accountToEdit.type) {
            setParentAccountId('');
        }
    }, [type, accountToEdit]);

    const availableParents = useMemo(() => {
        return state.accounts.filter(acc =>
            acc.type === type &&
            acc.id !== accountToEdit?.id && // Cannot be parent of itself
            !acc.parentAccountId // Ideally only 1 level deep for simplicity, but we can allow nesting. For now, filter to prevent circular if we implemented checks.
        );
    }, [state.accounts, type, accountToEdit]);

    const id = accountToEdit?.id ?? '';
    const isSystemAccountId = id.includes('sys-acc-');
    const isReservedName = !isSystemAccountId && SYSTEM_ACCOUNT_NAMES.has(name.toLowerCase().trim());

    const parseNum = (s: string) => {
        const n = parseFloat(s.trim());
        return Number.isFinite(n) ? n : 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isPermanent || isReservedName) return;
        if (bankLike) {
            onSubmit({
                name,
                description,
                type,
                parentAccountId: parentAccountId || undefined,
                openingBalance: parseNum(openingAmount),
            });
        } else {
            onSubmit({
                name,
                description,
                type,
                parentAccountId: parentAccountId || undefined,
                initialBalance: parseNum(nonBankInitial),
            });
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {isPermanent && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg">
                    <p><strong>Read-only:</strong> This is a system account and cannot be edited or deleted.</p>
                </div>
            )}
            <Input label="Account Name" value={name} onChange={e => setName(e.target.value)} required autoFocus disabled={isPermanent} />
            {isReservedName && (
                <p className="text-sm text-red-600 -mt-2">
                    "{name}" is a reserved system account name. Please use a different name.
                </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                    label="Account Type"
                    value={type}
                    onChange={e => {
                        setType(e.target.value as AccountType);
                        setParentAccountId(''); // Clear parent if type changes
                    }}
                    disabled={isPermanent}
                >
                    <option value={AccountType.BANK}>Bank / Cash / Credit Card</option>
                    <option value={AccountType.ASSET}>Fixed / Other Asset</option>
                    <option value={AccountType.LIABILITY}>Liability (Loans, A/P)</option>
                    <option value={AccountType.EQUITY}>Equity (Capital, Drawings, Investors)</option>
                </Select>

                <ComboBox
                    label="Parent Account (Optional)"
                    items={availableParents}
                    selectedId={parentAccountId}
                    onSelect={(item) => setParentAccountId(item?.id || '')}
                    placeholder="Select main account..."
                    allowAddNew={false}
                    disabled={isPermanent}
                />
            </div>

            <Textarea label="Description (Optional)" value={description} onChange={e => setDescription(e.target.value)} placeholder="Purpose, bank info, etc." disabled={isPermanent} />

            {bankLike ? (
                <>
                    <Input
                        label="Initial amount"
                        type="text"
                        inputMode="decimal"
                        value={openingAmount}
                        onChange={e => setOpeningAmount(e.target.value)}
                        disabled={isPermanent}
                        placeholder="Opening balance before transactions in this app (can be negative)"
                    />
                    {accountToEdit && (
                        <Input
                            label="Current balance"
                            type="text"
                            inputMode="decimal"
                            value={String(accountToEdit.balance ?? 0)}
                            onChange={() => {}}
                            disabled
                        />
                    )}
                </>
            ) : (
                <Input
                    label={accountToEdit ? 'Current balance' : 'Initial balance'}
                    type="text"
                    inputMode="decimal"
                    value={nonBankInitial}
                    onChange={e => setNonBankInitial(e.target.value)}
                    required={!accountToEdit}
                    disabled={!!accountToEdit || isPermanent}
                />
            )}

            <div className="flex justify-between items-center pt-4">
                <div>
                    {accountToEdit && onDelete && (
                        <Button type="button" variant="danger" onClick={onDelete} disabled={isPermanent}>Delete</Button>
                    )}
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
                    <Button type="submit" disabled={isPermanent || isReservedName}>{accountToEdit ? 'Update' : 'Save'} Account</Button>
                </div>
            </div>
        </form>
    );
};

export default AccountForm;
