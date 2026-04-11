import { useQuery } from '@tanstack/react-query';
import { readingsAPI } from '@/services/api';
import type { BrainPowerCardData } from '@/features/student/learning/BrainPowerCard';

interface UseReadingRecommendationsParams {
  topic: string;
  subject?: string;
  limit?: number;
  enabled?: boolean;
}

interface ReadingsResponse {
  cards: BrainPowerCardData[];
  total: number;
  topic: string;
  education_level: string;
}

export function useReadingRecommendations({
  topic,
  subject,
  limit = 5,
  enabled = true,
}: UseReadingRecommendationsParams) {
  return useQuery<ReadingsResponse>({
    queryKey: ['reading-recommendations', topic, subject, limit],
    queryFn: () =>
      readingsAPI.getReadingRecommendations({
        topic,
        subject,
        limit,
      }),
    enabled: enabled && topic.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}
