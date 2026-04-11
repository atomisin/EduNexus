import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RegistrationForm } from '@/components/auth/RegistrationForm';

interface RegistrationPageProps {
  onSuccess: () => void;
  onBack: () => void;
  isModal?: boolean;
}

export const RegistrationPage = ({ onSuccess, onBack, isModal = false }: RegistrationPageProps) => {
  const content = (
    <div className="relative w-full max-w-lg">
      {!isModal && (
        <Button
          variant="ghost"
          onClick={onBack}
          className="absolute -top-12 left-0 text-slate-400 hover:text-slate-600"
        >
          <ChevronRight className="w-5 h-5 rotate-180 mr-1" />
          Back
        </Button>
      )}

      <RegistrationForm
        onSuccess={onSuccess}
        onLoginClick={onBack}
      />
    </div>
  );

  if (isModal) return content;

  return (
    <div className="min-h-screen bg-subtle flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
      {content}
    </div>
  );
};
