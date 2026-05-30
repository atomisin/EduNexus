import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, ChevronLeft, Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { authAPI, warmUpServer } from '@/services/api';
import VerificationSuccess from './VerificationSuccess';

const COLD_START_MESSAGE = 'The learning workspace is waking up. Please give it a few moments.';

interface LoginFormProps {
  onSuccess?: () => void;
  onRegisterClick?: () => void;
  onBackClick?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onRegisterClick, onBackClick }) => {
  const { login, error, isLoading, verificationEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [serverWaking, setServerWaking] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [resetMessage, setResetMessage] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [showVerification, setShowVerification] = useState(false);

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
    if (!isLoading) {
      setServerWaking(false);
      setSubmitting(false);
    }
  }, [isLoading]);

  useEffect(() => {
    if (error?.toLowerCase().includes('verify your email')) {
      setShowVerification(true);
    }
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSubmitting(true);
    try {
      const success = await login(email, password);
      if (success) {
        onSuccess?.();
      } else if (verificationEmail || error?.toLowerCase().includes('verify your email')) {
        setShowVerification(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (showVerification) {
    return (
      <VerificationSuccess
        email={verificationEmail || email}
        verificationToken="code-verification"
        verificationSent
        onContinue={() => setShowVerification(false)}
      />
    );
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetStatus('idle');
    setResetMessage('');

    if (!resetEmail.includes('@')) {
      setResetStatus('error');
      setResetMessage('Please enter the email address on your EduNexus account.');
      return;
    }

    setResetLoading(true);
    try {
      await authAPI.forgotPassword({ email: resetEmail });
      setResetStatus('sent');
      setResetMessage('If this email is registered, a password reset link has been sent.');
    } catch (err: any) {
      setResetStatus('error');
      setResetMessage(err.message || 'Could not request password reset. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  // Determine the button label
  const getButtonLabel = () => {
    if (!submitting) return 'Sign In';
    if (serverWaking) return COLD_START_MESSAGE;
    return 'Signing in...';
  };

  return (
    <Card className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-background shadow-none">
      <div className="h-1.5 bg-primary" />
      <CardHeader className="text-center pt-8 relative">
        {onRegisterClick && (
          <button 
            type="button" 
            onClick={() => onBackClick?.()}
            className="absolute left-4 top-10 p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <div className="mx-auto mb-5 sm:mb-6">
          <img src="/edunexus-logo.png" alt="EduNexus" className="mx-auto h-20 w-auto sm:h-24" />
        </div>
        <CardTitle className="mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {forgotMode ? 'Reset Password' : 'Welcome back'}
        </CardTitle>
        <CardDescription className="text-base leading-relaxed text-muted-foreground">
          {forgotMode ? 'Enter your account email and we will send a secure reset link.' : 'Sign in and pick up where you left off.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-8 pt-2 sm:px-8 sm:pb-10">
        {forgotMode ? (
          <form onSubmit={handleForgotPassword} className="space-y-6">
            {resetMessage && (
              <div className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${
                resetStatus === 'sent'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-100 bg-red-50 text-red-600'
              }`}>
                {resetStatus === 'sent' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{resetMessage}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="resetEmail" className="text-sm font-semibold text-foreground">Email</Label>
              <div className="relative">
                <Input
                  id="resetEmail"
                  type="email"
                  placeholder="Email address"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  className="h-13 rounded-lg border-border bg-subtle pl-12 text-base focus-visible:ring-primary/20 sm:h-14"
                />
                <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full min-h-14 h-auto rounded-lg bg-primary hover:bg-primary/90 text-white text-base font-bold shadow-none transition-all active:scale-[0.98] px-4 py-3"
              disabled={resetLoading}
            >
              {resetLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin shrink-0" />
                  Sending reset link...
                </>
              ) : (
                'Send Reset Link'
              )}
            </Button>

            <button
              type="button"
              onClick={() => {
                setForgotMode(false);
                setResetStatus('idle');
                setResetMessage('');
              }}
              className="mx-auto block text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              Back to sign in
            </button>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="animate-in fade-in slide-in-from-top-1 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
              {typeof error === 'string' 
                ? error 
                : (error as any).detail || (error as any).message || 'An error occurred. Please try again.'}
            </div>
          )}
          {serverWaking && !error && (
            <div className="animate-in fade-in slide-in-from-top-1 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
              <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
              <span>{COLD_START_MESSAGE}</span>
            </div>
          )}
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-13 rounded-lg border-border bg-subtle text-base focus-visible:ring-primary/20 sm:h-14"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-foreground">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-13 rounded-lg border-border bg-subtle text-base focus-visible:ring-primary/20 sm:h-14"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setForgotMode(true);
                  setResetEmail(email);
                }}
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                Forgot password?
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full min-h-14 h-auto rounded-lg bg-primary hover:bg-primary/90 text-white text-base font-bold shadow-none transition-all active:scale-[0.98] mt-4 px-4 py-3"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin shrink-0" />
                <span className="leading-snug">{getButtonLabel()}</span>
              </>
            ) : (
              'Sign In'
            )}
          </Button>

          <div className="text-center pt-6">
            <p className="text-base text-muted-foreground">
              New here?{' '}
              <button
                type="button"
                onClick={onRegisterClick}
                className="font-bold text-primary underline-offset-4 hover:underline"
              >
                Create an account
              </button>
            </p>
          </div>
        </form>
        )}
      </CardContent>
    </Card>
  );
};







