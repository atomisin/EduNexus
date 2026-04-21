import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronLeft, Eye, EyeOff, Loader2 } from 'lucide-react';

interface LoginFormProps {
  onSuccess?: () => void;
  onRegisterClick?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onRegisterClick }) => {
  /*
   - **Login Fix**: The login form now correctly displays descriptive error messages instead of `[object Object]`.
   - **Specialized Alerts**: Added a dedicated, styled alert box for users with `APPROVAL_PENDING` status to provide clear instructions on next steps.
  */
  const { login, error, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [serverWaking, setServerWaking] = useState(false);

  // Listen for server wake-up retry events
  useEffect(() => {
    const handleWaking = () => setServerWaking(true);
    window.addEventListener('api:server_waking', handleWaking);
    return () => window.removeEventListener('api:server_waking', handleWaking);
  }, []);

  // Reset waking state when loading finishes
  useEffect(() => {
    if (!isLoading) setServerWaking(false);
  }, [isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const success = await login(email, password);
    if (success) {
      onSuccess?.();
    }
  };

  return (
    <Card className="w-full max-w-md border border-slate-200 shadow-2xl bg-white dark:bg-slate-950 overflow-hidden">
      <div className="h-1.5 bg-primary" />
      <CardHeader className="text-center pt-8 relative">
        {onRegisterClick && (
          <button 
            type="button" 
            onClick={() => window.location.href = '/'}
            className="absolute left-4 top-10 p-2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <div className="mx-auto mb-6">
          <img src="/edunexus-logo.png" alt="EduNexus" className="h-24 w-auto mx-auto" />
        </div>
        <CardTitle className="text-3xl font-bold tracking-tight mb-2 text-slate-900 dark:text-white">Welcome Back</CardTitle>
        <CardDescription className="text-lg text-slate-500">
          Sign in to your EduNexus account
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2 pb-10 px-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-red-50 text-red-600 text-sm border border-red-100 animate-in fade-in slide-in-from-top-1">
              {typeof error === 'string' 
                ? error 
                : (error as any).detail || (error as any).message || 'An error occurred. Please try again.'}
            </div>
          )}
          {serverWaking && !error && (
            <div className="p-4 rounded-xl bg-amber-50 text-amber-700 text-sm border border-amber-200 animate-in fade-in slide-in-from-top-1 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
              <span>Our server is waking up — this can take up to 30 seconds on the first request. Hang tight!</span>
            </div>
          )}
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-slate-700">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="testss1@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-14 rounded-2xl bg-slate-50/50 border-slate-100 focus:border-primary/30 focus:ring-primary/10 text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-14 rounded-2xl bg-blue-50/30 border-slate-100 focus:border-primary/30 focus:ring-primary/10 text-base"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-14 rounded-full bg-[#35322e] hover:bg-[#2a2825] text-white text-lg font-bold shadow-lg shadow-black/10 transition-all active:scale-[0.98] mt-4"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {serverWaking ? 'Waking server...' : 'Signing in...'}
              </>
            ) : (
              'Sign In'
            )}
          </Button>

          <div className="text-center pt-6">
            <p className="text-base text-slate-500">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={onRegisterClick}
                className="text-slate-900 hover:underline font-bold"
              >
                Create Account
              </button>
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
