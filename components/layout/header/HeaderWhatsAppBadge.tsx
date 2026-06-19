import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WhatsAppChatService,
  WhatsAppMessage,
  UnreadConversation,
  normalizePhoneForMatch,
} from '../../../services/whatsappChatService';
import { useWhatsApp } from '../../../context/WhatsAppContext';
import { useContacts, useWhatsAppMode } from '../../../hooks/useSelectiveState';
import { sendOrOpenWhatsApp } from '../../../services/whatsappService';
import { getRealtimeSocket } from '../../../core/socket';
import { useAuth } from '../../../context/AuthContext';
import { formatNotificationTime } from './headerNotificationUtils';

const HeaderWhatsAppBadge: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const whatsAppMode = useWhatsAppMode();
  const contacts = useContacts();
  const { openChat } = useWhatsApp();

  const [whatsappUnreadCount, setWhatsappUnreadCount] = useState(0);
  const [isWhatsappDropdownOpen, setIsWhatsappDropdownOpen] = useState(false);
  const [unreadConversations, setUnreadConversations] = useState<UnreadConversation[]>([]);
  const [whatsappNotifications, setWhatsappNotifications] = useState<
    {
      id: string;
      messageId?: string;
      phoneNumber: string;
      contactId?: string;
      contactName?: string;
      messageText: string;
      timestamp: string;
    }[]
  >([]);
  const whatsappDropdownRef = useRef<HTMLDivElement>(null);

  const resolveWhatsAppTimestamp = useCallback((value?: string | Date) => {
    if (!value) return new Date().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'number') {
      const ms = value < 100000000000 ? value * 1000 : value;
      return new Date(ms).toISOString();
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric)) {
        const ms = trimmed.length <= 10 ? numeric * 1000 : numeric;
        return new Date(ms).toISOString();
      }
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
    return new Date().toISOString();
  }, []);

  const findContactByPhone = useCallback(
    (phoneNumber: string) => {
      if (!phoneNumber) return undefined;
      const normalized = normalizePhoneForMatch(phoneNumber);
      const digitsOnly = phoneNumber.replace(/\D/g, '');
      const lastTen = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : '';
      if (!normalized && !lastTen) return undefined;
      return contacts.find((contact) => {
        const contactNumber = contact.contactNo || '';
        if (!contactNumber) return false;
        const contactNormalized = normalizePhoneForMatch(contactNumber);
        if (normalized && contactNormalized && normalized === contactNormalized) return true;
        const contactDigits = contactNumber.replace(/\D/g, '');
        if (lastTen && contactDigits.length >= 10) {
          return contactDigits.slice(-10) === lastTen;
        }
        return false;
      });
    },
    [contacts]
  );

  const addWhatsAppNotification = useCallback(
    (message?: WhatsAppMessage) => {
      if (!message || message.direction !== 'incoming') return;

      const messageKey =
        message.messageId ||
        message.wamId ||
        message.id ||
        `${message.phoneNumber}-${message.timestamp}`;
      const notificationId = `whatsapp:${messageKey}`;

      const contactFromId = message.contactId
        ? contacts.find((contact) => contact.id === message.contactId)
        : undefined;
      const contactFromPhone = contactFromId || findContactByPhone(message.phoneNumber);
      const resolvedContactId = contactFromId?.id || contactFromPhone?.id || message.contactId;
      const resolvedContactName = contactFromId?.name || contactFromPhone?.name;
      const messageText =
        message.messageText?.trim() ||
        (message.mediaType ? `Media message (${message.mediaType})` : 'New message');

      setWhatsappNotifications((prev) => {
        if (prev.some((item) => item.id === notificationId)) {
          return prev;
        }
        const nextItem = {
          id: notificationId,
          messageId: message.messageId || message.wamId || message.id,
          phoneNumber: message.phoneNumber,
          contactId: resolvedContactId,
          contactName: resolvedContactName,
          messageText,
          timestamp: resolveWhatsAppTimestamp(message.timestamp),
        };
        return [nextItem, ...prev].slice(0, 50);
      });
    },
    [findContactByPhone, resolveWhatsAppTimestamp, contacts]
  );

  const loadWhatsAppUnreadData = useCallback(async () => {
    try {
      const [count, conversations] = await Promise.all([
        WhatsAppChatService.getUnreadCount(),
        WhatsAppChatService.getUnreadConversations(),
      ]);
      setWhatsappUnreadCount(count);
      setUnreadConversations(conversations);
    } catch {
      setWhatsappUnreadCount(0);
      setUnreadConversations([]);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setWhatsappUnreadCount(0);
      setUnreadConversations([]);
      return;
    }

    loadWhatsAppUnreadData();
    const interval = setInterval(loadWhatsAppUnreadData, 60000);

    const handleMessagesRead = () => {
      loadWhatsAppUnreadData();
    };

    const socket = getRealtimeSocket();
    if (!socket) {
      window.addEventListener('whatsapp:messages:read', handleMessagesRead);
      return () => {
        clearInterval(interval);
        window.removeEventListener('whatsapp:messages:read', handleMessagesRead);
      };
    }

    const handleWhatsAppMessageReceived = (data?: WhatsAppMessage & { autoReplied?: boolean }) => {
      if (data?.autoReplied) return;
      loadWhatsAppUnreadData();
      addWhatsAppNotification(data);
    };

    socket.on('whatsapp:message:received', handleWhatsAppMessageReceived);
    window.addEventListener('whatsapp:messages:read', handleMessagesRead);

    return () => {
      clearInterval(interval);
      socket.off('whatsapp:message:received', handleWhatsAppMessageReceived);
      window.removeEventListener('whatsapp:messages:read', handleMessagesRead);
    };
  }, [isAuthenticated, addWhatsAppNotification, loadWhatsAppUnreadData]);

  const mergedWhatsappItems = useMemo(() => {
    const items: {
      id: string;
      phoneNumber: string;
      contactId?: string;
      contactName?: string;
      messageText: string;
      timestamp: string;
      unreadCount?: number;
      source: 'realtime' | 'db';
    }[] = whatsappNotifications.map((n) => ({
      ...n,
      source: 'realtime' as const,
    }));

    const realtimePhones = new Set(
      whatsappNotifications.map((n) => normalizePhoneForMatch(n.phoneNumber)).filter(Boolean)
    );

    for (const conv of unreadConversations) {
      const normPhone = normalizePhoneForMatch(conv.phoneNumber);
      if (normPhone && !realtimePhones.has(normPhone)) {
        items.push({
          id: `unread-conv:${conv.phoneNumber}`,
          phoneNumber: conv.phoneNumber,
          contactId: conv.contactId || undefined,
          contactName: conv.contactName || undefined,
          messageText: conv.lastMessage,
          timestamp: conv.lastTimestamp,
          unreadCount: conv.unreadCount,
          source: 'db',
        });
      }
    }

    return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [whatsappNotifications, unreadConversations]);

  const handleWhatsAppNotificationClick = useCallback(() => {
    if (mergedWhatsappItems.length > 0) {
      setIsWhatsappDropdownOpen((prev) => !prev);
    } else {
      openChat();
    }
  }, [openChat, mergedWhatsappItems.length]);

  const handleWhatsAppNotificationItemClick = useCallback(
    (item: (typeof mergedWhatsappItems)[0]) => {
      if (item.source === 'realtime') {
        setWhatsappNotifications((prev) => prev.filter((n) => n.id !== item.id));
      }
      setIsWhatsappDropdownOpen(false);

      const contact =
        contacts.find((c) => c.id === item.contactId) || findContactByPhone(item.phoneNumber) || null;
      const phone = item.phoneNumber || contact?.contactNo;
      const contactLike = contact || (phone ? { id: '', name: phone, contactNo: phone } : null);
      if (contactLike && phone) {
        setTimeout(() => {
          sendOrOpenWhatsApp(
            { contact: contactLike, message: '', phoneNumber: phone },
            () => whatsAppMode,
            openChat
          );
        }, 0);
      } else {
        setTimeout(() => openChat(contact, item.phoneNumber), 0);
      }
    },
    [contacts, findContactByPhone, whatsAppMode, openChat]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isWhatsappDropdownOpen &&
        whatsappDropdownRef.current &&
        !whatsappDropdownRef.current.contains(event.target as Node)
      ) {
        setIsWhatsappDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isWhatsappDropdownOpen]);

  if (whatsAppMode !== 'api') {
    return null;
  }

  return (
    <div className="relative" ref={whatsappDropdownRef}>
      <button
        onClick={handleWhatsAppNotificationClick}
        className="p-2 rounded-full text-app-muted hover:bg-black/5 dark:hover:bg-white/10 hover:text-green-600 transition-colors relative group min-w-[44px] min-h-[44px] touch-manipulation flex items-center justify-center"
        title={
          whatsappUnreadCount > 0
            ? `${whatsappUnreadCount} unread WhatsApp messages`
            : 'WhatsApp Messages'
        }
        aria-label="WhatsApp Messages"
        aria-expanded={isWhatsappDropdownOpen}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
        </svg>
        {whatsappUnreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1.5 bg-green-500 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center">
            {whatsappUnreadCount > 99 ? '99+' : whatsappUnreadCount}
          </span>
        )}
      </button>

      {isWhatsappDropdownOpen && mergedWhatsappItems.length > 0 && (
        <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-app-modal border border-app-border rounded-xl shadow-xl overflow-hidden z-40">
          <div className="flex items-center justify-between px-4 py-3 border-b border-app-border bg-emerald-950/30 dark:bg-emerald-950/40">
            <div className="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-green-600"
              >
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
              </svg>
              <h3 className="text-sm font-bold text-green-800">WhatsApp Messages</h3>
              <span className="text-xs text-green-600">({whatsappUnreadCount})</span>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {mergedWhatsappItems.map((item) => (
              <div
                key={item.id}
                className="group relative hover:bg-emerald-950/20 border-b border-app-border last:border-b-0"
              >
                <button
                  onClick={() => handleWhatsAppNotificationItemClick(item)}
                  className="w-full text-left px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-green-500 rounded-full flex items-center justify-center text-white flex-shrink-0 mt-0.5">
                      <span className="text-sm font-bold">
                        {(item.contactName || item.phoneNumber).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-app-text truncate">
                          {item.contactName || item.phoneNumber}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {formatNotificationTime(item.timestamp) && (
                            <span className="text-[11px] text-app-muted">
                              {formatNotificationTime(item.timestamp)}
                            </span>
                          )}
                          {item.unreadCount && item.unreadCount > 1 && (
                            <span className="min-w-[20px] h-[20px] px-1.5 bg-green-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                              {item.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-app-muted mt-0.5 truncate">{item.messageText}</p>
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-app-border px-4 py-2 bg-app-card">
            <button
              onClick={() => {
                setIsWhatsappDropdownOpen(false);
                openChat();
              }}
              className="w-full text-center text-xs text-green-700 hover:text-green-800 font-medium hover:underline py-1"
            >
              Open WhatsApp Chat
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(HeaderWhatsAppBadge);
