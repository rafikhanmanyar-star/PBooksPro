/**
 * In-memory chat store for LAN/API mode (PostgreSQL is source of truth; no SQLite cache).
 */

export type InMemoryChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  message: string;
  createdAt: string;
  readAt?: string;
};

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function subscribeInMemoryChat(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

const messagesByPair = new Map<string, InMemoryChatMessage[]>();

function dedupeInsert(arr: InMemoryChatMessage[], msg: InMemoryChatMessage): void {
  if (arr.some((m) => m.id === msg.id)) return;
  arr.push(msg);
}

export function appendInMemoryChatMessage(msg: InMemoryChatMessage): void {
  const k = pairKey(msg.senderId, msg.recipientId);
  const arr = messagesByPair.get(k) || [];
  dedupeInsert(arr, msg);
  messagesByPair.set(k, arr);
  notify();
}

export function getInMemoryConversation(userId1: string, userId2: string): InMemoryChatMessage[] {
  const k = pairKey(userId1, userId2);
  return [...(messagesByPair.get(k) || [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

/** Same shape as ChatMessagesRepository.getConversationsForUser (camelCase from dbToObjectFormat). */
export function getInMemoryConversationsForUser(userId: string): Array<{
  otherUserId: string;
  otherUserName: string;
  lastMessageTime: string;
}> {
  const byOther = new Map<string, { otherUserId: string; otherUserName: string; lastMessageTime: string }>();
  for (const [, msgs] of messagesByPair) {
    for (const m of msgs) {
      if (m.senderId !== userId && m.recipientId !== userId) continue;
      const other = m.senderId === userId ? m.recipientId : m.senderId;
      const otherName = m.senderId === userId ? m.recipientName : m.senderName;
      const cur = byOther.get(other);
      if (!cur || m.createdAt > cur.lastMessageTime) {
        byOther.set(other, {
          otherUserId: other,
          otherUserName: otherName,
          lastMessageTime: m.createdAt,
        });
      }
    }
  }
  return Array.from(byOther.values()).sort(
    (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
  );
}

/** Mark incoming messages from `fromUserId` to `toUserId` as read (matches SQLite markAsRead). */
export function markInMemoryChatRead(fromUserId: string, toUserId: string): void {
  const k = pairKey(fromUserId, toUserId);
  const arr = messagesByPair.get(k);
  if (!arr) return;
  const now = new Date().toISOString();
  for (const m of arr) {
    if (m.senderId === fromUserId && m.recipientId === toUserId && !m.readAt) {
      m.readAt = now;
    }
  }
  notify();
}

export function getInMemoryUnreadCount(userId: string): number {
  let n = 0;
  for (const arr of messagesByPair.values()) {
    for (const m of arr) {
      if (m.recipientId === userId && !m.readAt) n += 1;
    }
  }
  return n;
}
