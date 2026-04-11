import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, Loader2, Mail, ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface VerificationSuccessProps {
  email: string;
  verificationToken: string;
  onContinue: () => void;
}

export const VerificationSuccess: React.FC<VerificationSuccessProps> = ({
  email,
  verificationToken: _verificationToken,
  onContinue
}) => {
  const { verifyEmail, resendVerificationEmail, isLoading } = useAuth();
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  const handleVerify = async () => {
    if (verificationCode.length < 6) {
      setError('Please enter the complete verification code');
      return;
    }

    setError(null);
    const success = await verifyEmail(verificationCode, email);

    if (success) {
      setIsVerified(true);
      toast.success('Email verified successfully!');
    } else {
      setError('Invalid verification code. Please try again.');
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setError(null);

    const success = await resendVerificationEmail(email);

    if (success) {
      toast.success('Verification email resent! Check your inbox.');
    } else {
      setError('Failed to resend verification email. Please try again.');
    }

    setIsResending(false);
  };

  if (isVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-slate-950 dark:to-indigo-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-emerald-600" />
            </div>
            <CardTitle className="text-2xl">Email Verified!</CardTitle>
            <CardDescription>
              Your email has been successfully verified.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-2">
                <Mail className="w-5 h-5" />
                <span className="font-medium">What happens next?</span>
              </div>
              <ul className="space-y-2 text-sm text-blue-600 dark:text-blue-300">
                <li>✓ Your email is now verified</li>
                <li>⏳ Your account is pending admin approval</li>
                <li>📧 You'll receive an email once approved</li>
                <li>🔓 Then you can login and start using EduNexus</li>
              </ul>
            </div>

            <Button onClick={onContinue} className="w-full btn-primary">
              Continue to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-slate-950 dark:to-indigo-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-indigo-500" />
        <CardHeader className="text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Mail className="w-10 h-10 text-white" />
          </div>
          <CardTitle className="text-2xl">Verify Your Email</CardTitle>
          <CardDescription>
            We've sent a verification code to: <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Enter Verification Code</label>
            <Input
              type="text"
              placeholder="Enter 6-digit code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              className="text-center text-2xl tracking-widest h-14"
            />
            <p className="text-xs text-slate-500">
              Check your email inbox for the 6-digit verification code
            </p>
          </div>

          <Button
            onClick={handleVerify}
            disabled={isLoading || verificationCode.length < 6}
            className="w-full h-12 btn-primary"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify Email'
            )}
          </Button>

          <div className="text-center">
            <button
              onClick={handleResend}
              disabled={isResending}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center justify-center gap-2 mx-auto disabled:opacity-50"
            >
              {isResending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Resending...
                </>
              ) : (
                'Resend verification code'
              )}
            </button>
          </div>

          <Button
            onClick={onContinue}
            variant="outline"
            className="w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default VerificationSuccess;
