/**
 * WhatsApp Context
 * 
 * Provides global WhatsApp chat window management
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Contact } from '../types';
import WhatsAppChatWindow from '../components/whatsapp/WhatsAppChatWindow';

interface WhatsAppContextType {
  openChat: (contact?: Contact | null, phoneNumber?: string) => void;
  closeChat: () => void;
  isOpen: boolean;
}

const WhatsAppContext = createContext<WhatsAppContextType | undefined>(undefined);

export const WhatsAppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string>('');

  const openChat = useCallback((contact?: Contact | null, phoneNumber?: string) => {
    setContact(contact || null);
    setPhoneNumber(phoneNumber || '');
    setIsOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setIsOpen(false);
    // Clear after animation
    setTimeout(() => {
      setContact(null);
      setPhoneNumber('');
    }, 300);
  }, []);

  return (
    <WhatsAppContext.Provider value={{ openChat, closeChat, isOpen }}>
      {children}
      <WhatsAppChatWindow
        isOpen={isOpen}
        onClose={closeChat}
        contact={contact}
        phoneNumber={phoneNumber}
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
