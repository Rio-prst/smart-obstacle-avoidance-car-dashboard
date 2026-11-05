import { useQuery } from '@tanstack/react-query';
import { getMockAnalytics } from '@/data/mock/mock-api';
import type { AnalyticsBundle, AnalyticsFilters } from '@/types/api';
import { requireMockData } from './use-dashboard-data';

export function useAnalytics(filters: AnalyticsFilters) {
  return useQuery<AnalyticsBundle>({
    queryKey: ['analytics', filters],
    queryFn: () => {
      requireMockData();
      return Promise.resolve(getMockAnalytics(filters));
    },
    staleTime: 5000,
  });
}
