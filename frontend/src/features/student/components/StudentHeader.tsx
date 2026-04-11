import React, { useState } from 'react';
import { Menu, Zap, Sun, Moon, User as UserIcon, MessageSquare, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { NotificationBell } from '@/components/NotificationBell';
import ThemeToggle from '@/components/ThemeToggle';
import type { ViewType } from '../types';

interface StudentHeaderProps {
  user: any;
  profile: any;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  onLogout: () => void;
  setActiveView: (view: ViewType) => void;
  getFullName: () => string;
  getAgeAppropriateGreeting: (age?: number) => string;
  avatarUrl: string | null;
}

export const StudentHeader: React.FC<StudentHeaderProps> = ({
  user,
  profile,
  sidebarOpen,
  setSidebarOpen,
  onLogout,
  setActiveView,
  getFullName,
  getAgeAppropriateGreeting,
  avatarUrl,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);


  return (
    <header className="bg-background border-b border-border px-6 py-0.5 h-12 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="w-8 h-8">
          <Menu className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-base md:text-lg font-bold line-clamp-1 leading-none">
            Hello, {getFullName()}! 👋
          </h1>
          <p className="text-[10px] text-muted-foreground hidden sm:block leading-none mt-0.5">
            {getAgeAppropriateGreeting(profile?.age)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-100 to-orange-100 rounded-full border border-amber-200">
          <Zap className="w-5 h-5 text-amber-600" />
          <span className="font-semibold text-amber-700">{profile?.current_streak || 0} day streak!</span>
        </div>
        <NotificationBell />
        <ThemeToggle />
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-border hover:border-primary transition-colors"
          >
            <Avatar className="w-full h-full">
              <AvatarImage src={avatarUrl || user?.avatar_url || profile?.avatar_url || user?.avatar} />
              <AvatarFallback>{user?.name?.[0] || user?.full_name?.[0]}</AvatarFallback>
            </Avatar>
          </button>

          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowUserMenu(false)}
              />
              <div className="absolute right-0 top-11 z-20 w-48 rounded-xl border border-border bg-background shadow-lg py-1">
                <button
                  onClick={() => {
                    setActiveView('profile');
                    setShowUserMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-secondary transition-colors"
                >
                  <UserIcon className="w-4 h-4" />
                  My Profile
                </button>
                <button
                  onClick={() => {
                    setActiveView('messages');
                    setShowUserMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-secondary transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  Messages
                </button>
                <div className="border-t border-border my-1" />
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
