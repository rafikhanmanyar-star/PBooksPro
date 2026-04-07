import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import {
  PersonalCategory,
  getPersonalIncomeCategories,
  getPersonalExpenseCategories,
  setPersonalIncomeCategories,
  setPersonalExpenseCategories,
  replacePersonalCategoriesApi,
} from './personalCategoriesService';
import { ICONS } from '../../constants';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { useAppContext } from '../../context/AppContext';

type CategoryType = 'Income' | 'Expense';

interface PersonalCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: CategoryType;
}

function generateId(prefix: string, name: string): string {
  const slug = name.trim().replace(/\s+/g, '-').toLowerCase() || 'item';
  return `${prefix}-${Date.now()}-${slug}`;
}

const PersonalCategoriesModal: React.FC<PersonalCategoriesModalProps> = ({ isOpen, onClose, type }) => {
  const { state } = useAppContext();
  const isIncome = type === 'Income';
  const [categories, setCategories] = useState<PersonalCategory[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');

  const load = useCallback(() => {
    setCategories(isIncome ? getPersonalIncomeCategories() : getPersonalExpenseCategories());
  }, [isIncome, state.personalCategories]);

  useEffect(() => {
    if (isOpen) {
      load();
      setEditingId(null);
      setEditName('');
      setNewName('');
    }
  }, [isOpen, load]);

  const save = useCallback(
    async (updated: PersonalCategory[]) => {
      setCategories(updated);
      if (isLocalOnlyMode()) {
        if (isIncome) {
          setPersonalIncomeCategories(updated);
        } else {
          setPersonalExpenseCategories(updated);
        }
      } else {
        try {
          await replacePersonalCategoriesApi(type, updated);
        } catch {
          load();
        }
      }
    },
    [isIncome, type, load]
  );

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    const prefix = isIncome ? 'personal-inc' : 'personal-exp';
    const newCat: PersonalCategory = { id: generateId(prefix, name), name };
    await save([...categories, newCat]);
    setNewName('');
  };

  const handleStartEdit = (cat: PersonalCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
  };

  const handleSaveEdit = async () => {
    if (editingId === null) return;
    const name = editName.trim();
    if (!name) return;
    const updated = categories.map((c) => (c.id === editingId ? { ...c, name } : c));
    await save(updated);
    setEditingId(null);
    setEditName('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleDelete = async (cat: PersonalCategory) => {
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    await save(categories.filter((c) => c.id !== cat.id));
    if (editingId === cat.id) {
      setEditingId(null);
      setEditName('');
    }
  };

  const title = isIncome ? 'Income categories' : 'Expense categories';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          These categories are used only for Personal transactions and are separate from the main app categories.
        </p>

        {/* Add new */}
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`New ${type.toLowerCase()} category`}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="flex-1"
          />
          <Button onClick={handleAdd} disabled={!newName.trim()}>
            Add
          </Button>
        </div>

        {/* List */}
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-64 overflow-y-auto">
          {categories.length === 0 ? (
            <div className="py-6 text-center text-gray-500 text-sm">No categories yet. Add one above.</div>
          ) : (
            categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 group"
              >
                {editingId === cat.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      className="flex-1"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                      title="Save"
                    >
                      {React.cloneElement(ICONS.check as React.ReactElement, { width: 18, height: 18 })}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                      title="Cancel"
                    >
                      {React.cloneElement(ICONS.x as React.ReactElement, { width: 18, height: 18 })}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-gray-900">{cat.name}</span>
                    <button
                      type="button"
                      onClick={() => handleStartEdit(cat)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Edit"
                    >
                      {React.cloneElement(ICONS.edit as React.ReactElement, { width: 16, height: 16 })}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(cat)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete"
                    >
                      {React.cloneElement(ICONS.trash as React.ReactElement, { width: 16, height: 16 })}
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};

export default PersonalCategoriesModal;
