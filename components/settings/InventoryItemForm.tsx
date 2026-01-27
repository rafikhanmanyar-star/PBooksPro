import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { InventoryItem, InventoryUnitType, TransactionType } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS, CURRENCY } from '../../constants';

interface InventoryItemFormProps {
  onSubmit: (data: Partial<InventoryItem>) => void;
  onCancel: () => void;
  onDelete?: () => void;
  initialData?: InventoryItem;
}

const InventoryItemForm: React.FC<InventoryItemFormProps> = ({ onSubmit, onCancel, onDelete, initialData }) => {
  const { state } = useAppContext();
  
  const [name, setName] = useState(initialData?.name || '');
  const [parentId, setParentId] = useState(initialData?.parentId || '');
  const [expenseCategoryId, setExpenseCategoryId] = useState(initialData?.expenseCategoryId || '');
  const [unitType, setUnitType] = useState<InventoryUnitType>(initialData?.unitType || InventoryUnitType.QUANTITY);
  const [pricePerUnit, setPricePerUnit] = useState(initialData?.pricePerUnit?.toString() || '0');
  const [description, setDescription] = useState(initialData?.description || '');

  // Get available parent items (exclude current item and its descendants if editing)
  const availableParents = state.inventoryItems.filter(item => {
    if (!initialData) return true; // All items available when creating new
    if (item.id === initialData.id) return false; // Can't be own parent
    
    // Check if item is a descendant of current item
    let currentParentId = item.parentId;
    while (currentParentId) {
      if (currentParentId === initialData.id) return false; // Is a descendant
      const parent = state.inventoryItems.find(i => i.id === currentParentId);
      currentParentId = parent?.parentId;
    }
    
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Get available expense categories (only EXPENSE type)
  const expenseCategories = state.categories
    .filter(cat => cat.type === TransactionType.EXPENSE)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Debug logging
  useEffect(() => {
    console.log('📊 Inventory Form - Total categories:', state.categories.length);
    console.log('📊 Inventory Form - Expense categories:', expenseCategories.length);
    console.log('📊 Inventory Form - Sample category types:', 
      state.categories.slice(0, 3).map(c => ({ name: c.name, type: c.type }))
    );
  }, [state.categories, expenseCategories]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      alert('Please enter an inventory item name');
      return;
    }

    const price = parseFloat(pricePerUnit) || 0;
    if (price < 0) {
      alert('Price per unit cannot be negative');
      return;
    }

    onSubmit({
      name: name.trim(),
      parentId: parentId || undefined,
      expenseCategoryId: expenseCategoryId || undefined,
      unitType,
      pricePerUnit: price,
      description: description.trim() || undefined,
    });
  };

  const unitTypeLabels: Record<InventoryUnitType, string> = {
    [InventoryUnitType.LENGTH_FEET]: 'Length in Feet',
    [InventoryUnitType.AREA_SQFT]: 'Area in Square Feet',
    [InventoryUnitType.VOLUME_CUFT]: 'Volume in Cubic Feet',
    [InventoryUnitType.QUANTITY]: 'Quantity',
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Inventory Name */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Inventory Name *
        </label>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter inventory item name"
          required
        />
      </div>

      {/* Parent Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Parent Item
          <span className="text-slate-500 font-normal ml-2">(Optional - select to create a child item)</span>
        </label>
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
        >
          <option value="">No Parent (Top Level)</option>
          {availableParents.map(item => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {parentId && (
          <p className="mt-1 text-xs text-slate-500">
            This item will be a child of: {state.inventoryItems.find(i => i.id === parentId)?.name}
          </p>
        )}
      </div>

      {/* Expense Category Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Expense Category
          <span className="text-slate-500 font-normal ml-2">(Optional - for purchase tracking in My Shop)</span>
        </label>
        <select
          value={expenseCategoryId}
          onChange={(e) => setExpenseCategoryId(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
        >
          <option value="">No Category</option>
          {expenseCategories.map(category => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {expenseCategoryId && (
          <p className="mt-1 text-xs text-slate-500">
            Purchases will be recorded under: {state.categories.find(c => c.id === expenseCategoryId)?.name}
          </p>
        )}
      </div>

      {/* Unit Type */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">
          Unit Type *
        </label>
        <div className="space-y-2">
          {Object.values(InventoryUnitType).map(type => (
            <label key={type} className="flex items-center space-x-3 cursor-pointer group">
              <input
                type="radio"
                name="unitType"
                value={type}
                checked={unitType === type}
                onChange={(e) => setUnitType(e.target.value as InventoryUnitType)}
                className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-700 group-hover:text-indigo-600 transition-colors">
                {unitTypeLabels[type]}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Price Per Unit */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Price per Unit ({CURRENCY}) *
        </label>
        <Input
          type="number"
          value={pricePerUnit}
          onChange={(e) => setPricePerUnit(e.target.value)}
          placeholder="0.00"
          step="0.01"
          min="0"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Description
          <span className="text-slate-500 font-normal ml-2">(Optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter a description for this inventory item"
          rows={3}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
        />
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <div>
          {initialData && onDelete && (
            <Button
              type="button"
              variant="secondary"
              onClick={onDelete}
              className="bg-rose-50 text-rose-600 hover:bg-rose-100 border-rose-200"
            >
              <span className="w-4 h-4 mr-2">{ICONS.trash}</span>
              Delete
            </Button>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="submit">
            {initialData ? 'Update Item' : 'Create Item'}
          </Button>
        </div>
      </div>
    </form>
  );
};

export default InventoryItemForm;
