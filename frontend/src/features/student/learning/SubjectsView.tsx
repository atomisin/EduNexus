import React from 'react';
import { SubjectList } from './SubjectList';

interface SubjectsViewProps {
  subjects: any[];
  enrolledSubjects: string[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  loading: boolean;
  error?: string | null;
  handleEnroll: (id: string, enrolled: boolean) => Promise<void>;
  user: any;
  profile: any;
  customCourseName: string;
  setCustomCourseName: (name: string) => void;
  isGeneratingCourse: boolean;
  handleGenerateCustomCourse: () => Promise<void>;
}

export const SubjectsView: React.FC<SubjectsViewProps> = (props) => {
  return <SubjectList {...props} />;
};
