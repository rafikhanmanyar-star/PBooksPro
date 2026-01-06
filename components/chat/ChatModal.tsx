import React, { useState, useEffect, useRef } from 'react';
import Modal from '../ui/Modal';
import { ChatMessagesRepository } from '../../services/database/repositories';
import { useAuth } from '../../context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import { apiClient } from '../../services/api/client';
import { getWebSocketClient } from '../../services/websocket/websocketClient';

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

    // Connect to WebSocket on mount
    useEffect(() => {
        wsClient.connect();
        return () => {
            // Don't disconnect on unmount - keep connection alive for other components
        };
    }, []);

    // Listen for incoming chat messages
    useEffect(() => {
        const handleChatMessage = (data: ChatMessage) => {
            // Only process messages for current user
            if (data.recipientId === currentUserId || data.senderId === currentUserId) {
                try {
                    // Save message locally
                    chatRepo.insert(data);
                    
                    // If this message is for the currently selected conversation, update UI
                    if (selectedUserId && (data.senderId === selectedUserId || data.recipientId === selectedUserId)) {
                        loadMessages(selectedUserId);
                    }
                    
                    // Refresh conversations list
                    loadConversations();
                } catch (error) {
                    console.error('Error saving incoming message:', error);
                }
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
            // Mark messages as read
            chatRepo.markAsRead(selectedUserId, currentUserId);
        }
    }, [selectedUserId, currentUserId]);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const loadConversations = () => {
        try {
            const convos = chatRepo.getConversationsForUser(currentUserId);
            setConversations(convos);
        } catch (error) {
            console.error('Error loading conversations:', error);
        }
    };

    const loadMessages = (otherUserId: string) => {
        try {
            const msgs = chatRepo.getConversation(currentUserId, otherUserId);
            setMessages(msgs);
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
            // Send message via API (which will broadcast via WebSocket)
            const response = await apiClient.post('/tenants/chat/send', {
                recipientId: selectedUserId,
                message: messageText
            });

            // Message will be received via WebSocket and saved locally
            // But we can also save it locally immediately for instant UI update
            if (response.message) {
                chatRepo.insert(response.message);
                setMessages([...messages, response.message]);
                loadConversations();
            }
        } catch (error) {
            console.error('Error sending message:', error);
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

