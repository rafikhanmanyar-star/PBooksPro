
import React, { useState, useEffect } from 'react';
import { Contact, ContactType, Vendor } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import LoadingButton from '../ui/LoadingButton';
import Textarea from '../ui/Textarea';
import { useNotification } from '../../context/NotificationContext';
import { ICONS } from '../../constants';

interface ContactFormProps {
  onSubmit: (contact: Omit<Contact, 'id'> | Omit<Vendor, 'id'>) => void | Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  contactToEdit?: Contact;
  vendorToEdit?: Vendor;
  isVendorForm?: boolean;
  fixedTypeForNew?: ContactType;
  allowedTypesForNew?: ContactType[];
  existingContacts?: Contact[];
  existingVendors?: Vendor[];
  initialName?: string;
  hideCancelButton?: boolean;
  /** Notifies parent when internal submit lock changes (for modal preventCloseWhile). */
  onSubmittingChange?: (submitting: boolean) => void;
}

const ContactForm: React.FC<ContactFormProps> = ({
  onSubmit,
  onCancel,
  onDelete,
  contactToEdit,
  vendorToEdit,
  isVendorForm = false,
  fixedTypeForNew,
  allowedTypesForNew,
  existingContacts = [],
  existingVendors = [],
  initialName,
  hideCancelButton = false,
  onSubmittingChange,
}) => {
  const { showAlert } = useNotification();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const entityToEdit = vendorToEdit || contactToEdit;

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);
  const [name, setName] = useState(entityToEdit?.name || initialName || '');
  const [description, setDescription] = useState(entityToEdit?.description || '');
  const [isActive, setIsActive] = useState(entityToEdit?.isActive !== false); // Default to true

  // Vendor/Business specific fields
  const [companyName, setCompanyName] = useState(entityToEdit?.companyName || '');
  const [contactNo, setContactNo] = useState(entityToEdit?.contactNo || '');
  const [address, setAddress] = useState(entityToEdit?.address || '');

  const isEditing = !!entityToEdit;

  const availableTypes = allowedTypesForNew || Object.values(ContactType);
  const [type, setType] = useState<ContactType>(contactToEdit?.type || fixedTypeForNew || availableTypes[0]);

  // If fixedTypeForNew changes prop, update state (rare but possible)
  useEffect(() => {
    if (!entityToEdit && fixedTypeForNew) {
      setType(fixedTypeForNew);
    }
  }, [fixedTypeForNew, entityToEdit]);

  const showTypeSelector = !isEditing && !fixedTypeForNew && availableTypes.length > 1;

  const isDuplicateName = (newName: string): boolean => {
    if (!newName || !newName.trim()) return false;
    const normalize = (n: string) => String(n).trim().replace(/\s+/g, ' ').toLowerCase();
    const normalizedNew = normalize(newName);

    if (isVendorForm) {
      return existingVendors.some(v => {
        if (vendorToEdit && v.id === vendorToEdit.id) return false;
        return normalize(v.name) === normalizedNew;
      });
    }

    return existingContacts.some(c => {
      if (contactToEdit && c.id === contactToEdit.id) return false;
      return normalize(c.name) === normalizedNew;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      await showAlert('Contact name is required.');
      return;
    }

    if (isDuplicateName(trimmedName)) {
      await showAlert(
        `Duplicate Name\n\n` +
        `A ${isVendorForm ? 'vendor' : 'contact'} with the name "${trimmedName}" already exists.\n` +
        `Names must be unique. Please use a different name or edit the existing entry.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (isVendorForm) {
        await Promise.resolve(
          onSubmit({ name: trimmedName, description, companyName, contactNo, address, isActive } as any)
        );
      } else {
        await Promise.resolve(
          onSubmit({ name: trimmedName, type, description, companyName, contactNo, address, isActive } as any)
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBusinessContact = isVendorForm || type === ContactType.BROKER || type === ContactType.DEALER;
  const isLeadContact = !isVendorForm && type === ContactType.LEAD;

  // Icons
  const UserIcon = <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
  const TruckIcon = <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>;
  const UserCheckIcon = <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><polyline points="16 11 18 13 22 9"></polyline></svg>;

  // Type Icons mapping
  const getTypeIcon = (t: ContactType) => {
    switch (t) {
      case ContactType.OWNER: return <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><div className="w-5 h-5">{ICONS.briefcase}</div></div>;
      case ContactType.TENANT: return <div className="p-2 bg-emerald-100 text-ds-success rounded-lg"><div className="w-5 h-5">{ICONS.users}</div></div>;
      case ContactType.BROKER:
      case ContactType.DEALER: return <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><div className="w-5 h-5">{UserCheckIcon}</div></div>;
      case ContactType.LEAD: return <div className="p-2 bg-amber-100 text-ds-warning rounded-lg"><div className="w-5 h-5">{ICONS.target || ICONS.users}</div></div>;
      default: return <div className="p-2 bg-app-surface-2 text-app-muted rounded-lg"><div className="w-5 h-5">{UserIcon}</div></div>;
    }
  };

  const vendorIcon = <div className="p-2 bg-orange-100 text-orange-600 rounded-lg"><div className="w-5 h-5">{TruckIcon}</div></div>;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0 animate-in fade-in zoom-in-95 duration-300">

      {/* Header Section */}
      <div className="flex-shrink-0 mb-4 sm:mb-6 text-center md:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-app-surface-2 border border-app-border text-xs font-semibold text-app-muted mb-2 sm:mb-3 uppercase tracking-wider">
          {isEditing ? 'Editing Profile' : 'New Entry'}
        </div>
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-app-text tracking-tight mb-1 sm:mb-2">
          {isEditing ? `Edit ${isVendorForm ? 'Vendor' : 'Contact'}` : `Add New ${isVendorForm ? 'Vendor' : 'Contact'}`}
        </h2>
        <p className="text-sm sm:text-base text-app-muted">
          {isEditing ? `Update ${isVendorForm ? 'vendor' : 'contact'} details and preferences below.` : `Create a new ${isVendorForm ? 'vendor' : 'contact'} profile to manage transactions and communications.`}
        </p>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-grow min-h-0 overflow-y-auto -mx-1 px-1">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">

          {/* LEFT COLUMN: Identity & Type */}
          <div className="lg:col-span-1 space-y-4 sm:space-y-6">
            <div className="bg-app-card p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-app-border shadow-ds-card">
              <h3 className="text-sm font-bold text-app-text uppercase tracking-wide mb-4 flex items-center gap-2">
                Identity
              </h3>

              {/* Type Selector Pilled */}
              {showTypeSelector && !isVendorForm ? (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-app-muted uppercase">Contact Type</label>
                  <div className="flex flex-col gap-2">
                    {availableTypes.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setType(t)}
                        className={`
                                          flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 text-left relative
                                          ${type === t
                            ? 'bg-app-highlight border-ds-primary/30 shadow-ds-card ring-1 ring-ds-primary/20'
                            : 'bg-app-card border-app-border hover:border-ds-primary/40 hover:bg-app-bg'
                          }
                                      `}
                      >
                        {getTypeIcon(t)}
                        <div>
                          <div className={`font-bold ${type === t ? 'text-app-text' : 'text-app-text'}`}>{t}</div>
                          <div className="text-xs text-app-muted opacity-80">
                            {t === ContactType.OWNER && 'Property owner'}
                            {t === ContactType.TENANT && 'Rents property'}
                            {(t === ContactType.BROKER || t === ContactType.DEALER) && 'Intermediary'}
                            {t === ContactType.FRIEND_FAMILY && 'Personal (Loan)'}
                            {t === ContactType.CLIENT && 'Customer'}
                            {t === ContactType.LEAD && 'Marketing prospect'}
                          </div>
                        </div>
                        {type === t && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-ds-primary">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 p-4 bg-app-bg rounded-xl border border-app-border">
                  {isVendorForm ? vendorIcon : getTypeIcon(type)}
                  <div>
                    <div className="text-xs text-app-muted uppercase font-bold">{isVendorForm ? 'Vendor' : 'Contact Type'}</div>
                    <div className="font-bold text-app-text text-lg">{isVendorForm ? 'Vendor/Supplier' : type}</div>
                  </div>
                </div>
              )}

              {/* Account Status Card */}
              {isEditing && (
                <div className={`mt-4 p-4 rounded-xl border transition-all duration-300 ${isActive ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-app-muted">Account Status</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${isActive ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                      {isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </div>
                  <p className="text-xs text-app-muted leading-relaxed">
                    {isActive
                      ? `This ${isVendorForm ? 'vendor' : 'contact'} is visible in all forms and searches.`
                      : `This ${isVendorForm ? 'vendor' : 'contact'} is hidden from selection menus and inactive.`}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Details Form */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <div className="bg-app-card p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-app-border shadow-ds-card relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-ds-primary to-purple-500"></div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
                <div className="sm:col-span-2">
                  <Input
                    id="contact-name"
                    name="contact-name"
                    label="Full Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                    placeholder="e.g. John Doe"
                    className="text-lg font-medium placeholder:font-normal"
                  />
                </div>

                {(isBusinessContact || isLeadContact) && (
                  <div className="sm:col-span-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <Input
                      id="company-name"
                      name="company-name"
                      label={isLeadContact ? "Company / Organization" : "Company Name"}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder={isLeadContact ? "e.g. ABC Company (optional)" : "e.g. Acme Corp"}
                      icon={<div className="text-app-muted w-4 h-4"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l8-4 8 4v14" /><path d="M17 21v-8.85a3.024 3.024 0 0 0-2.95-3.003L9.05 9.15a3.024 3.024 0 0 0-2.95 3.004V21M9 13v1m0 4v1m6-6v1m0 4v1" /></svg></div>}
                    />
                  </div>
                )}

                <div className="sm:col-span-1">
                  <Input
                    id="contact-no"
                    name="contact-no"
                    label="Phone Number"
                    value={contactNo}
                    onChange={(e) => setContactNo(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    icon={<div className="text-app-muted w-4 h-4"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg></div>}
                  />
                </div>
              </div>

              {(isBusinessContact || isLeadContact) && (
                <div className="mb-4 sm:mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  <Textarea
                    id="address"
                    name="address"
                    label={isLeadContact ? "Address" : "Business Address"}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Main St, Suite 100, City, State"
                    rows={2}
                  />
                </div>
              )}

              <div>
                <Textarea
                  id="description"
                  name="description"
                  label="Notes / Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add any additional context about this contact..."
                  rows={2}
                  className="bg-app-bg/50"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Footer with Actions */}
      <div className="flex-shrink-0 mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-app-border flex flex-col-reverse sm:flex-row justify-between items-center gap-3 sm:gap-4">
        <div className="flex gap-2">
          {isEditing && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsActive(!isActive)}
              className={`border-2 ${isActive ? 'border-rose-200 text-ds-danger hover:bg-rose-50' : 'border-emerald-200 text-ds-success hover:bg-emerald-50'}`}
            >
              <div className="flex items-center gap-2">
                <span className="w-4 h-4">{isActive ? ICONS.x : ICONS.check}</span>
                {isActive ? 'Deactivate' : 'Reactivate'}
              </div>
            </Button>
          )}
          {contactToEdit && onDelete && (
            <Button type="button" variant="danger" onClick={onDelete} className="text-ds-danger bg-rose-50 hover:bg-rose-100 border-rose-200 w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></span>
                Delete {isVendorForm ? 'Vendor' : 'Contact'}
              </div>
            </Button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          {!hideCancelButton &&
            <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting} className="flex-1 sm:flex-none justify-center w-full sm:w-auto">
              Cancel
            </Button>
          }
          <LoadingButton
            type="submit"
            loading={isSubmitting}
            loadingText={isEditing ? 'Saving...' : 'Creating...'}
            className="flex-1 sm:flex-none justify-center w-full sm:w-auto bg-ds-primary hover:bg-ds-primary-hover text-white shadow-lg shadow-ds-primary/20 border-0"
          >
            {isEditing ? 'Save Changes' : (isVendorForm ? 'Create Vendor' : 'Create Contact')}
          </LoadingButton>
        </div>
      </div>
    </form>
  );
};

export default ContactForm;
