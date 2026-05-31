import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Search, User, Paperclip, Smile, Shield, CheckCircle2, Clock, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { messageAPI } from '@/services/api';
import { toast } from 'sonner';

interface Contact {
    user_id: string;
    name: string;
    email?: string;
    role: string;
    last_message: string;
    last_message_time: string;
    unread_count: number;
    avatar_url?: string;
}

interface Message {
    id: string;
    sender_id: string;
    recipient_id: string;
    content: string;
    created_at: string;
    is_read: boolean;
}

export const MessagingView = ({ currentUser }: { currentUser: any }) => {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const conversationsLoadingRef = useRef(false);
    const messagesLoadingRef = useRef(false);

    const formatRole = (role?: string) => {
        const value = String(role || '').replace(/_/g, ' ').trim();
        if (!value) return 'Contact';
        return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    };

    const loadConversations = useCallback(async () => {
        if (document.visibilityState === 'hidden') return;
        if (conversationsLoadingRef.current) return;
        conversationsLoadingRef.current = true;
        try {
            const data = await messageAPI.getConversations();
            setContacts(data);
        } catch (error) {
            console.error('Failed to load conversations:', error);
        } finally {
            conversationsLoadingRef.current = false;
        }
    }, []);

    const loadMessages = useCallback(async (userId: string) => {
        if (document.visibilityState === 'hidden') return;
        if (messagesLoadingRef.current) return;
        messagesLoadingRef.current = true;
        setLoading(true);
        try {
            const data = await messageAPI.getMessages(userId);
            setMessages(data);
        } catch (error) {
            console.error('Failed to load messages:', error);
        } finally {
            messagesLoadingRef.current = false;
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadConversations();
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                loadConversations();
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [loadConversations]);

    useEffect(() => {
        if (selectedContact) {
            loadMessages(selectedContact.user_id);
            const interval = setInterval(() => {
                if (document.visibilityState === 'visible') {
                    loadMessages(selectedContact.user_id);
                }
            }, 15000);
            return () => clearInterval(interval);
        }
    }, [loadMessages, selectedContact]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedContact || !newMessage.trim()) return;

        const tempMsg = newMessage;
        setNewMessage('');
        try {
            await messageAPI.sendMessage(selectedContact.user_id, tempMsg);
            loadMessages(selectedContact.user_id);
            loadConversations();
        } catch (error) {
            toast.error('Failed to send message');
            setNewMessage(tempMsg);
        }
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.length > 2) {
            try {
                const data = await messageAPI.searchContacts(query);
                setSearchResults(data);
            } catch (error) {
                console.error('Search failed:', error);
            }
        } else {
            setSearchResults([]);
        }
    };

    const startConversation = (user: any) => {
            const contact: Contact = {
                user_id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                last_message: '',
                last_message_time: new Date().toISOString(),
                unread_count: 0
        };
        setSelectedContact(contact);
        setSearchQuery('');
        setSearchResults([]);
        if (!contacts.find(c => c.user_id === user.id)) {
            setContacts([contact, ...contacts]);
        }
    };

    return (
        <div className="flex h-[calc(100vh-8rem)] min-h-0 gap-6 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Sidebar - Contact List */}
            <Card className="flex min-h-0 w-80 shrink-0 flex-col overflow-hidden rounded-3xl border-0 bg-white/50 shadow-2xl backdrop-blur-xl dark:bg-slate-900/50">
                <div className="shrink-0 p-6 border-b dark:border-slate-800">
                    <h2 className="text-2xl font-black mb-4 italic tracking-tight text-slate-900 dark:text-slate-100">Messages</h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search contacts..."
                            className="pl-10 rounded-2xl bg-slate-50 border-0 focus-visible:ring-teal-500 dark:bg-slate-800"
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {searchQuery.length > 2 && searchResults.length > 0 ? (
                        <div className="p-2 space-y-1">
                            <p className="text-[10px] uppercase font-bold text-slate-400 px-3 py-1 tracking-widest">Search Results</p>
                            {searchResults.map((user) => (
                                <button
                                    key={user.id}
                                    onClick={() => startConversation(user)}
                                    className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-all text-left"
                                >
                                        <Avatar className="w-10 h-10 border border-slate-100 dark:border-slate-800">
                                            <AvatarImage src={user.avatar_url} />
                                            <AvatarFallback className="bg-teal-100 text-teal-600 font-bold">{(user.name || '?')[0]}</AvatarFallback>
                                        </Avatar>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{user.name}</p>
                                        <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{user.email}</p>
                                        <p className="text-[10px] text-teal-500 font-bold uppercase tracking-tighter">{formatRole(user.role)}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : searchQuery.length > 2 ? (
                        <div className="px-5 py-12 text-center">
                            <Search className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No matching contacts</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Try a teacher, student, or admin name instead.
                            </p>
                        </div>
                    ) : (
                        <div className="p-2 space-y-1">
                            {contacts.map((contact) => (
                                <button
                                    key={contact.user_id}
                                    onClick={() => setSelectedContact(contact)}
                                    className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-all relative group ${selectedContact?.user_id === contact.user_id
                                        ? 'bg-teal-600 text-white shadow-lg shadow-teal-200 dark:shadow-none'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                                        }`}
                                >
                                    <Avatar className="w-12 h-12 border-2 border-white dark:border-slate-700 shadow-sm">
                                        <AvatarImage src={contact.avatar_url} />
                                        <AvatarFallback className={`${selectedContact?.user_id === contact.user_id ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-600'} font-bold`}>
                                            {(contact.name || '?')[0]}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-0.5">
                                            <p className={`font-bold text-sm truncate ${selectedContact?.user_id === contact.user_id ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>
                                                {contact.name}
                                            </p>
                                            <span className={`text-[10px] ${selectedContact?.user_id === contact.user_id ? 'text-teal-100' : 'text-slate-400'}`}>
                                                {contact.last_message_time ? new Date(contact.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </span>
                                        </div>
                                        <p className={`text-[10px] truncate ${selectedContact?.user_id === contact.user_id ? 'text-teal-100/90' : 'text-slate-400'}`}>
                                            {contact.email || formatRole(contact.role)}
                                        </p>
                                        <p className={`text-xs truncate ${selectedContact?.user_id === contact.user_id ? 'text-teal-100' : 'text-slate-500'}`}>
                                            {contact.last_message || "Start a conversation..."}
                                        </p>
                                    </div>
                                    {contact.unread_count > 0 && selectedContact?.user_id !== contact.user_id && (
                                        <Badge className="absolute top-4 right-4 bg-teal-500 border-2 border-white dark:border-slate-900 rounded-full w-5 h-5 flex items-center justify-center p-0 text-[10px]">
                                            {contact.unread_count}
                                        </Badge>
                                    )}
                                </button>
                            ))}
                            {contacts.length === 0 && !searchQuery && (
                                <div className="py-20 text-center opacity-30 italic">
                                    <User className="w-12 h-12 mx-auto mb-2" />
                                    <p className="text-sm">No conversations yet</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Card>

            {/* Main Chat Window */}
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border-0 bg-white/50 shadow-2xl backdrop-blur-xl dark:bg-slate-900/50">
                {selectedContact ? (
                    <>
                        {/* Chat Header */}
                        <div className="shrink-0 p-6 border-b dark:border-slate-800 flex items-center justify-between bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
                            <div className="flex items-center gap-4">
                                    <Avatar className="w-12 h-12 border-2 border-teal-100 dark:border-slate-700 shadow-sm">
                                        <AvatarImage src={selectedContact.avatar_url} />
                                    <AvatarFallback className="bg-teal-600 text-white font-bold">{(selectedContact.name || '?')[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                        {selectedContact.name}
                                        <Badge variant="secondary" className="text-[10px] h-4 font-bold bg-teal-50 text-teal-600 dark:bg-teal-900/30 uppercase tracking-tighter">
                                            {formatRole(selectedContact.role)}
                                        </Badge>
                                    </h3>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-xs text-slate-400 font-medium">{selectedContact.email || formatRole(selectedContact.role)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="relative min-h-0 flex-1 overflow-hidden p-6">
                            <div className="h-full overflow-y-auto overscroll-contain pr-4">
                                <div className="space-y-6">
                                    {messages.map((m, i) => {
                                        const isMe = m.sender_id === currentUser.id;
                                        const showDate = i === 0 || new Date(messages[i - 1].created_at).toDateString() !== new Date(m.created_at).toDateString();

                                        return (
                                            <React.Fragment key={m.id}>
                                                {showDate && (
                                                    <div className="flex justify-center my-8">
                                                        <div className="px-4 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                            {new Date(m.created_at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                                                        </div>
                                                    </div>
                                                )}
                                                <div className={`flex w-full min-w-0 ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-${isMe ? 'right' : 'left'}-4 duration-300`}>
                                                    <div className="group min-w-0 max-w-[86%] sm:max-w-[70%]">
                                                        <div className={`break-words p-4 rounded-3xl shadow-sm text-sm leading-relaxed [overflow-wrap:anywhere] ${isMe
                                                            ? 'bg-teal-600 text-white rounded-tr-none'
                                                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-tl-none border border-slate-100 dark:border-slate-700'
                                                            }`}>
                                                            {m.content}
                                                        </div>
                                                        <div className={`flex items-center gap-1.5 mt-2 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                            <span className="text-[10px] font-bold text-slate-400">
                                                                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                            {isMe && (
                                                                m.is_read
                                                                    ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                                                    : <CheckCircle2 className="w-3 h-3 text-slate-300" />
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </React.Fragment>
                                        );
                                    })}
                                    {loading && (
                                        <div className="flex justify-center py-4">
                                            <Clock className="w-5 h-5 text-teal-500 animate-spin" />
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                            </div>
                        </div>

                        {/* Chat Input */}
                        <div className="shrink-0 p-6 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
                            <form onSubmit={handleSendMessage} className="relative flex items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700">
                                <Button type="button" variant="ghost" size="icon" className="rounded-xl text-slate-400 hover:text-teal-600"><Paperclip className="w-5 h-5" /></Button>
                                <Input
                                    placeholder="Type a message..."
                                    className="flex-1 bg-transparent border-0 focus-visible:ring-0 shadow-none text-sm"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                />
                                <Button type="button" variant="ghost" size="icon" className="rounded-xl text-slate-400 hover:text-teal-600"><Smile className="w-5 h-5" /></Button>
                                <Button type="submit" disabled={!newMessage.trim()} className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-4 py-2 flex items-center gap-2 font-bold shadow-lg shadow-teal-200 dark:shadow-none transition-all hover:scale-105 active:scale-95">
                                    <Send className="w-4 h-4" />
                                    <span>Send</span>
                                </Button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center p-12 text-center">
                        <div className="max-w-md space-y-6">
                            <div className="relative inline-block">
                                <div className="absolute inset-0 bg-teal-500/20 blur-3xl rounded-full" />
                                <div className="relative w-24 h-24 bg-gradient-to-tr from-teal-600 to-teal-400 rounded-3xl flex items-center justify-center shadow-2xl mx-auto rotate-12">
                                    <MessageSquare className="w-12 h-12 text-white" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-black italic text-slate-900 dark:text-slate-100">Select a conversation</h2>
                                <p className="text-slate-500 leading-relaxed">
                                    Start a direct chat with a learner, teacher, or administrator to share updates, ask questions, or follow up on support.
                                </p>
                            </div>
                            <div className="flex justify-center gap-6 pt-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                <span className="flex items-center gap-2"><Shield className="w-3 h-3 text-teal-500" /> Secure Chat</span>
                                <span className="flex items-center gap-2"><MessageSquare className="w-3 h-3 text-teal-500" /> Direct Messaging</span>
                            </div>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
};
