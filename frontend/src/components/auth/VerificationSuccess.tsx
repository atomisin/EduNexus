import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, Clock, Loader2, Mail, ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface VerificationSuccessProps {
  email: string;
  verificationToken: string;
  verificationSent?: boolean;
  onContinue: () => void;
}

export const VerificationSuccess: React.FC<VerificationSuccessProps> = ({
  email,
  verificationToken: _verificationToken,
  verificationSent = true,
  onContinue
}) => {
  const { verifyEmail, resendVerificationEmail, isLoading } = useAuth();
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [emailSent, setEmailSent] = useState(verificationSent);

  const handleVerify = async () => {
    if (verificationCode.length < 6) {
      setError('Please enter the complete verification code');
      return;
    }

    setError(null);
    const success = await verifyEmail(verificationCode, email);

    if (success) {
      setIsVerified(true);
      toast.success('Email verified successfully');
    } else {
      setError('Invalid verification code. Please try again.');
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setError(null);

    const success = await resendVerificationEmail(email);

    if (success) {
      setEmailSent(true);
      toast.success('Verification email resent. Check your inbox.');
    } else {
      setEmailSent(false);
      setError('We could not send the verification email. Please confirm the SMTP settings, then resend the code.');
    }

    setIsResending(false);
  };

  if (isVerified) {
    return (
      <div className="min-h-screen bg-subtle flex items-center justify-center p-4">
        <Card className="w-full max-w-md rounded-lg">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-emerald-600" />
            </div>
            <CardTitle className="text-2xl">Email Verified</CardTitle>
            <CardDescription>
              Your email is confirmed. The admin team will now complete the final account review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <div className="flex items-center gap-2 text-primary mb-3">
                <ShieldCheck className="w-5 h-5" />
                <span className="font-semibold">What happens next?</span>
              </div>
              <div className="space-y-2 text-sm text-foreground/80">
                <p className="flex gap-2">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  Your email address has been verified.
                </p>
                <p className="flex gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  An administrator will review and activate your account.
                </p>
                <p className="flex gap-2">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  You will receive an email once access is approved.
                </p>
              </div>
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
    <div className="min-h-screen bg-subtle flex items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-lg">
        <div className="h-1.5 bg-primary" />
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-9 h-9 text-primary" />
          </div>
          <CardTitle className="text-2xl">Verify Your Email</CardTitle>
          <CardDescription>
            {emailSent ? (
              <>
                We sent a 6-digit verification code to <strong>{email}</strong>.
              </>
            ) : (
              <>
                Your account was created, but EduNexus could not send the verification code to <strong>{email}</strong>.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!emailSent && (
            <Alert>
              <AlertDescription>
                Please check the email/SMTP configuration, then use resend. The code entry box is ready as soon as the email arrives.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Verification Code</label>
            <Input
              type="text"
              placeholder="Enter 6-digit code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              className="text-center text-2xl tracking-widest h-14"
            />
            <p className="text-xs text-muted-foreground">
              After email verification, an administrator will review and activate the account.
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
              className="text-sm text-primary hover:underline font-medium flex items-center justify-center gap-2 mx-auto disabled:opacity-50"
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
