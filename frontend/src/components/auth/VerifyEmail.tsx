import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle, Loader2, Mail, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface VerifyEmailProps {
  token: string | null;
  onBack: () => void;
  onLogin: () => void;
}

export const VerifyEmail: React.FC<VerifyEmailProps> = ({ token, onBack, onLogin }) => {
  const { verifyEmail, isLoading, error } = useAuth();
  const [searchParams] = useSearchParams();
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const codeFromUrl = searchParams.get('code') || '';
  const emailFromUrl = searchParams.get('email') || '';
  const verificationCode = token || codeFromUrl;

  useEffect(() => {
    if (verificationCode && emailFromUrl) {
      void handleVerify();
    }
  }, [verificationCode, emailFromUrl]);

  const handleVerify = async () => {
    if (!verificationCode || !emailFromUrl) return;

    try {
      const success = await verifyEmail(verificationCode, emailFromUrl);
      if (success) {
        setVerificationStatus('success');
        toast.success('Email confirmed successfully.');
      } else {
        setVerificationStatus('error');
        setVerificationError(error || 'We were unable to confirm this email.');
      }
    } catch (err: any) {
      setVerificationStatus('error');
      setVerificationError(err.message || 'We were unable to confirm this email.');
    }
  };

  if (!verificationCode || !emailFromUrl) {
    return (
      <div className="min-h-screen bg-subtle flex items-center justify-center p-4">
        <Card className="w-full max-w-md rounded-lg border border-border bg-background shadow-none">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-9 h-9 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Invalid link</CardTitle>
            <CardDescription>
              This verification link is incomplete or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={onBack} className="w-full btn-primary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (verificationStatus === 'pending' || isLoading) {
    return (
      <div className="min-h-screen bg-subtle flex items-center justify-center p-4">
        <Card className="w-full max-w-md rounded-lg border border-border bg-background shadow-none">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-9 h-9 text-primary animate-spin" />
            </div>
            <CardTitle className="text-2xl">Confirming your email</CardTitle>
            <CardDescription>
              Please wait while we confirm your email address.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (verificationStatus === 'error') {
    return (
      <div className="min-h-screen bg-subtle flex items-center justify-center p-4">
        <Card className="w-full max-w-md rounded-lg border border-border bg-background shadow-none">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-9 h-9 text-destructive" />
            </div>
            <CardTitle className="text-2xl">We could not confirm this email</CardTitle>
            <CardDescription>
              {verificationError || 'We were unable to confirm this email. The link may have expired.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>
                Please request a new verification email or contact support if this keeps happening.
              </AlertDescription>
            </Alert>
            <Button onClick={onBack} variant="outline" className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-subtle flex items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-lg border border-border bg-background shadow-none">
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-9 h-9 text-emerald-600" />
          </div>
          <CardTitle className="text-2xl">Email confirmed</CardTitle>
          <CardDescription>
            Your email has been confirmed successfully.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
            <div className="flex items-center gap-2 text-primary mb-2">
              <Mail className="w-5 h-5" />
              <span className="font-medium">What happens next</span>
            </div>
            <div className="space-y-2 text-sm text-foreground/80">
              <p>Your email is now confirmed.</p>
              <p>Your account will move through the final approval step.</p>
              <p>You will receive an email once access is ready.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={onBack} variant="outline" className="flex-1">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to home
            </Button>
            <Button onClick={onLogin} className="flex-1 btn-primary">
              Go to sign in
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyEmail;
