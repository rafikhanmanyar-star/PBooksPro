/**
 * WhatsApp Context
 * 
 * Provides global WhatsApp chat side panel management
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Contact, Vendor } from '../types';
import WhatsAppSidePanel from '../components/whatsapp/WhatsAppSidePanel';

interface WhatsAppContextType {
  openChat: (contact?: Contact | Vendor | null, phoneNumber?: string, initialMessage?: string) => void;
  closeChat: () => void;
  isOpen: boolean;
}

const WhatsAppContext = createContext<WhatsAppContextType | undefined>(undefined);

export const WhatsAppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [contact, setContact] = useState<Contact | Vendor | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [initialMessage, setInitialMessage] = useState<string>('');

  const openChat = useCallback((contact?: Contact | Vendor | null, phoneNumber?: string, initialMessage?: string) => {
    setContact(contact || null);
    setPhoneNumber(phoneNumber || '');
    setInitialMessage(initialMessage || '');
    setIsOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setIsOpen(false);
    // Clear after animation
    setTimeout(() => {
      setContact(null);
      setPhoneNumber('');
      setInitialMessage('');
    }, 300);
  }, []);

  return (
    <WhatsAppContext.Provider value={{ openChat, closeChat, isOpen }}>
      {children}
      <WhatsAppSidePanel
        isOpen={isOpen}
        onClose={closeChat}
        contact={contact}
        phoneNumber={phoneNumber}
        initialMessage={initialMessage}
      />
    </WhatsAppContext.Provider>
  );
};

export const useWhatsApp = () => {
  const context = useContext(WhatsAppContext);
  if (!context) {
    throw new Error('useWhatsApp must be used within WhatsAppProvider');
  }
  return context;
};
