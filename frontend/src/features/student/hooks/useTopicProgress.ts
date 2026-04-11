import { useQuery } from '@tanstack/react-query';
import { progressAPI } from '@/services/api';

interface TopicProgress {
  topic_id: string;
  topic_name: string;
  progress_pct: number;
  completed_at: string | null;
  last_accessed: string | null;
}

interface ProgressSummaryResponse {
  subjects: Record<string, TopicProgress[]>;
}

export function useTopicProgress() {
  const { data, isLoading, refetch } = useQuery<ProgressSummaryResponse>({
    queryKey: ['topic-progress-summary'],
    queryFn: () => progressAPI.getProgressSummary(),
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: 1,
  });

  const getTopicProgress = (topicId: string): TopicProgress | undefined => {
    if (!data?.subjects) return undefined;
    for (const topics of Object.values(data.subjects)) {
      const found = topics.find((t) => t.topic_id === topicId);
      if (found) return found;
    }
    return undefined;
  };

  return { progressData: data, isLoading, refetch, getTopicProgress };
}

export type { TopicProgress };
