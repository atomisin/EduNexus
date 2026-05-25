import React from 'react';
import { LayoutDashboard, LibraryBig, ChartNoAxesCombined, GraduationCap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ViewType } from '../types';

interface StudentSidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  sidebarOpen: boolean;
  profile?: any;
}

type SidebarNavItem =
  | { id: ViewType; label: string; icon: LucideIcon; avatar?: never; hidden?: boolean }
  | { id: ViewType; label: string; avatar: string; icon?: never; hidden?: boolean };

export const StudentSidebar: React.FC<StudentSidebarProps> = ({
  activeView,
  setActiveView,
  sidebarOpen,
  profile,
}) => {
  const educLevel = (profile?.education_level || '').toLowerCase();
  const currType = (profile?.curriculum_type || '').toLowerCase();
  
  // Robust check for exam tracks
  const isExamStudent = ['jamb', 'waec', 'neco'].includes(currType);
  
  // Professional track is its own thing, but we treat it as "standard" for sidebar tabs
  const isProfessional = educLevel === 'professional';

  const navItems: SidebarNavItem[] = [
    { id: 'dashboard' as ViewType, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'learn' as ViewType, label: 'AI Tutor', avatar: '/avatars/ai_tutor_female.png' },
    { 
      id: 'subjects' as ViewType, 
      label: 'Subjects', 
      icon: LibraryBig, 
      hidden: isExamStudent // Exam students use Mock Exams instead
    },
    { 
      id: 'mock-exams' as ViewType, 
      label: 'Mock Exams', 
      icon: GraduationCap, 
      hidden: !isExamStudent // Only for JAMB, WAEC, NECO
    },
    { id: 'progress' as ViewType, label: 'Progress', icon: ChartNoAxesCombined },
  ].filter(item => !item.hidden);

  return (
    <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 lg:w-60 bg-background border-r border-border transition-transform duration-300 transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="px-5 py-4 flex items-center justify-start border-b border-border/60">
        <img src="/edunexus-logo.png" alt="EduNexus" className="h-16 w-auto" />
      </div>
      <ScrollArea className="flex-1 py-4 px-3">
        <nav id="student-sidebar-navigation" className="space-y-1" aria-label="Student navigation">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            const button = (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50'
                }`}
              >
                {'avatar' in item ? (
                  <img
                    src={item.avatar}
                    alt=""
                    aria-hidden="true"
                    className="h-6 w-6 flex-shrink-0 rounded-full border border-primary/20 object-cover"
                  />
                ) : (
                  <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                )}
                <span className={`${sidebarOpen ? 'inline' : 'sr-only'} font-medium`}>
                  {item.label}
                </span>
              </button>
            );

            return sidebarOpen ? (
              button
            ) : (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
};
