import React from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface StudentStatePanelProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}

export const StudentEmptyState: React.FC<StudentStatePanelProps> = ({
  title,
  description,
  icon,
  action,
  compact = false,
}) => {
  return (
    <div className={`rounded-lg border border-dashed border-border bg-muted/20 text-center ${compact ? 'p-6' : 'p-10'}`}>
      {icon ? <div className="mx-auto mb-3 flex justify-center text-muted-foreground">{icon}</div> : null}
      {title ? <p className="font-semibold text-foreground">{title}</p> : null}
      {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
};

export const StudentLoadingState: React.FC<{ label?: string; rows?: number }> = ({
  label = 'Loading',
  rows = 3,
}) => {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{label}</span>
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={`${label}-skeleton-${index}`} className="rounded-lg border border-border p-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const StudentPageSkeleton: React.FC<{
  title: string;
  subtitle: string;
  cards?: number;
}> = ({ title, subtitle, cards = 3 }) => {
  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className={`grid gap-3 ${cards >= 3 ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {Array.from({ length: cards }).map((_, index) => (
          <Card key={`${title}-card-${index}`} className="rounded-lg border-border shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="sr-only">{title} loading card {index + 1}</CardTitle>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="sr-only">{subtitle}</div>
    </div>
  );
};
