import type { User } from '@/contexts/AuthContext';

// Mock users for admin panel - R-05: Separated from production AuthContext
export const mockUsers: User[] = [
  {
    id: '1',
    name: 'Admin User',
    email: 'admin@edunexus.com',
    role: 'admin',
    status: 'approved',
    emailVerified: true,
  },
  {
    id: '2',
    name: 'Teacher User',
    email: 'teacher@edunexus.com',
    role: 'teacher',
    status: 'pending',
    emailVerified: true,
  },
  {
    id: '3',
    name: 'Student User',
    email: 'student@edunexus.com',
    role: 'student',
    status: 'approved',
    emailVerified: true,
  },
];
