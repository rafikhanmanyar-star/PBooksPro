
import React, { useState, useEffect } from 'react';
import { Contact, ContactType } from '../../types';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';

interface ContactFormProps {
  onSubmit: (contact: Omit<Contact, 'id'>) => void;
  onCancel: () => void;
  onDelete?: () => void;
  contactToEdit?: Contact;
  fixedTypeForNew?: ContactType;
  allowedTypesForNew?: ContactType[];
  existingContacts: Contact[];
  initialName?: string;
  hideCancelButton?: boolean;
}

const ContactForm: React.FC<ContactFormProps> = ({ onSubmit, onCancel, onDelete, contactToEdit, fixedTypeForNew, allowedTypesForNew, existingContacts, initialName, hideCancelButton = false }) => {
  const [name, setName] = useState(contactToEdit?.name || initialName || '');
  const [description, setDescription] = useState(contactToEdit?.description || '');
  const [nameError, setNameError] = useState('');

  // New state for vendor-specific fields
  const [companyName, setCompanyName] = useState(contactToEdit?.companyName || '');
  const [contactNo, setContactNo] = useState(contactToEdit?.contactNo || '');
  const [address, setAddress] = useState(contactToEdit?.address || '');

  const isEditing = !!contactToEdit;
  
  const availableTypes = allowedTypesForNew || Object.values(ContactType);
  const [type, setType] = useState<ContactType>(contactToEdit?.type || fixedTypeForNew || availableTypes[0]);

  // Can the user select a type? Only when creating a new contact AND the type is not fixed.
  const showTypeSelector = !isEditing && !fixedTypeForNew && availableTypes.length > 1;

  useEffect(() => {
    if (!name.trim()) {
      setNameError('Name is required.');
      return;
    }
    const duplicate = existingContacts.find(c => c.name.toLowerCase() === name.trim().toLowerCase() && c.id !== contactToEdit?.id);
    if (duplicate) {
      setNameError('A contact with this name already exists.');
    } else {
      setNameError('');
    }
  }, [name, existingContacts, contactToEdit]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameError) return;
    onSubmit({ name: name.trim(), type, description, companyName, contactNo, address });
  };

  // Treat Broker and Dealer similarly for layout purposes
  const isBusinessContact = type === ContactType.VENDOR || type === ContactType.BROKER || type === ContactType.DEALER;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={!isBusinessContact ? 'md:col-span-2' : ''}>
          <Input
            id="contact-name"
            name="contact-name"
            label="Contact Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            autoComplete="name"
          />
          {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
        </div>

        {isBusinessContact && (
            <Input
              id="company-name"
              name="company-name"
              label="Company Name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. ACME Corp"
              autoComplete="organization"
            />
        )}
        
        <Input
          id="contact-no"
          name="contact-no"
          label="Contact No."
          value={contactNo}
          onChange={(e) => setContactNo(e.target.value)}
          placeholder="e.g. 555-123-4567"
          autoComplete="tel"
        />
        
        <div>
            {showTypeSelector ? (
            <Select
                id="contact-type"
                name="contact-type"
                label="Contact Type"
                value={type}
                onChange={(e) => setType(e.target.value as ContactType)}
                required
            >
                {availableTypes.map((contactType) => (
                <option key={contactType} value={contactType}>
                    {contactType}
                </option>
                ))}
            </Select>
            ) : (
            <Input
                id="contact-type"
                name="contact-type"
                label="Contact Type"
                value={type}
                disabled
                />
            )}
        </div>
     
        {isBusinessContact && (
            <div className="md:col-span-2">
                 <Textarea
                    id="address"
                    name="address"
                    label="Address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Full mailing address"
                    rows={2}
                    autoComplete="street-address"
                />
            </div>
        )}
        
        <div className="md:col-span-2">
            <Textarea
                id="description"
                name="description"
                label="Description (Optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contact info, notes, etc."
                rows={2}
            />
        </div>
      </div>

      <div className="flex justify-between items-center pt-2">
          <div>
            {contactToEdit && onDelete && (
              <Button type="button" variant="danger" onClick={onDelete}>
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {!hideCancelButton && 
              <Button type="button" variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
            }
            <Button type="submit" disabled={!!nameError}>{contactToEdit ? 'Update' : 'Save'} Contact</Button>
          </div>
      </div>
    </form>
  );
};

export default ContactForm;
