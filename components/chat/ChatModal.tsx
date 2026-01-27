import React, { useState, useEffect, useRef } from 'react';
import Modal from '../ui/Modal';
import { ChatMessagesRepository } from '../../services/database/repositories';
import { getDatabaseService } from '../../services/database/databaseService';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import { apiClient } from '../../services/api/client';
import { getWebSocketClient } from '../../services/websocketClient';

interface OnlineUser {
    id: string;
    username: string;
    name: string;
    role: string;
    email?: string;
}

interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    recipientId: string;
    recipientName: string;
    message: string;
    createdAt: string;
    readAt?: string;
}

interface ChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    onlineUsers: OnlineUser[];
}

const ChatModal: React.FC<ChatModalProps> = ({ isOpen, onClose, onlineUsers }) => {
    const { user } = useAuth();
    const { state } = useAppContext();
    const currentUser = user || state.currentUser;
    const currentUserId = currentUser?.id || '';
    const currentUserName = currentUser?.name || 'User';
    
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [conversations, setConversations] = useState<any[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatRepo = new ChatMessagesRepository();
    const wsClient = getWebSocketClient();

    const ensureChatDbReady = async (): Promise<boolean> => {
        try {
            console.log(`📝 [ChatModal] ensureChatDbReady called`);
            const dbService = getDatabaseService();
            console.log(`📝 [ChatModal] Database service initialized: ${dbService.isInitialized}`);
            console.log(`📝 [ChatModal] Database ready: ${dbService.isReady()}`);
            
            if (!dbService.isReady()) {
                console.log(`📝 [ChatModal] Initializing database...`);
                await dbService.initialize();
                console.log(`📝 [ChatModal] Database initialized. Ready: ${dbService.isReady()}`);
            }
            
            // Note: ensureAllTablesExist is now safe to call even if tenant_id columns
            // haven't been added yet - it handles index creation failures gracefully
            console.log(`📝 [ChatModal] Ensuring all tables exist...`);
            dbService.ensureAllTablesExist();
            
            // Verify chat_messages table exists
            const tableExists = dbService.query<{ name: string }>(
                `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
                ['chat_messages']
            );
            console.log(`📝 [ChatModal] chat_messages table exists: ${tableExists.length > 0}`);
            
            if (tableExists.length === 0) {
                console.error(`❌ [ChatModal] chat_messages table does not exist after ensureAllTablesExist()`);
                return false;
            }
            
            // Verify table has columns
            const columns = dbService.query<{ name: string }>(`PRAGMA table_info(chat_messages)`);
            console.log(`📝 [ChatModal] chat_messages table columns:`, columns.map(c => c.name));
            
            if (columns.length === 0) {
                console.error(`❌ [ChatModal] chat_messages table has no columns`);
                return false;
            }
            
            console.log(`✅ [ChatModal] Chat database is ready`);
            return true;
        } catch (error) {
            console.error('❌ [ChatModal] Error initializing chat database:', error);
            return false;
        }
    };

    // Connect to WebSocket on mount
    useEffect(() => {
        const token = apiClient.getToken();
        const tenantId = apiClient.getTenantId();
        if (token && tenantId) {
            wsClient.connect(token, tenantId);
        }
        return () => {
            // Don't disconnect on unmount - keep connection alive for other components
        };
    }, []);

    // Listen for incoming chat messages
    useEffect(() => {
        const handleChatMessage = async (data: ChatMessage) => {
            console.log(`📝 [ChatModal] WebSocket message received:`, data);
            
            // Ignore WhatsApp messages (they have different structure)
            if (data.phoneNumber || data.direction || !data.senderId) {
                console.log(`📝 [ChatModal] Message appears to be WhatsApp message, ignoring (ChatModal is for internal chat only)`);
                return;
            }
            
            // Only process messages for current user
            if (data.recipientId === currentUserId || data.senderId === currentUserId) {
                try {
                    console.log(`📝 [ChatModal] Processing message for current user`);
                    const ready = await ensureChatDbReady();
                    console.log(`📝 [ChatModal] Database ready for incoming message: ${ready}`);
                    if (!ready) {
                        console.warn(`⚠️ [ChatModal] Database not ready, skipping message save`);
                        return;
                    }
                    // Save message locally
                    console.log(`📝 [ChatModal] Saving incoming message locally...`);
                    chatRepo.insert(data);
                    console.log(`✅ [ChatModal] Incoming message saved successfully`);
                    
                    // If this message is for the currently selected conversation, update UI
                    if (selectedUserId && (data.senderId === selectedUserId || data.recipientId === selectedUserId)) {
                        console.log(`📝 [ChatModal] Message is for selected conversation, reloading messages`);
                        loadMessages(selectedUserId);
                    }
                    
                    // Refresh conversations list
                    console.log(`📝 [ChatModal] Refreshing conversations list`);
                    await loadConversations();
                } catch (error) {
                    console.error('❌ [ChatModal] Error saving incoming message:', error);
                }
            } else {
                console.log(`📝 [ChatModal] Message not for current user, ignoring`);
            }
        };

        wsClient.on('chat:message', handleChatMessage);

        return () => {
            wsClient.off('chat:message', handleChatMessage);
        };
    }, [currentUserId, selectedUserId]);

    // Load conversations on mount
    useEffect(() => {
        if (isOpen && currentUserId) {
            loadConversations();
        }
    }, [isOpen, currentUserId]);

    // Load messages when user is selected
    useEffect(() => {
        if (selectedUserId && currentUserId) {
            loadMessages(selectedUserId);
        }
    }, [selectedUserId, currentUserId]);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const loadConversations = async () => {
        try {
            const ready = await ensureChatDbReady();
            if (!ready) return;
            const convos = chatRepo.getConversationsForUser(currentUserId);
            setConversations(convos);
        } catch (error) {
            console.error('Error loading conversations:', error);
        }
    };

    const loadMessages = async (otherUserId: string) => {
        try {
            const ready = await ensureChatDbReady();
            if (!ready) return;
            const msgs = chatRepo.getConversation(currentUserId, otherUserId);
            setMessages(msgs);
            // Mark messages as read after loading
            chatRepo.markAsRead(otherUserId, currentUserId);
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedUserId) return;

        const selectedUser = onlineUsers.find(u => u.id === selectedUserId);
        if (!selectedUser) return;

        const messageText = newMessage.trim();
        setNewMessage(''); // Clear input immediately for better UX

        try {
            console.log(`📝 [ChatModal] handleSendMessage called`);
            console.log(`📝 [ChatModal] Message text: ${messageText}`);
            console.log(`📝 [ChatModal] Selected user ID: ${selectedUserId}`);
            console.log(`📝 [ChatModal] Current user ID: ${currentUserId}`);
            
            const ready = await ensureChatDbReady();
            console.log(`📝 [ChatModal] Database ready: ${ready}`);
            if (!ready) throw new Error('Chat database not ready');
            
            // Send message via API (which will broadcast via WebSocket)
            console.log(`📝 [ChatModal] Sending message via API...`);
            const response = await apiClient.post('/tenants/chat/send', {
                recipientId: selectedUserId,
                message: messageText
            });
            console.log(`📝 [ChatModal] API response received:`, response);

            // Message will be received via WebSocket and saved locally
            // But we can also save it locally immediately for instant UI update
            if (response.message) {
                console.log(`📝 [ChatModal] Saving message locally:`, response.message);
                chatRepo.insert(response.message);
                console.log(`✅ [ChatModal] Message saved locally`);
                setMessages([...messages, response.message]);
                await loadConversations();
            } else {
                console.warn(`⚠️ [ChatModal] API response did not include message`);
            }
        } catch (error) {
            console.error('❌ [ChatModal] Error sending message:', error);
            alert('Failed to send message. Please try again.');
            setNewMessage(messageText); // Restore message on error
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const getSelectedUserName = () => {
        if (!selectedUserId) return null;
        return onlineUsers.find(u => u.id === selectedUserId)?.name || 'Unknown';
    };

    const getConversationUser = (conversation: any) => {
        return onlineUsers.find(u => u.id === conversation.otherUserId);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Chat with Online Users" size="lg">
            <div className="flex h-[600px] border border-gray-200 rounded-lg overflow-hidden">
                {/* Users List */}
                <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col">
                    <div className="p-3 border-b border-gray-200 bg-white">
                        <h3 className="font-semibold text-sm text-gray-700">Online Users</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {onlineUsers.length === 0 ? (
                            <div className="p-4 text-center text-sm text-gray-500">
                                No other users online
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-200">
                                {onlineUsers
                                    .filter(u => u.id !== currentUserId)
                                    .map(user => {
                                        const isSelected = selectedUserId === user.id;
                                        const unreadCount = chatRepo.getUnreadCount(currentUserId);
                                        return (
                                            <button
                                                key={user.id}
                                                onClick={() => setSelectedUserId(user.id)}
                                                className={`w-full p-3 text-left hover:bg-gray-100 transition-colors ${
                                                    isSelected ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold">
                                                        {user.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className={`text-sm font-medium truncate ${
                                                            isSelected ? 'text-indigo-700' : 'text-gray-700'
                                                        }`}>
                                                            {user.name}
                                                        </div>
                                                        <div className="text-xs text-gray-500 truncate">
                                                            {user.role}
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 flex flex-col bg-white">
                    {selectedUserId ? (
                        <>
                            {/* Chat Header */}
                            <div className="p-3 border-b border-gray-200 bg-gray-50">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold">
                                        {getSelectedUserName()?.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-gray-700">
                                            {getSelectedUserName()}
                                        </div>
                                        <div className="text-xs text-gray-500">Online</div>
                                    </div>
                                </div>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {messages.length === 0 ? (
                                    <div className="text-center text-gray-500 text-sm py-8">
                                        No messages yet. Start the conversation!
                                    </div>
                                ) : (
                                    messages.map(msg => {
                                        const isOwn = msg.senderId === currentUserId;
                                        return (
                                            <div
                                                key={msg.id}
                                                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div
                                                    className={`max-w-[70%] rounded-lg px-3 py-2 ${
                                                        isOwn
                                                            ? 'bg-indigo-500 text-white'
                                                            : 'bg-gray-100 text-gray-800'
                                                    }`}
                                                >
                                                    {!isOwn && (
                                                        <div className="text-xs font-semibold mb-1 opacity-80">
                                                            {msg.senderName}
                                                        </div>
                                                    )}
                                                    <div className="text-sm whitespace-pre-wrap break-words">
                                                        {msg.message}
                                                    </div>
                                                    <div
                                                        className={`text-xs mt-1 ${
                                                            isOwn ? 'text-indigo-100' : 'text-gray-500'
                                                        }`}
                                                    >
                                                        {new Date(msg.createdAt).toLocaleTimeString([], {
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Message Input */}
                            <div className="p-3 border-t border-gray-200 bg-gray-50">
                                <div className="flex gap-2">
                                    <textarea
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        onKeyPress={handleKeyPress}
                                        placeholder="Type a message..."
                                        rows={2}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-sm"
                                    />
                                    <button
                                        onClick={handleSendMessage}
                                        disabled={!newMessage.trim()}
                                        className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                                    >
                                        Send
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-500">
                            <div className="text-center">
                                <div className="text-4xl mb-4">💬</div>
                                <p className="text-sm">Select a user to start chatting</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default ChatModal;

