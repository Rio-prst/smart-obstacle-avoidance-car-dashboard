import { useQuery } from '@tanstack/react-query';
import { getMockAnalytics } from '@/data/mock/mock-api';
import { apiClient } from '@/lib/api-client';
import type { AnalyticsBundle, AnalyticsFilters } from '@/types/api';
import { isMockDataEnabled } from './use-dashboard-data';

export function useAnalytics(filters: AnalyticsFilters) {
  return useQuery<AnalyticsBundle>({
    queryKey: ['analytics', filters],
    queryFn: () => {
      if (isMockDataEnabled) {
        return Promise.resolve(getMockAnalytics(filters));
      }
      return apiClient.getAnalytics(filters, 'car01');
    },
    staleTime: 5000,
  });
}
