import React, { useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';

interface LoginPageProps {
  onBack: () => void;
  onSuccess: () => void;
}

export const LoginPage = ({ onBack, onSuccess }: LoginPageProps) => {
  const { login, error, isLoading, user } = useAuth();

  if (user) {
    return (
      <Navigate 
        to={
          user.role === 'teacher' ? '/teacher' : 
          user.role === 'admin' ? '/admin' : '/student'
        } 
        replace 
      />
    );
  }
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('LoginPage: Submitting login for:', email);
    try {
      const success = await login(email, password);
      console.log('LoginPage: Login result:', success);
      if (success) {
        toast.success('Login successful!');
        // Small delay to ensure state and cookies are settled
        setTimeout(() => {
          onSuccess();
        }, 100);
      }
    } catch (err) {
      console.error('LoginPage handler error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-subtle flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-primary/5 pointer-events-none" />

      <Card className="relative w-full max-w-md border border-border shadow-xl">
        <div className="h-1 bg-primary" />
        <CardHeader className="text-center pt-8">
          <Button variant="ghost" onClick={onBack} disabled={isLoading} className="absolute left-4 top-4 text-slate-400 hover:text-slate-600">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </Button>
          <div className="mx-auto mb-4">
            <img src="/edunexus-logo.png" alt="EduNexus" className="h-16 w-auto mx-auto" />
          </div>
          <CardTitle className="text-2xl text-foreground">Welcome Back</CardTitle>
          <CardDescription>Sign in to your EduNexus account</CardDescription>
        </CardHeader>
        <CardContent className="pb-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100 animate-in fade-in slide-in-from-top-1">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="input-premium"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="input-premium"
                required
              />
            </div>

            <Button type="submit" className="w-full btn-primary rounded-xl py-3" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="text-center mt-6">
            <p className="text-sm text-slate-500">
              Don't have an account?{' '}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'register' }))}
                className="text-primary hover:underline font-medium"
              >
                Create Account
              </button>
            </p>
          </div>

        </CardContent>
      </Card>
    </div>
  );
};
