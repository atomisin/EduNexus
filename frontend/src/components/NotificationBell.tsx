import React, { useState, useEffect } from 'react';
import { Bell, Check, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { notificationsAPI } from '@/services/api';
import { toast } from 'sonner';

interface Notification {
    id: string;
    title: string;
    message: string;
    created_at: string;
    is_read: boolean;
    type: string;
}

export const NotificationBell = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const loadNotifications = async () => {
        try {
            const data = await notificationsAPI.getAll();
            setNotifications(data);
            setUnreadCount(data.filter((n: Notification) => !n.is_read).length);
        } catch (error) {
            console.error('Failed to load notifications:', error);
        }
    };

    useEffect(() => {
        loadNotifications();
        // Refresh notifications every 60 seconds
        const interval = setInterval(loadNotifications, 60000);
        return () => clearInterval(interval);
    }, []);

    const handleMarkAsRead = async (id: string) => {
        try {
            await notificationsAPI.markAsRead(id);
            loadNotifications();
        } catch (error) {
            toast.error('Failed to mark as read');
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await notificationsAPI.markAllAsRead();
            loadNotifications();
            toast.success('All marked as read');
        } catch (error) {
            toast.error('Failed to mark all as read');
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                    <Bell className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                    {unreadCount > 0 && (
                        <Badge className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center p-0 bg-red-500 border-2 border-white dark:border-slate-900 animate-pulse">
                            {unreadCount}
                        </Badge>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0 border-0 shadow-2xl rounded-2xl overflow-hidden">
                <div className="bg-gradient-to-r from-teal-600 to-teal-700 p-4 text-white">
                    <div className="flex items-center justify-between mb-1">
                        <h4 className="font-bold">Notifications</h4>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1 text-xs text-teal-100 hover:text-white hover:bg-white/10"
                            onClick={handleMarkAllRead}
                        >
                            Mark all as read
                        </Button>
                    </div>
                    <p className="text-xs text-teal-100">You have {unreadCount} unread alerts</p>
                </div>

                <div className="max-h-[400px] overflow-y-auto">
                    {notifications.length === 0 ? (
                        <div className="p-8 text-center">
                            <Bell className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                            <p className="text-sm text-slate-400 italic">No notifications yet</p>
                        </div>
                    ) : (
                        notifications.map((n) => (
                            <div
                                key={n.id}
                                className={`p-4 border-b last:border-0 dark:border-slate-800 transition-colors ${n.is_read ? 'bg-transparent' : 'bg-teal-50/30 dark:bg-teal-900/10'}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <h5 className={`text-sm font-semibold ${n.is_read ? 'text-slate-600 dark:text-slate-300' : 'text-indigo-900 dark:text-teal-100'}`}>
                                        {n.title}
                                    </h5>
                                    {!n.is_read && (
                                        <button
                                            onClick={() => handleMarkAsRead(n.id)}
                                            className="text-teal-600 hover:text-teal-800 p-0.5 rounded-full hover:bg-teal-50"
                                            title="Mark as read"
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
                                    {n.message}
                                </p>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                                    <Clock className="w-3 h-3" />
                                    {new Date(n.created_at).toLocaleString()}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {notifications.length > 0 && (
                    <div className="p-2 bg-slate-50 dark:bg-slate-900 text-center border-t dark:border-slate-800">
                        <Button variant="link" size="sm" className="text-xs text-teal-600">View all notifications</Button>
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
