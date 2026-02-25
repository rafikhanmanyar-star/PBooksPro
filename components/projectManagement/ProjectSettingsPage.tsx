
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { getAppStateApiService } from '../../services/api/appStateApi';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS } from '../../constants';
import Card from '../ui/Card';
import { useNotification } from '../../context/NotificationContext';
import ProjectForm from '../ui/ProjectForm';
import UnitForm from '../settings/UnitForm';
import ContactForm from '../settings/ContactForm';
import Modal from '../ui/Modal';
import { ContactType } from '../../types';
import InstallmentConfigForm from '../settings/InstallmentConfigForm';
import { ImportType } from '../../services/importService';

const ProjectSettingsPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { isAuthenticated } = useAuth();
    const { showConfirm, showToast } = useNotification();
    const [activeCategory, setActiveCategory] = useState('projects');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Modal States
    const [editingItem, setEditingItem] = useState<{ type: string, item?: any } | null>(null);
    const [configProject, setConfigProject] = useState<any | null>(null); // For installment config

    const settingCategories = [
        { id: 'projects', label: 'Projects', icon: ICONS.archive },
        { id: 'units', label: 'Units', icon: ICONS.building },
        { id: 'clients', label: 'Clients', icon: ICONS.users },
    ];

    const filteredItems = useMemo(() => {
        const query = searchQuery.toLowerCase();
        switch (activeCategory) {
            case 'projects': return state.projects.filter(i => i.name.toLowerCase().includes(query));
            case 'units': return state.units.filter(i => i.name.toLowerCase().includes(query));
            case 'clients': return state.contacts.filter(i => i.type === ContactType.CLIENT && i.name.toLowerCase().includes(query));
            default: return [];
        }
    }, [activeCategory, searchQuery, state]);

    const handleAddNew = () => {
        setEditingItem({ type: activeCategory });
    };

    const handleEdit = (item: any) => {
        setEditingItem({ type: activeCategory, item });
    };

    const handleSubmit = (data: any) => {
        if (!editingItem) return;
        const isEdit = !!editingItem.item;
        const id = isEdit ? editingItem.item.id : Date.now().toString();
        const payload = { ...data, id };

        switch (editingItem.type) {
            case 'projects':
                dispatch({ type: isEdit ? 'UPDATE_PROJECT' : 'ADD_PROJECT', payload });
                break;
            case 'units':
                dispatch({ type: isEdit ? 'UPDATE_UNIT' : 'ADD_UNIT', payload });
                break;
            case 'clients':
                dispatch({ type: isEdit ? 'UPDATE_CONTACT' : 'ADD_CONTACT', payload: { ...payload, type: ContactType.CLIENT } });
                break;
        }
        setEditingItem(null);
    };

    const handleDelete = async () => {
        if (!editingItem?.item) return;
        const confirmed = await showConfirm('Are you sure you want to delete this item?');
        if (!confirmed) return;

        const itemId = editingItem.item.id;
        if (isAuthenticated && (editingItem.type === 'projects' || editingItem.type === 'units')) {
            try {
                const api = getAppStateApiService();
                if (editingItem.type === 'projects') await api.deleteProject(itemId);
                else if (editingItem.type === 'units') await api.deleteUnit(itemId);
            } catch (err: any) {
                if (err?.status !== 404) {
                    showToast(err?.message || err?.error || 'Could not delete from cloud.', 'error');
                    return;
                }
            }
        }
        if (isAuthenticated && editingItem.type === 'clients') {
            try {
                await getAppStateApiService().deleteContact(itemId);
            } catch (err: any) {
                if (err?.status !== 404) {
                    showToast(err?.message || err?.error || 'Could not delete from cloud.', 'error');
                    return;
                }
            }
        }

        switch (editingItem.type) {
            case 'projects': dispatch({ type: 'DELETE_PROJECT', payload: itemId }); break;
            case 'units': dispatch({ type: 'DELETE_UNIT', payload: itemId }); break;
            case 'clients': dispatch({ type: 'DELETE_CONTACT', payload: itemId }); break;
        }
        setEditingItem(null);
    };
    
    const handleConfigSave = (project: any) => {
        dispatch({ type: 'UPDATE_PROJECT', payload: project });
        setConfigProject(null);
    };

    const addLabel = `Add ${settingCategories.find(c => c.id === activeCategory)?.label.slice(0, -1)}`;

    return (
        <div className="flex flex-col md:flex-row h-full gap-6">
            {/* Sidebar */}
            <Card className="md:w-64 flex-shrink-0 p-2">
                <div className="space-y-1">
                    {settingCategories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => { setActiveCategory(cat.id); setSearchQuery(''); }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                activeCategory === cat.id ? 'bg-indigo-50 text-accent' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <div className="w-5 h-5 opacity-70">{cat.icon}</div>
                            {cat.label}
                        </button>
                    ))}
                </div>
            </Card>

            {/* Content */}
            <div className="flex-grow flex flex-col h-full">
                <div className="mb-4 flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-slate-800">{settingCategories.find(c => c.id === activeCategory)?.label}</h2>
                    <div className="flex gap-2">
                        <div className="relative">
                            <Input 
                                placeholder="Search..." 
                                value={searchQuery} 
                                onChange={(e) => setSearchQuery(e.target.value)} 
                                className="pr-8"
                            />
                             {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400">
                                    <div className="w-4 h-4">{ICONS.x}</div>
                                </button>
                            )}
                        </div>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                const importType =
                                    activeCategory === 'projects' ? ImportType.PROJECTS :
                                    activeCategory === 'units' ? ImportType.UNITS :
                                    ImportType.CONTACTS; // clients are a subset of Contacts
                                dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: importType });
                                dispatch({ type: 'SET_PAGE', payload: 'import' });
                            }}
                        >
                            <div className="w-4 h-4 sm:mr-2">{ICONS.download}</div>
                            <span className="hidden sm:inline">Bulk Import</span>
                        </Button>
                        <Button onClick={handleAddNew}>
                            <div className="w-4 h-4 sm:mr-2">{ICONS.plus}</div> <span className="hidden sm:inline">{addLabel}</span>
                        </Button>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden flex-grow overflow-y-auto">
                    <div className="divide-y divide-slate-100">
                        {filteredItems.map((item: any) => (
                            <div 
                                key={item.id} 
                                className="p-4 hover:bg-slate-50 flex justify-between items-center transition-colors group"
                            >
                                <div onClick={() => handleEdit(item)} className="flex-grow cursor-pointer">
                                    <span className="font-medium text-slate-700">{item.name}</span>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {activeCategory === 'projects' && (
                                        <Button size="sm" variant="secondary" onClick={() => setConfigProject(item)}>Config Plan</Button>
                                    )}
                                    <button onClick={() => handleEdit(item)} className="p-1 text-slate-400 hover:text-accent"><div className="w-4 h-4">{ICONS.edit}</div></button>
                                </div>
                            </div>
                        ))}
                        {filteredItems.length === 0 && <div className="p-8 text-center text-slate-500">No items found.</div>}
                    </div>
                </div>
            </div>

            <Modal isOpen={!!editingItem} onClose={() => setEditingItem(null)} title={`${editingItem?.item ? 'Edit' : 'Add'} ${activeCategory.slice(0, -1)}`}>
                {editingItem?.type === 'projects' && (
                    <ProjectForm 
                        onSubmit={handleSubmit} 
                        onCancel={() => setEditingItem(null)} 
                        onDelete={handleDelete}
                        projectToEdit={editingItem.item} 
                    />
                )}
                {editingItem?.type === 'units' && (
                    <UnitForm 
                        onSubmit={handleSubmit} 
                        onCancel={() => setEditingItem(null)} 
                        onDelete={handleDelete}
                        unitToEdit={editingItem.item} 
                    />
                )}
                {editingItem?.type === 'clients' && (
                    <ContactForm 
                        onSubmit={handleSubmit} 
                        onCancel={() => setEditingItem(null)} 
                        onDelete={handleDelete}
                        contactToEdit={editingItem.item}
                        existingContacts={state.contacts}
                        fixedTypeForNew={ContactType.CLIENT}
                    />
                )}
            </Modal>
            
            <Modal isOpen={!!configProject} onClose={() => setConfigProject(null)} title="Installment Plan Configuration">
                {configProject && (
                    <InstallmentConfigForm 
                        project={configProject} 
                        onSave={handleConfigSave} 
                        onCancel={() => setConfigProject(null)} 
                    />
                )}
            </Modal>
        </div>
    );
};

export default ProjectSettingsPage;
