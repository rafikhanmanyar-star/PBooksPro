
import React, { useState, useMemo, useEffect } from 'react';
import { Category, TransactionType, ProfitLossSubType } from '../../types';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import ComboBox from '../ui/ComboBox';
import { useAppContext } from '../../context/AppContext';

interface CategoryFormProps {
    onSubmit: (category: Omit<Category, 'id'>) => void;
    onCancel: () => void;
    onDelete?: () => void;
    categoryToEdit?: Category;
    fixedTypeForNew?: TransactionType.INCOME | TransactionType.EXPENSE;
    initialName?: string;
}

const CategoryForm: React.FC<CategoryFormProps> = ({ onSubmit, onCancel, onDelete, categoryToEdit, fixedTypeForNew, initialName }) => {
    const { state } = useAppContext();
    const [name, setName] = useState(categoryToEdit?.name || initialName || '');
    const [description, setDescription] = useState(categoryToEdit?.description || '');
    const [type, setType] = useState<TransactionType>(categoryToEdit?.type || fixedTypeForNew || TransactionType.EXPENSE);
    const [parentCategoryId, setParentCategoryId] = useState(categoryToEdit?.parentCategoryId || '');
    const [plSubType, setPlSubType] = useState<string>(categoryToEdit?.plSubType || '');

    const isEditing = !!categoryToEdit;
    const isPermanent = categoryToEdit?.isPermanent;
    const showTypeSelector = !isEditing && !fixedTypeForNew;
    /** System categories: only P&L classification may be changed (stored in pl_category_mapping). */
    const savedPlSub = categoryToEdit?.plSubType || '';
    const plSubDirty = plSubType !== savedPlSub;

    useEffect(() => {
        if (categoryToEdit && type !== categoryToEdit.type) {
            setParentCategoryId('');
        }
    }, [type, categoryToEdit]);

    useEffect(() => {
        setPlSubType(categoryToEdit?.plSubType || '');
    }, [categoryToEdit]);

    const availableParents = useMemo(() => {
        return state.categories.filter(cat => 
            cat.type === type && 
            cat.id !== categoryToEdit?.id &&
            !cat.parentCategoryId 
        );
    }, [state.categories, type, categoryToEdit]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isPermanent && categoryToEdit) {
            if (!plSubDirty) return;
            onSubmit({
                name: categoryToEdit.name,
                type: categoryToEdit.type,
                description: categoryToEdit.description,
                parentCategoryId: categoryToEdit.parentCategoryId,
                plSubType: plSubType.trim() ? (plSubType as ProfitLossSubType) : null,
            } as Omit<Category, 'id'>);
            return;
        }
        onSubmit({
            name,
            type,
            description,
            parentCategoryId: parentCategoryId || undefined,
            plSubType: plSubType.trim() ? (plSubType as ProfitLossSubType) : null,
        } as Omit<Category, 'id'>);
    };
    
    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {isPermanent && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg">
                    <p><strong>System category:</strong> Name, type, parent, and description are fixed. You can still set <strong>P&amp;L classification</strong> below for the Profit &amp; Loss report. This category cannot be deleted.</p>
                </div>
            )}
            <Input label="Category Name" value={name} onChange={e => setName(e.target.value)} required autoFocus disabled={isPermanent} />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {showTypeSelector ? (
                    <Select 
                        label="Type" 
                        value={type} 
                        onChange={e => {
                            setType(e.target.value as any);
                            setParentCategoryId('');
                        }} 
                        required
                    >
                        <option value={TransactionType.INCOME}>Income</option>
                        <option value={TransactionType.EXPENSE}>Expense</option>
                    </Select>
                ) : (
                    <Input label="Type" value={type} disabled />
                )}

                <ComboBox 
                    label="Parent Category (Optional)" 
                    items={availableParents} 
                    selectedId={parentCategoryId} 
                    onSelect={(item) => setParentCategoryId(item?.id || '')}
                    placeholder="Select main category..."
                    allowAddNew={false}
                    disabled={isPermanent}
                />
            </div>
            
            <Textarea label="Description (Optional)" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g., 'All utility bills like water, electricity'" disabled={isPermanent} />

            <Select
                label="P&L classification (IFRS / GAAP)"
                value={plSubType}
                onChange={(e) => setPlSubType(e.target.value)}
            >
                <option value="">Infer from category type (default)</option>
                <option value="revenue">Revenue</option>
                <option value="cost_of_sales">Cost of sales</option>
                <option value="operating_expense">Operating expense</option>
                <option value="other_income">Other income</option>
                <option value="finance_cost">Finance costs</option>
                <option value="tax">Tax</option>
            </Select>
            <p className="text-xs text-slate-500 -mt-2">
                Maps this category to a Profit &amp; Loss line. Leave as default to classify by Income vs Expense type.
            </p>

            <div className="flex justify-between items-center pt-4">
                <div>
                    {categoryToEdit && onDelete && (
                        <Button type="button" variant="danger" onClick={onDelete} disabled={isPermanent}>Delete</Button>
                    )}
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
                    <Button type="submit" disabled={!!isPermanent && !plSubDirty}>{categoryToEdit ? 'Update' : 'Save'} Category</Button>
                </div>
            </div>
        </form>
    );
};

export default CategoryForm;
