import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { ReactNode } from 'react';
import { authAPI, userAPI } from '@/services/api';

export interface User {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email: string;
  role: 'admin' | 'teacher' | 'student' | 'parent' | null;
  avatar?: string;
  avatar_url?: string;
  level?: string;
  subjects?: string[];
  status?: 'pending' | 'approved' | 'suspended';
  emailVerified?: boolean;
  emailVerificationToken?: string;
  emailVerificationExpires?: string;
  createdAt?: string;
  phone?: string;
  address?: string;
  bio?: string;
  gamification?: {
    xp?: number;
    level?: number;
    current_streak?: number;
    longest_streak?: number;
    badges?: string[];
    impact_score?: number;
  };
}

export interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  register: (userData: RegisterData) => Promise<{ success: boolean; verificationSent?: boolean; email?: string }>;
  verifyEmail: (code: string, email: string) => Promise<boolean>;
  resendVerificationEmail: (email: string) => Promise<boolean>;
  completePasswordChange: (newPassword: string) => Promise<boolean>;
  isLoading: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  error: string | null;
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: 'admin' | 'teacher' | 'student' | null;
  educationLevel?: string;
  subjects?: string[];
  phoneNumber?: string;
  address?: string;
  bio?: string;
  gender?: string;
  dateOfBirth?: string;
  courseName?: string;
  gradeLevel?: string;
  schoolName?: string;
  yearsOfExperience?: string;
  specialization?: string;
  department?: string;
  guardianName?: string;
  guardianEmail?: string;
  guardianPhone?: string;
  enrolledSubjects?: string[];
  educationCategory?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('edunexus_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!localStorage.getItem('edunexus_user'));
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // C-05: Load user status from API via cookie on mount
  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      try {
        const freshUser = await userAPI.getMe({ silentAuth: true });
        if (freshUser) {
          const loggedInUser: User = {
            id: freshUser.id,
            name: freshUser.first_name || freshUser.full_name?.split(' ')[0] || 'User',
            first_name: freshUser.first_name,
            last_name: freshUser.last_name,
            full_name: freshUser.full_name,
            email: freshUser.email,
            role: (freshUser.role || 'student').toLowerCase() as any,
            avatar: freshUser.avatar_url,
            avatar_url: freshUser.avatar_url,
            gamification: freshUser.gamification || {},
            emailVerified: freshUser.email_verified_at ? true : false,
          };
          setUser(loggedInUser);
          setIsAuthenticated(true);
          setMustChangePassword(freshUser.force_password_change || false);
        }
      } catch (err) {
        console.log('No active session found (C-05)');
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  // Save minimal user info to localStorage whenever it changes
  useEffect(() => {
    if (user) {
      // Prune to only display fields for UI persistency
      const prunedUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        first_name: user.first_name,
        avatar_url: user.avatar_url
      };
      localStorage.setItem('edunexus_user', JSON.stringify(prunedUser));
    } else {
      localStorage.removeItem('edunexus_user');
    }
  }, [user]);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('Login: Calling API with email:', email);
      // Call backend API
      const response = await authAPI.login(email, password);
      console.log('Login: API Response:', response);

      if (response && response.user_id) {
        // C-05: Tokens are in httpOnly cookies.
        
        const userRole = (response.role || 'student').toLowerCase();
        const loggedInUser: User = {
          id: response.user_id,
          name: response.first_name || response.full_name?.split(' ')[0] || 'User',
          first_name: response.first_name,
          last_name: response.last_name,
          full_name: response.full_name,
          email: email,
          role: userRole as any,
          avatar: response.avatar_url,
          avatar_url: response.avatar_url,
          status: (response.status?.toLowerCase() === 'active' || response.status?.toLowerCase() === 'approved') ? 'approved' : 'pending',
          emailVerified: response.email_verified || false,
          gamification: response.gamification,
        };

        setUser(loggedInUser);
        setIsAuthenticated(true);
        setMustChangePassword(response.force_password_change || false);
        
        // Optimistically update localStorage before resolve so navigation sees it
        localStorage.setItem('edunexus_user', JSON.stringify({
            id: loggedInUser.id,
            email: loggedInUser.email,
            name: loggedInUser.name,
            role: loggedInUser.role,
            avatar_url: loggedInUser.avatar_url
        }));

        toast.success(`Welcome back, ${loggedInUser.first_name || loggedInUser.name}!`);
        return true;
      }

      setError('Invalid email or password.');
      return false;
    } catch (err: any) {
      console.log('Login error raw:', err);
      console.log('Login error message:', err.message);
      
      let errorMessage = 'Login failed. Please try again.';
      let errorCode = null;

      try {
        // Try to parse the error message if it's a stringified JSON object
        const detail = JSON.parse(err.message);
        if (detail?.code) {
          errorCode = detail.code;
          if (detail.message) errorMessage = detail.message;
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        }
      } catch (e) {
        // Not a JSON string, use the raw message
        errorMessage = err.message || errorMessage;
      }
      
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData: RegisterData): Promise<{ success: boolean; verificationSent?: boolean; email?: string }> => {
    setIsLoading(true);
    setError(null);

    try {
      let response;
      const generateUsername = (firstName: string, lastName: string) => {
        const base = `${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/[^a-z0-9]/g, '');
        const suffix = Math.floor(1000 + Math.random() * 9000);
        return `${base}${suffix}`;
      };

      const username = generateUsername(userData.firstName, userData.lastName);

      const calculateAge = (dob: string): number => {
        const birth = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
          age--;
        }
        return age;
      };

      if (userData.role === 'student') {
        const clean = (val: any) => val === '' ? undefined : val;

        const studentPayload: any = {
          email: userData.email,
          username: username,
          password: userData.password,
          first_name: userData.firstName,
          last_name: userData.lastName,
          education_level: clean(userData.educationLevel),
          course_name: clean(userData.courseName),
          gender: clean(userData.gender),
          grade_level: clean(userData.gradeLevel),
          school_name: clean(userData.schoolName),
          phone_number: clean(userData.phoneNumber),
          department: clean(userData.department),
          guardian_name: clean(userData.guardianName),
          guardian_email: clean(userData.guardianEmail),
          guardian_phone: clean(userData.guardianPhone),
          enrolled_subjects: userData.enrolledSubjects || [],
          education_category: clean(userData.educationCategory),
        };
        
        if (userData.dateOfBirth) {
          studentPayload.age = calculateAge(userData.dateOfBirth);
        }
        
        response = await authAPI.registerStudent(studentPayload);
      } else if (userData.role === 'teacher') {
        response = await authAPI.registerTeacher({
          email: userData.email,
          username: username,
          password: userData.password,
          first_name: userData.firstName,
          last_name: userData.lastName,
          subjects_taught: userData.subjects,
          specialization: userData.specialization || userData.subjects?.[0],
          phone_number: userData.phoneNumber,
          years_of_experience: userData.yearsOfExperience ? parseInt(userData.yearsOfExperience) : undefined,
        });
      } else {
        // Generic registration
        response = await authAPI.register({
          email: userData.email,
          username: username,
          password: userData.password,
          first_name: userData.firstName,
          last_name: userData.lastName,
          role: userData.role || 'student',
          phone_number: userData.phoneNumber,
        });
      }

      if (response && response.user_id) {
        return {
          success: true,
          verificationSent: response.verification_sent || false,
          email: userData.email,
        };
      }

      return { success: false };
    } catch (err: any) {
      let errorMessage = 'Registration failed. Please try again.';

      if (err.response?.data?.detail) {
        errorMessage = Array.isArray(err.response.data.detail)
          ? err.response.data.detail.map((e: any) => e.msg || e.message || JSON.stringify(e)).join(', ')
          : err.response.data.detail;
      } else if (err.message) {
        errorMessage = err.message;
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      }

      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    // C-05: Coordinate with backend to clear cookie
    authAPI.logout().catch(err => console.error('Logout sync failed:', err));
    localStorage.removeItem('edunexus_token');
    setUser(null);
    setIsAuthenticated(false);
    setMustChangePassword(false);
    setError(null);
  };

  // Send verification email
  const sendVerificationEmail = async (_email: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      // This is handled automatically during registration now
      return true;
    } catch (err) {
      setError('Failed to send verification email. Please try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Verify email with code
  const verifyEmail = async (code: string, email: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      await authAPI.verifyEmail({ email, code });
      return true;
    } catch (err: any) {
      setError(err.message || 'Email verification failed. Please try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Resend verification email
  const resendVerificationEmail = async (email: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      await authAPI.resendVerification({ email });
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification email. Please try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const completePasswordChange = async (newPassword: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await authAPI.changePassword({ new_password: newPassword });
      setMustChangePassword(false);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        login,
        logout,
        register,
        verifyEmail,
        resendVerificationEmail,
        completePasswordChange,
        isLoading,
        isAuthenticated,
        mustChangePassword,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};


