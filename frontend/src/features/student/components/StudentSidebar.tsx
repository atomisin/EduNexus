import React from 'react';
import { Home, Trophy, BookMarked, Brain, FileText, GraduationCap } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ViewType } from '../types';

interface StudentSidebarProps {
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;
  sidebarOpen: boolean;
  profile?: any;
}

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

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'learn', label: 'AI Tutor', icon: Brain },
    { 
      id: 'quiz', 
      label: 'Practice Quiz', 
      icon: FileText, 
      hidden: isExamStudent // Exam students use Mock Exams instead
    },
    { 
      id: 'subjects', 
      label: 'Subjects', 
      icon: BookMarked, 
      hidden: isExamStudent // Exam students use Mock Exams instead
    },
    { 
      id: 'mock-exams', 
      label: 'Mock Exams', 
      icon: GraduationCap, 
      hidden: !isExamStudent // Only for JAMB, WAEC, NECO
    },
    { id: 'progress', label: 'Progress', icon: Trophy },
  ].filter(item => !item.hidden);

  return (
    <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-background border-r border-border transition-transform duration-300 transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="p-5 flex items-center justify-start">
        <img src="/edunexus-logo.png" alt="EduNexus" className="h-[100px] w-auto" />
      </div>
      <ScrollArea className="flex-1 py-4 px-3">
        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id as ViewType)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                activeView === item.id
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/50'
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span className="font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
};
