import React, { useState } from 'react';
import { Menu, Zap, User as UserIcon, MessageSquare, LogOut } from 'lucide-react';
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
  const firstName = (getFullName() || 'Student').split(' ')[0] || 'Student';

  return (
    <header className="bg-background border-b border-border px-2 sm:px-4 md:px-5 h-14 sm:h-16 flex items-center justify-between shrink-0 gap-1.5 sm:gap-3 overflow-visible">
      <div className="min-w-0 flex items-center gap-1.5 sm:gap-3 flex-1">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="w-8 h-8 shrink-0">
          <Menu className="w-4 h-4" />
        </Button>
        <div className="min-w-0 flex-1 max-w-[48vw] min-[390px]:max-w-[54vw] sm:max-w-[56vw] md:max-w-none overflow-hidden">
          <h1 className="text-sm min-[380px]:text-[15px] md:text-lg font-semibold truncate leading-tight">
            <span>Hello, {firstName}</span>
          </h1>
          <p className="text-[11px] text-muted-foreground hidden md:block leading-4 truncate">
            {getAgeAppropriateGreeting(profile?.age)}
          </p>
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-1.5 sm:gap-2 md:gap-3">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-amber-100 rounded-full border border-amber-200">
          <Zap className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-700">{profile?.current_streak || 0} day streak</span>
        </div>
        <NotificationBell />
        <ThemeToggle />
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border border-border hover:border-primary transition-colors"
          >
            <Avatar className="w-full h-full">
              <AvatarImage src={avatarUrl || user?.avatar_url || profile?.avatar_url || user?.avatar} />
              <AvatarFallback>{user?.name?.[0] || user?.full_name?.[0] || 'S'}</AvatarFallback>
            </Avatar>
          </button>

          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowUserMenu(false)}
              />
              <div className="absolute right-0 top-11 z-20 w-48 rounded-lg border border-border bg-background shadow-lg py-1">
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
