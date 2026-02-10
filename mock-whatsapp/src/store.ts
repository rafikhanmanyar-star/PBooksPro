/**
 * In-memory store for sent/received messages (for UI and debugging)
 */

export type MessageDirection = 'in' | 'out';

export interface StoredMessage {
  id: string;
  direction: MessageDirection;
  from: string;
  to: string;
  text: string;
  wamId: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  meta?: Record<string, unknown>;
}

const messages: StoredMessage[] = [];
const maxStored = 500;

export function addMessage(msg: Omit<StoredMessage, 'id' | 'timestamp'>): StoredMessage {
  const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const stored: StoredMessage = {
    ...msg,
    id,
    timestamp: new Date(),
  };
  messages.unshift(stored);
  if (messages.length > maxStored) {
    messages.length = maxStored;
  }
  return stored;
}

export function getMessages(limit = 100): StoredMessage[] {
  return messages.slice(0, limit);
}

export function clearMessages(): void {
  messages.length = 0;
}
