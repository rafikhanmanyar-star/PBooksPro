
import React, { useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, ContactType } from '../../types';
import { ICONS } from '../../constants';
import AccountForm from './AccountForm';
import ContactForm from './ContactForm';
import ProjectForm from '../ui/ProjectForm';
import CategoryForm from './CategoryForm';
import BuildingForm from './BuildingForm';
import PropertyForm from './PropertyForm';
import UnitForm from './UnitForm';
import { useNotification } from '../../context/NotificationContext';

interface SettingsDetailPageProps {
  goBack: () => void;
}

const SettingsDetailPage: React.FC<SettingsDetailPageProps> = ({ goBack: propGoBack }) => {
    const { state, dispatch } = useAppContext();
    const { showConfirm } = useNotification();
    const { editingEntity } = state;

    const goBack = () => {
        dispatch({ type: 'CLEAR_EDITING_ENTITY' });
        propGoBack();
    };

    useEffect(() => {
        if (!editingEntity) {
            propGoBack();
        }
    }, [editingEntity, propGoBack]);

    if (!editingEntity) {
        return null;
    }

    const { type, id } = editingEntity;
    const isEditing = !!id;
    const [entityType, subType] = type.split('_');

    const itemToEdit = useMemo(() => {
        if (!isEditing || !id || !entityType) return undefined;
        
        let stateArray: any[] | undefined;
        switch(entityType) {
            case 'ACCOUNT': stateArray = state.accounts; break;
            case 'CONTACT': stateArray = state.contacts; break;
            case 'PROJECT': stateArray = state.projects; break;
            case 'BUILDING': stateArray = state.buildings; break;
            case 'PROPERTY': stateArray = state.properties; break;
            case 'UNIT': stateArray = state.units; break;
            case 'CATEGORY': stateArray = state.categories; break;
            default: return undefined;
        }
        return stateArray.find(item => item.id === id);
    }, [isEditing, id, entityType, state]);

    const handleFormSubmit = (data: any) => {
        if (!entityType) return;
        const actionType = isEditing ? `UPDATE_${entityType}` : `ADD_${entityType}`;
        const payload = isEditing ? { ...itemToEdit, ...data } : { id: Date.now().toString(), ...data };
        
        if (entityType === 'ACCOUNT' && !isEditing) {
             payload.balance = data.initialBalance || 0;
             delete payload.initialBalance;
        }

        dispatch({ type: actionType as any, payload });
        goBack();
    };

    const handleDelete = async () => {
        if (!isEditing || !itemToEdit || !entityType) return;

        const messageMap: { [key: string]: string } = {
            'ACCOUNT': `Are you sure you want to delete account "${itemToEdit.name}"? This may affect existing transactions.`,
            'DEFAULT': `Are you sure you want to delete "${itemToEdit.name}"? This cannot be undone.`
        };
        
        const message = messageMap[entityType] || messageMap['DEFAULT'].replace('"{itemToEdit.name}"', `this item`);

        const confirmed = await showConfirm(message, { title: 'Confirm Deletion', confirmLabel: 'Delete', cancelLabel: 'Cancel' });
        if (confirmed) {
            dispatch({ type: `DELETE_${entityType}` as any, payload: id });
            goBack();
        }
    };
    
    const getTitle = () => {
        if (!editingEntity) return '';
        const action = isEditing ? 'Edit' : 'Add New';
        let entityName = entityType ? entityType.charAt(0) + entityType.slice(1).toLowerCase() : '';
        
        if(entityType === "CONTACT" && subType) {
            entityName = subType.charAt(0) + subType.slice(1).toLowerCase();
        } else if (entityType === "CATEGORY" && subType) {
            entityName = `${subType.charAt(0) + subType.slice(1).toLowerCase()} Category`;
        }

        return `${action} ${entityName}`;
    };

    const renderForm = () => {
        if (!entityType) return null;

        switch (entityType) {
            case 'ACCOUNT':
                return <AccountForm onCancel={goBack} onSubmit={handleFormSubmit} accountToEdit={itemToEdit} onDelete={handleDelete} />;
            case 'CONTACT':
                const contactTypeMap = {
                    'OWNER': ContactType.OWNER,
                    'TENANT': ContactType.TENANT,
                    'CLIENT': ContactType.CLIENT,
                    'BROKER': ContactType.BROKER,
                    'FRIEND': ContactType.FRIEND_FAMILY,
                };
                return <ContactForm onCancel={goBack} onSubmit={handleFormSubmit} contactToEdit={itemToEdit} onDelete={handleDelete} existingContacts={state.contacts} fixedTypeForNew={contactTypeMap[subType as keyof typeof contactTypeMap]} />;
            case 'PROJECT':
                return <ProjectForm onCancel={goBack} onSubmit={handleFormSubmit} projectToEdit={itemToEdit} onDelete={handleDelete} />;
            case 'BUILDING':
                 return <BuildingForm onCancel={goBack} onSubmit={handleFormSubmit} buildingToEdit={itemToEdit} onDelete={handleDelete} />;
            case 'PROPERTY':
                return <PropertyForm onCancel={goBack} onSubmit={handleFormSubmit} propertyToEdit={itemToEdit} onDelete={handleDelete} contacts={state.contacts} buildings={state.buildings} properties={state.properties} />;
            case 'UNIT':
                return <UnitForm onCancel={goBack} onSubmit={handleFormSubmit} unitToEdit={itemToEdit} onDelete={handleDelete} />;
            case 'CATEGORY':
                const categoryTypeMap: { [key: string]: TransactionType.INCOME | TransactionType.EXPENSE } = {
                    'INCOME': TransactionType.INCOME,
                    'EXPENSE': TransactionType.EXPENSE,
                };
                return <CategoryForm onCancel={goBack} onSubmit={handleFormSubmit} categoryToEdit={itemToEdit} onDelete={handleDelete} fixedTypeForNew={categoryTypeMap[subType as keyof typeof categoryTypeMap]} />;
            default:
                return <p>Unknown setting type.</p>;
        }
    };

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex items-center gap-2 mb-4 flex-shrink-0">
                <button onClick={goBack} className="p-1 rounded-full hover:bg-slate-100 text-slate-600 transition-colors" aria-label="Go back">
                    <div className="w-6 h-6">{ICONS.chevronLeft}</div>
                </button>
                <h2 className="text-2xl font-bold">{getTitle()}</h2>
            </div>
            <div className="bg-white rounded-lg shadow-lg border border-slate-200/80 p-6 md:p-8 w-full max-w-4xl mx-auto">
                {renderForm()}
            </div>
        </div>
    );
};

export default SettingsDetailPage;
