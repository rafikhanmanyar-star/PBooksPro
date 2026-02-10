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
  // Note: Loading messages and marking as read are DB operations - they don't require WhatsApp API config
  useEffect(() => {
    const loadMessages = async () => {
      if (!isOpen || !phoneNumber) {
        setMessages([]);
        return;
      }

      setIsLoading(true);
      try {
        const loadedMessages = await WhatsAppChatService.getMessages(phoneNumber, 100, 0);
        setMessages(loadedMessages); // Server already returns in chronological order (oldest first)
        // Mark messages as read when opening chat
        try {
          await WhatsAppChatService.markAllAsRead(phoneNumber);
          // Notify header to refresh unread count badge immediately
          window.dispatchEvent(new CustomEvent('whatsapp:messages:read'));
        } catch (markReadError: any) {
          console.warn('Could not mark messages as read:', markReadError);
        }
      } catch (error: any) {
        console.error('Error loading messages:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [isOpen, phoneNumber]);

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
        // Message arrived while chat is open - mark as read immediately
        WhatsAppChatService.markAllAsRead(phoneNumber).then(() => {
          window.dispatchEvent(new CustomEvent('whatsapp:messages:read'));
        }).catch(() => {});
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
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-[9998] transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Side Panel - WhatsApp Style */}
      <div
        className={`fixed right-0 top-0 h-full w-full sm:w-[420px] shadow-2xl z-[9999] flex flex-col transform transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - WhatsApp teal */}
        <div className="flex-shrink-0 bg-[#075E54] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
              aria-label="Back"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white flex-shrink-0">
              <span className="text-lg font-bold">{(displayName || '?').charAt(0).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white truncate text-[15px]">{displayName}</h3>
              <p className="text-xs text-white/70 font-mono truncate">{phoneNumber}</p>
            </div>
          </div>
        </div>

        {/* Messages Container - WhatsApp chat wallpaper */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-3 py-3 flex flex-col"
          style={{
            minHeight: 0,
            backgroundColor: '#ECE5DD',
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23d5cec3\' fill-opacity=\'0.3\'%3E%3Ccircle cx=\'10\' cy=\'10\' r=\'1\'/%3E%3Ccircle cx=\'50\' cy=\'30\' r=\'1\'/%3E%3Ccircle cx=\'90\' cy=\'10\' r=\'1\'/%3E%3Ccircle cx=\'130\' cy=\'40\' r=\'1\'/%3E%3Ccircle cx=\'170\' cy=\'20\' r=\'1\'/%3E%3Ccircle cx=\'30\' cy=\'60\' r=\'1\'/%3E%3Ccircle cx=\'70\' cy=\'70\' r=\'1\'/%3E%3Ccircle cx=\'110\' cy=\'60\' r=\'1\'/%3E%3Ccircle cx=\'150\' cy=\'80\' r=\'1\'/%3E%3Ccircle cx=\'190\' cy=\'60\' r=\'1\'/%3E%3Ccircle cx=\'20\' cy=\'110\' r=\'1\'/%3E%3Ccircle cx=\'60\' cy=\'100\' r=\'1\'/%3E%3Ccircle cx=\'100\' cy=\'120\' r=\'1\'/%3E%3Ccircle cx=\'140\' cy=\'100\' r=\'1\'/%3E%3Ccircle cx=\'180\' cy=\'130\' r=\'1\'/%3E%3Ccircle cx=\'10\' cy=\'150\' r=\'1\'/%3E%3Ccircle cx=\'50\' cy=\'140\' r=\'1\'/%3E%3Ccircle cx=\'90\' cy=\'160\' r=\'1\'/%3E%3Ccircle cx=\'130\' cy=\'150\' r=\'1\'/%3E%3Ccircle cx=\'170\' cy=\'170\' r=\'1\'/%3E%3Ccircle cx=\'40\' cy=\'190\' r=\'1\'/%3E%3Ccircle cx=\'80\' cy=\'180\' r=\'1\'/%3E%3Ccircle cx=\'120\' cy=\'190\' r=\'1\'/%3E%3Ccircle cx=\'160\' cy=\'180\' r=\'1\'/%3E%3C/g%3E%3C/svg%3E")',
          }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-8 flex-1">
              <div className="bg-white rounded-lg px-4 py-2 shadow-sm text-slate-500 text-sm">Loading messages...</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center flex-1">
              <div className="bg-white/90 rounded-xl px-6 py-6 shadow-sm">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"></path></svg>
                </div>
                <p className="text-slate-700 font-medium text-sm">No messages yet</p>
                <p className="text-xs text-slate-500 mt-1">Send a message to start the conversation</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1" />
              {messages.map((message, index) => {
                const prevMessage = index > 0 ? messages[index - 1] : null;
                const currentDate = formatDate(message.timestamp);
                const prevDate = prevMessage ? formatDate(prevMessage.timestamp) : null;
                const showDateSeparator = currentDate !== prevDate;

                return (
                  <React.Fragment key={message.id || `msg-${index}`}>
                    {showDateSeparator && (
                      <div className="flex items-center justify-center my-3">
                        <div className="px-3 py-1 bg-white/90 text-slate-600 text-[11px] rounded-md shadow-sm font-medium">
                          {currentDate}
                        </div>
                      </div>
                    )}
                    <div
                      className={`flex mb-1 ${message.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-1.5 shadow-sm relative ${message.direction === 'outgoing'
                          ? 'bg-[#DCF8C6] text-slate-800'
                          : 'bg-white text-slate-800'
                          }`}
                      >
                        <p className="text-[13px] whitespace-pre-wrap break-words leading-relaxed">{message.messageText}</p>
                        <div
                          className={`flex items-center gap-1 mt-0.5 ${message.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                        >
                          <span className="text-[11px] text-slate-500">{formatTime(message.timestamp)}</span>
                          {message.direction === 'outgoing' && (
                            <span className="text-[11px]">{getStatusIcon(message.status)}</span>
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

        {/* Input Area - WhatsApp Style */}
        <div className="flex-shrink-0 bg-[#F0F0F0] px-3 py-2">
          {!isConfigured ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center mb-2">
              <p className="text-xs text-amber-800">
                WhatsApp API not configured. Messages will open in WhatsApp Web.
              </p>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <div className="flex-1 bg-white rounded-3xl px-4 py-2 shadow-sm">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message"
                className="w-full resize-none focus:outline-none text-sm text-slate-800 placeholder-slate-400 leading-5"
                rows={1}
                disabled={isSending || !phoneNumber}
                style={{ maxHeight: '100px', minHeight: '20px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = '20px';
                  target.style.height = Math.min(target.scrollHeight, 100) + 'px';
                }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={isSending || !newMessage.trim() || !phoneNumber}
              className="w-10 h-10 bg-[#075E54] hover:bg-[#064E46] text-white rounded-full flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isSending ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default WhatsAppSidePanel;
