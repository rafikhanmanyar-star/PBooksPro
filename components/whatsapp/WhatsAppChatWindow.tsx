import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Contact } from '../../types';
import { WhatsAppChatService, WhatsAppMessage, normalizePhoneForMatch } from '../../services/whatsappChatService';
import { useNotification } from '../../context/NotificationContext';
import { useAppContext } from '../../context/AppContext';
import { getWebSocketClient } from '../../services/websocketClient';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { ICONS } from '../../constants';

interface WhatsAppChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  phoneNumber?: string; // Optional: if contact is not available, use phone number directly
}

const WhatsAppChatWindow: React.FC<WhatsAppChatWindowProps> = ({
  isOpen,
  onClose,
  contact,
  phoneNumber: propPhoneNumber,
}) => {
  const { showAlert, showToast } = useNotification();
  const { state } = useAppContext();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const wsClient = getWebSocketClient();

  // Get phone number from contact or prop
  const phoneNumber = contact?.contactNo || propPhoneNumber || '';

  // Check if WhatsApp is configured
  useEffect(() => {
    const checkConfiguration = async () => {
      if (!isOpen) return;
      try {
        const configured = await WhatsAppChatService.isConfigured();
        setIsConfigured(configured);
        if (!configured) {
          await showAlert(
            'WhatsApp API is not configured. Please configure it in Settings > Preferences > WhatsApp Integration.',
            { title: 'WhatsApp Not Configured' }
          );
        }
      } catch (error) {
        console.error('Error checking WhatsApp configuration:', error);
        setIsConfigured(false);
      }
    };
    checkConfiguration();
  }, [isOpen, showAlert]);

  // Load messages when window opens or contact changes
  // Note: Loading messages and marking as read are DB operations - they don't require WhatsApp API config
  useEffect(() => {
    const loadMessages = async () => {
      if (!isOpen || !phoneNumber) {
        setMessages([]);
        return;
      }

      setIsLoading(true);
      try {
        console.log('[WhatsAppChatWindow] Loading messages', {
          phoneNumber: phoneNumber.substring(0, 5) + '***',
          contactId: contact?.id || null,
          contactName: contact?.name || null,
        });
        
        const loadedMessages = await WhatsAppChatService.getMessages(phoneNumber, 50, 0, contact?.id);
        
        console.log('[WhatsAppChatWindow] Messages loaded', {
          count: loadedMessages.length,
          hasIncoming: loadedMessages.some(m => m.direction === 'incoming'),
          hasOutgoing: loadedMessages.some(m => m.direction === 'outgoing'),
        });
        
        setMessages(loadedMessages); // Server already returns in chronological order (oldest first)
        
        // Mark messages as read when opening chat (also pass contactId for proper filtering)
        try {
          await WhatsAppChatService.markAllAsRead(phoneNumber, contact?.id);
          // Notify header to refresh unread count badge immediately
          window.dispatchEvent(new CustomEvent('whatsapp:messages:read'));
        } catch (readError) {
          console.warn('[WhatsAppChatWindow] Error marking messages as read:', readError);
        }
      } catch (error: any) {
        console.error('[WhatsAppChatWindow] Error loading messages:', error);
        await showAlert(error.message || 'Failed to load messages');
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [isOpen, phoneNumber, contact?.id, showAlert]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Listen for real-time WhatsApp messages via WebSocket
  useEffect(() => {
    if (!isOpen || !phoneNumber) return;

    const handleWhatsAppMessageSent = (data: WhatsAppMessage) => {
      console.log('[WhatsAppChatWindow] WebSocket: Message sent received', {
        messageId: data.id,
        phoneNumber: data.phoneNumber,
        currentPhoneNumber: phoneNumber,
        direction: data.direction,
      });

      const dataNorm = normalizePhoneForMatch(data.phoneNumber || '');
      const currentNorm = normalizePhoneForMatch(phoneNumber);
      if (dataNorm && currentNorm && dataNorm === currentNorm && data.direction === 'outgoing') {
        // Update or add message to the list
        setMessages((prev) => {
          // Check if message already exists (optimistic update)
          const existingIndex = prev.findIndex((msg) => msg.id === data.id);
          if (existingIndex >= 0) {
            // Update existing message
            const updated = [...prev];
            updated[existingIndex] = {
              ...updated[existingIndex],
              ...data,
              timestamp: typeof data.timestamp === 'string' ? new Date(data.timestamp) : data.timestamp,
              createdAt: typeof data.createdAt === 'string' ? new Date(data.createdAt) : data.createdAt,
            };
            return updated;
          } else {
            // Add new message
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
      console.log('[WhatsAppChatWindow] WebSocket: Message received', {
        messageId: data.id,
        phoneNumber: data.phoneNumber,
        currentPhoneNumber: phoneNumber,
        direction: data.direction,
        contactId: data.contactId,
        currentContactId: contact?.id || null,
      });

      const dataNorm = normalizePhoneForMatch(data.phoneNumber || '');
      const currentNorm = normalizePhoneForMatch(phoneNumber);
      
      // Check if message matches current phone number
      const phoneMatches = dataNorm && currentNorm && dataNorm === currentNorm;
      
      // Check if message matches current contact (if contact is specified)
      const contactMatches = !contact?.id || !data.contactId || data.contactId === contact.id;
      
      if (phoneMatches && contactMatches && data.direction === 'incoming') {
        console.log('[WhatsAppChatWindow] Adding incoming message to UI', {
          messageId: data.id,
          phoneNumber: data.phoneNumber.substring(0, 5) + '***',
        });
        
        setMessages((prev) => {
          // Check if message already exists (by id or messageId/wamId)
          const existingIndex = prev.findIndex(
            (msg) => msg.id === data.id || 
                     (data.messageId && msg.messageId === data.messageId) ||
                     (data.wamId && msg.wamId === data.wamId)
          );
          
          if (existingIndex >= 0) {
            // Update existing message
            console.log('[WhatsAppChatWindow] Updating existing message in UI', {
              existingIndex,
              messageId: data.id,
            });
            const updated = [...prev];
            updated[existingIndex] = {
              ...updated[existingIndex],
              ...data,
              timestamp: typeof data.timestamp === 'string' ? new Date(data.timestamp) : data.timestamp,
              createdAt: typeof data.createdAt === 'string' ? new Date(data.createdAt) : data.createdAt,
            };
            return updated;
          } else {
            // Add new message (insert in chronological order)
            console.log('[WhatsAppChatWindow] Adding new message to UI', {
              messageId: data.id,
              currentMessageCount: prev.length,
            });
            const newMessage = {
              ...data,
              timestamp: typeof data.timestamp === 'string' ? new Date(data.timestamp) : data.timestamp,
              createdAt: typeof data.createdAt === 'string' ? new Date(data.createdAt) : data.createdAt,
            };
            
            // Insert in chronological order
            const newMessages = [...prev, newMessage];
            newMessages.sort((a, b) => {
              const timeA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : (a.timestamp as Date).getTime();
              const timeB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : (b.timestamp as Date).getTime();
              return timeA - timeB;
            });
            
            return newMessages;
          }
        });
        // Message arrived while chat is open - mark as read immediately
        WhatsAppChatService.markAllAsRead(phoneNumber, contact?.id).then(() => {
          window.dispatchEvent(new CustomEvent('whatsapp:messages:read'));
        }).catch(() => {});
      } else {
        console.log('[WhatsAppChatWindow] Message not for current conversation, ignoring', {
          phoneMatches,
          contactMatches,
          dataContactId: data.contactId,
          currentContactId: contact?.id || null,
        });
      }
    };

    const handleWhatsAppMessageStatus = (data: { messageId: string; status: string; timestamp?: Date }) => {
      console.log('[WhatsAppChatWindow] WebSocket: Status update received', {
        messageId: data.messageId,
        status: data.status,
      });

      // Update message status if it exists
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
      // Cleanup: remove listeners
      wsClient.off('whatsapp:message:sent', handleWhatsAppMessageSent);
      wsClient.off('whatsapp:message:received', handleWhatsAppMessageReceived);
      wsClient.off('whatsapp:message:status', handleWhatsAppMessageStatus);
    };
  }, [isOpen, phoneNumber, contact?.id, wsClient]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleSend = async () => {
    if (!phoneNumber || !newMessage.trim() || !isConfigured) return;

    const messageText = newMessage.trim();
    setNewMessage('');
    setIsSending(true);

    // Optimistically add message to UI
    const tempMessage: WhatsAppMessage = {
      id: `temp-${Date.now()}`,
      tenantId: state.tenantId || '',
      contactId: contact?.id,
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
        contactId: contact?.id,
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
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
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
    <Modal isOpen={isOpen} onClose={onClose} title={`WhatsApp - ${displayName}`} size="lg" maxContentHeight={600}>
      <div className="flex flex-col h-full min-h-[400px] max-h-[600px]">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-200 pb-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white">
              {ICONS.whatsapp}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-800 truncate">{displayName}</h3>
              <p className="text-xs text-slate-500 font-mono">{phoneNumber}</p>
            </div>
            {!isConfigured && (
              <div className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded">
                Not Configured
              </div>
            )}
          </div>
        </div>

        {/* Messages Container */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto space-y-4 px-2 py-4 bg-slate-50 rounded-lg"
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
                        className={`max-w-[70%] rounded-lg px-4 py-2 ${
                          message.direction === 'outgoing'
                            ? 'bg-green-500 text-white'
                            : 'bg-white text-slate-800 border border-slate-200'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{message.messageText}</p>
                        <div
                          className={`flex items-center gap-1 mt-1 ${
                            message.direction === 'outgoing' ? 'justify-end text-green-100' : 'justify-start text-slate-500'
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
        <div className="flex-shrink-0 border-t border-slate-200 pt-3 mt-3">
          {!isConfigured ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
              <p className="text-sm text-amber-800">
                WhatsApp API is not configured. Please configure it in{' '}
                <span className="font-semibold">Settings &gt; Preferences &gt; WhatsApp Integration</span>
              </p>
            </div>
          ) : (
            <div className="flex gap-2">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message... (Press Enter to send, Shift+Enter for new line)"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-sm"
                rows={3}
                disabled={isSending || !phoneNumber}
              />
              <Button
                onClick={handleSend}
                disabled={isSending || !newMessage.trim() || !phoneNumber}
                className="self-end"
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
          )}
        </div>
      </div>
    </Modal>
  );
};

export default WhatsAppChatWindow;
