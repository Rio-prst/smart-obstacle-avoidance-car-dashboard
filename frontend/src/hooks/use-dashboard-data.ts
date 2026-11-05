import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDashboardSnapshot,
  sendMockStart,
  sendMockStop,
} from '@/data/mock/mock-api';
import type { Command, DashboardSnapshot } from '@/types/api';

export const isMockDataEnabled = import.meta.env.VITE_USE_MOCK_DATA !== 'false';

export const dashboardQueryKey = ['dashboard-snapshot'] as const;

export const mockDataRequiredMessage =
  'Integrasi API nyata belum tersedia. Aktifkan VITE_USE_MOCK_DATA=true untuk mode demo.';

export function requireMockData(): void {
  if (!isMockDataEnabled) {
    throw new Error(mockDataRequiredMessage);
  }
}

export function useDashboardSnapshot() {
  return useQuery<DashboardSnapshot>({
    queryKey: dashboardQueryKey,
    queryFn: () => {
      requireMockData();
      return Promise.resolve(getDashboardSnapshot());
    },
    refetchInterval: isMockDataEnabled ? 2000 : false,
    staleTime: 1000,
  });
}

export function useStartCommand() {
  const queryClient = useQueryClient();

  return useMutation<Command>({
    mutationFn: async () => {
      requireMockData();
      return sendMockStart();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

export function useStopCommand() {
  const queryClient = useQueryClient();

  return useMutation<Command>({
    mutationFn: async () => {
      requireMockData();
      return sendMockStop();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}
