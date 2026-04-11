import React from 'react';
import { SubjectList } from './SubjectList';

interface SubjectsViewProps {
  subjects: any[];
  enrolledSubjects: string[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  loading: boolean;
  handleEnroll: (id: string, enrolled: boolean) => Promise<void>;
  materials: any[];
  expandedSubjectId: string | null;
  setExpandedSubjectId: (id: string | null) => void;
  handleDeleteMaterial: (id: string) => Promise<void>;
  user: any;
  profile: any;
  customCourseName: string;
  setCustomCourseName: (name: string) => void;
  isGeneratingCourse: boolean;
  handleGenerateCustomCourse: () => Promise<void>;
  setUploadSubject: (id: string) => void;
  setShowUploadModal: (show: boolean) => void;
}

export const SubjectsView: React.FC<SubjectsViewProps> = (props) => {
  return <SubjectList {...props} />;
};
