import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { warmUpServer } from '@/services/api';

const COLD_START_MESSAGE = 'Please wait...';

interface LoginFormProps {
  onSuccess?: () => void;
  onRegisterClick?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onRegisterClick }) => {
  const { login, error, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [serverWaking, setServerWaking] = useState(false);
  const [serverReady, setServerReady] = useState(false);

  // Pre-warm the backend the moment this form mounts
  // The server starts waking up while the user types credentials
  useEffect(() => {
    let cancelled = false;
    warmUpServer().then(ok => {
      if (!cancelled) setServerReady(ok);
    });
    return () => { cancelled = true; };
  }, []);

  // Listen for server wake-up retry events
  useEffect(() => {
    const handleWaking = () => setServerWaking(true);
    const handleReady = () => setServerWaking(false);
    window.addEventListener('api:server_waking', handleWaking);
    window.addEventListener('api:server_ready', handleReady);
    return () => {
      window.removeEventListener('api:server_waking', handleWaking);
      window.removeEventListener('api:server_ready', handleReady);
    };
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

  // Determine the button label
  const getButtonLabel = () => {
    if (!isLoading) return 'Sign In';
    if (serverWaking) return COLD_START_MESSAGE;
    return 'Signing in...';
  };

  return (
    <Card className="w-full max-w-md border border-slate-200 shadow-none bg-white dark:bg-slate-950 overflow-hidden rounded-lg">
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
            <div className="p-4 rounded-lg bg-amber-50 text-amber-700 text-sm border border-amber-200 animate-in fade-in slide-in-from-top-1 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
              <span>{COLD_START_MESSAGE}</span>
            </div>
          )}
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-slate-700">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-14 rounded-lg bg-slate-50/50 border-slate-100 focus:border-primary/30 focus:ring-primary/10 text-base"
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
                  className="h-14 rounded-lg bg-slate-50/50 border-slate-100 focus:border-primary/30 focus:ring-primary/10 text-base"
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
            className="w-full min-h-14 h-auto rounded-lg bg-primary hover:bg-primary/90 text-white text-base font-bold shadow-none transition-all active:scale-[0.98] mt-4 px-4 py-3"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin shrink-0" />
                <span className="leading-snug">{getButtonLabel()}</span>
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
