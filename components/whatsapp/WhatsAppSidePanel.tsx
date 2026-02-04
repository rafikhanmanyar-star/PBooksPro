import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Contact, Vendor } from '../../types';
import { WhatsAppChatService, WhatsAppMessage, normalizePhoneForMatch } from '../../services/whatsappChatService';
import { useNotification } from '../../context/NotificationContext';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { getWebSocketClient } from '../../services/websocketClient';
import Button from '../ui/Button';
import { ICONS } from '../../constants';

interface WhatsAppSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | Vendor | null;
  phoneNumber?: string;
  initialMessage?: string; // Pre-filled message when opening from invoice/bill
}

const WhatsAppSidePanel: React.FC<WhatsAppSidePanelProps> = ({
  isOpen,
  onClose,
  contact,
  phoneNumber: propPhoneNumber,
  initialMessage = '',
}) => {
  const { showAlert, showToast } = useNotification();
  const { state } = useAppContext();
  const { tenant } = useAuth();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [newMessage, setNewMessage] = useState(initialMessage);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const wsClient = getWebSocketClient();

  // Get phone number from contact or prop
  const phoneNumber = contact?.contactNo || propPhoneNumber || '';

  // Update newMessage when initialMessage changes
  useEffect(() => {
    if (initialMessage && isOpen) {
      setNewMessage(initialMessage);
    } else if (!isOpen) {
      setNewMessage('');
    }
  }, [initialMessage, isOpen]);

  // Check if WhatsApp is configured
  useEffect(() => {
    const checkConfiguration = async () => {
      if (!isOpen) return;
      try {
        const configured = await WhatsAppChatService.isConfigured();
        setIsConfigured(configured);
      } catch (error) {
        console.error('Error checking WhatsApp configuration:', error);
        setIsConfigured(false);
      }
    };
    checkConfiguration();
  }, [isOpen]);

  // Load messages when panel opens
  useEffect(() => {
    const loadMessages = async () => {
      if (!isOpen || !phoneNumber || !isConfigured) {
        setMessages([]);
        return;
      }

      setIsLoading(true);
      try {
        const loadedMessages = await WhatsAppChatService.getMessages(phoneNumber, 100, 0);
        setMessages(loadedMessages.reverse()); // Reverse to show oldest first
        // Mark messages as read when opening chat (silently fail if not configured)
        try {
          await WhatsAppChatService.markAllAsRead(phoneNumber);
        } catch (markReadError: any) {
          // Silently fail - this is not critical, just log it
          console.warn('Could not mark messages as read:', markReadError);
        }
      } catch (error: any) {
        console.error('Error loading messages:', error);
        // Don't show alert for loading errors, just log
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [isOpen, phoneNumber, isConfigured]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Listen for real-time WhatsApp messages via WebSocket
  useEffect(() => {
    if (!isOpen || !phoneNumber) return;

    const handleWhatsAppMessageSent = (data: WhatsAppMessage) => {
      const dataNorm = normalizePhoneForMatch(data.phoneNumber || '');
      const currentNorm = normalizePhoneForMatch(phoneNumber);
      if (dataNorm && currentNorm && dataNorm === currentNorm && data.direction === 'outgoing') {
        setMessages((prev) => {
          const existingIndex = prev.findIndex((msg) => msg.id === data.id);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = {
              ...updated[existingIndex],
              ...data,
              timestamp: typeof data.timestamp === 'string' ? new Date(data.timestamp) : data.timestamp,
              createdAt: typeof data.createdAt === 'string' ? new Date(data.createdAt) : data.createdAt,
            };
            return updated;
          } else {
            return [
              ...prev,
              {
                ...data,
                timestamp: typeof data.timestamp === 'string' ? new Date(data.timestamp) : data.timestamp,
                createdAt: typeof data.createdAt === 'string' ? new Date(data.createdAt) : data.createdAt,
              },
            ];
          }
        });
      }
    };

    const handleWhatsAppMessageReceived = (data: WhatsAppMessage) => {
      const dataNorm = normalizePhoneForMatch(data.phoneNumber || '');
      const currentNorm = normalizePhoneForMatch(phoneNumber);
      if (dataNorm && currentNorm && dataNorm === currentNorm && data.direction === 'incoming') {
        setMessages((prev) => {
          const existingIndex = prev.findIndex((msg) => msg.id === data.id || msg.messageId === data.messageId);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = {
              ...updated[existingIndex],
              ...data,
              timestamp: typeof data.timestamp === 'string' ? new Date(data.timestamp) : data.timestamp,
              createdAt: typeof data.createdAt === 'string' ? new Date(data.createdAt) : data.createdAt,
            };
            return updated;
          } else {
            return [
              ...prev,
              {
                ...data,
                timestamp: typeof data.timestamp === 'string' ? new Date(data.timestamp) : data.timestamp,
                createdAt: typeof data.createdAt === 'string' ? new Date(data.createdAt) : data.createdAt,
              },
            ];
          }
        });
      }
    };

    const handleWhatsAppMessageStatus = (data: { messageId: string; status: string; timestamp?: Date }) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.messageId === data.messageId || msg.wamId === data.messageId) {
            return {
              ...msg,
              status: data.status as WhatsAppMessage['status'],
            };
          }
          return msg;
        })
      );
    };

    // Register WebSocket listeners
    wsClient.on('whatsapp:message:sent', handleWhatsAppMessageSent);
    wsClient.on('whatsapp:message:received', handleWhatsAppMessageReceived);
    wsClient.on('whatsapp:message:status', handleWhatsAppMessageStatus);

    return () => {
      wsClient.off('whatsapp:message:sent', handleWhatsAppMessageSent);
      wsClient.off('whatsapp:message:received', handleWhatsAppMessageReceived);
      wsClient.off('whatsapp:message:status', handleWhatsAppMessageStatus);
    };
  }, [isOpen, phoneNumber, wsClient]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleSend = async () => {
    if (!phoneNumber || !newMessage.trim()) return;

    // If API not configured, fallback to manual WhatsApp
    if (!isConfigured) {
      const { WhatsAppService } = await import('../../services/whatsappService');
      try {
        WhatsAppService.sendMessage({
          contact: contact || { id: '', name: phoneNumber, contactNo: phoneNumber } as any,
          message: newMessage.trim()
        });
        setNewMessage('');
        return;
      } catch (error: any) {
        await showAlert(error.message || 'Failed to open WhatsApp');
        return;
      }
    }

    const messageText = newMessage.trim();
    setNewMessage('');
    setIsSending(true);

    // Optimistically add message to UI
    const tempMessage: WhatsAppMessage = {
      id: `temp-${Date.now()}`,
      tenantId: tenant?.id || '',
      contactId: contact && 'type' in contact ? contact.id : undefined,
      vendorId: contact && !('type' in contact) ? contact.id : undefined,
      phoneNumber,
      direction: 'outgoing',
      status: 'sending',
      messageText: messageText,
      timestamp: new Date(),
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, tempMessage]);

    try {
      const result = await WhatsAppChatService.sendMessage({
        phoneNumber,
        message: messageText,
        contactId: contact && 'type' in contact ? contact.id : undefined,
        vendorId: contact && !('type' in contact) ? contact.id : undefined,
      });

      // Update temp message with actual message ID
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempMessage.id
            ? { ...msg, id: result.messageId, messageId: result.messageId, wamId: result.wamId, status: result.status }
            : msg
        )
      );

      showToast('Message sent successfully', 'success');
      scrollToBottom();
    } catch (error: any) {
      console.error('Error sending message:', error);
      // Remove temp message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
      await showAlert(error.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: string | Date) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDate = (date: string | Date) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    }
  };

  const getStatusIcon = (status: WhatsAppMessage['status']) => {
    switch (status) {
      case 'sent':
        return <span className="text-slate-400">✓</span>;
      case 'delivered':
        return <span className="text-slate-400">✓✓</span>;
      case 'read':
        return <span className="text-blue-500">✓✓</span>;
      case 'failed':
        return <span className="text-red-500">✗</span>;
      case 'sending':
        return <span className="text-slate-300 animate-pulse">...</span>;
      default:
        return null;
    }
  };

  const displayName = contact?.name || phoneNumber || 'Unknown Contact';

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop - semi-transparent, non-blocking */}
      <div
        className="fixed inset-0 bg-black/20 z-[9998] transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Side Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-[9999] flex flex-col transform transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white flex-shrink-0">
              {ICONS.whatsapp}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-800 truncate">{displayName}</h3>
              <p className="text-xs text-slate-500 font-mono truncate">{phoneNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-2 text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <div className="w-5 h-5">{ICONS.x}</div>
          </button>
        </div>

        {/* Messages Container */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto space-y-4 px-4 py-4 bg-slate-50"
          style={{ minHeight: 0 }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-slate-500">Loading messages...</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                {ICONS.whatsapp}
              </div>
              <p className="text-slate-600 font-medium">No messages yet</p>
              <p className="text-sm text-slate-500 mt-1">Start a conversation by sending a message</p>
            </div>
          ) : (
            <>
              {messages.map((message, index) => {
                const prevMessage = index > 0 ? messages[index - 1] : null;
                const currentDate = formatDate(message.timestamp);
                const prevDate = prevMessage ? formatDate(prevMessage.timestamp) : null;
                const showDateSeparator = currentDate !== prevDate;

                return (
                  <React.Fragment key={message.id || `msg-${index}`}>
                    {showDateSeparator && (
                      <div className="flex items-center justify-center my-4">
                        <div className="px-3 py-1 bg-slate-200 text-slate-600 text-xs rounded-full">
                          {currentDate}
                        </div>
                      </div>
                    )}
                    <div
                      className={`flex ${message.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 ${message.direction === 'outgoing'
                          ? 'bg-green-500 text-white'
                          : 'bg-white text-slate-800 border border-slate-200'
                          }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{message.messageText}</p>
                        <div
                          className={`flex items-center gap-1 mt-1 ${message.direction === 'outgoing' ? 'justify-end text-green-100' : 'justify-start text-slate-500'
                            }`}
                        >
                          <span className="text-xs">{formatTime(message.timestamp)}</span>
                          {message.direction === 'outgoing' && (
                            <span className="text-xs">{getStatusIcon(message.status)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 border-t border-slate-200 bg-white p-3">
          {!isConfigured ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center mb-3">
              <p className="text-xs text-amber-800">
                WhatsApp API not configured. Messages will open in WhatsApp Web.
              </p>
            </div>
          ) : null}
          <div className="flex gap-2">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-sm"
              rows={3}
              disabled={isSending || !phoneNumber}
            />
            <Button
              onClick={handleSend}
              disabled={isSending || !newMessage.trim() || !phoneNumber}
              className="self-end bg-green-500 hover:bg-green-600"
              size="icon"
            >
              {isSending ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default WhatsAppSidePanel;
