import React, { createContext, useState, useContext, ReactNode, RefObject } from 'react';

type KeyboardType = 'decimal' | 'numeric';

interface KeyboardContextType {
  isOpen: boolean;
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement> | null;
  keyboardType: KeyboardType;
  openKeyboard: (ref: RefObject<HTMLInputElement | HTMLTextAreaElement>, type: KeyboardType) => void;
  closeKeyboard: () => void;
  onKeyPress: (key: string) => void;
}

const KeyboardContext = createContext<KeyboardContextType | undefined>(undefined);

export const KeyboardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputRef, setInputRef] = useState<RefObject<HTMLInputElement | HTMLTextAreaElement> | null>(null);
  const [keyboardType, setKeyboardType] = useState<KeyboardType>('decimal');

  const openKeyboard = (ref: RefObject<HTMLInputElement | HTMLTextAreaElement>, type: KeyboardType) => {
    setInputRef(ref);
    setKeyboardType(type);
    setIsOpen(true);
  };

  const closeKeyboard = () => {
    setIsOpen(false);
    setInputRef(null);
  };

  const onKeyPress = (key: string) => {
    if (!inputRef || !inputRef.current) return;
    const input = inputRef.current;
    const { value, selectionStart, selectionEnd } = input;
    
    if (key === 'backspace') {
        if (selectionStart === selectionEnd && selectionStart && selectionStart > 0) {
            input.value = value.slice(0, selectionStart - 1) + value.slice(selectionEnd || 0);
            input.setSelectionRange(selectionStart - 1, selectionStart - 1);
        } else if (selectionStart !== selectionEnd) {
             input.value = value.slice(0, selectionStart || 0) + value.slice(selectionEnd || 0);
             if (selectionStart) input.setSelectionRange(selectionStart, selectionStart);
        }
    } else {
        const newValue = value.slice(0, selectionStart || 0) + key + value.slice(selectionEnd || 0);
        input.value = newValue;
        const newPosition = (selectionStart || 0) + 1;
        input.setSelectionRange(newPosition, newPosition);
    }

    // Manually trigger change event for React state to update
    const event = new Event('input', { bubbles: true });
    input.dispatchEvent(event);
  };

  return (
    <KeyboardContext.Provider value={{ isOpen, inputRef, keyboardType, openKeyboard, closeKeyboard, onKeyPress }}>
      {children}
    </KeyboardContext.Provider>
  );
};

export const useKeyboard = () => {
  const context = useContext(KeyboardContext);
  if (context === undefined) {
    throw new Error('useKeyboard must be used within a KeyboardProvider');
  }
  return context;
};
