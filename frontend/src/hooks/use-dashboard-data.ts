import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDashboardSnapshot,
  sendMockStart,
  sendMockStop,
} from '@/data/mock/mock-api';
import { apiClient } from '@/lib/api-client';
import { realtimeClient } from '@/lib/realtime-client';
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
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isMockDataEnabled) return;

    void realtimeClient.connect('car01');

    const unsubscribe = realtimeClient.subscribe((event) => {
      if (
        event === 'telemetry' ||
        event === 'status' ||
        event === 'event' ||
        event === 'command.update'
      ) {
        void queryClient.invalidateQueries({ queryKey: dashboardQueryKey });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient]);

  return useQuery<DashboardSnapshot>({
    queryKey: dashboardQueryKey,
    queryFn: () => {
      if (isMockDataEnabled) {
        return Promise.resolve(getDashboardSnapshot());
      }
      return apiClient.getDashboardSnapshot('car01');
    },
    refetchInterval: isMockDataEnabled ? 2000 : 3000,
    staleTime: 1000,
  });
}

export function useStartCommand() {
  const queryClient = useQueryClient();

  return useMutation<Command>({
    mutationFn: async () => {
      if (isMockDataEnabled) {
        return sendMockStart();
      }
      return apiClient.sendCommand('START', undefined, 'car01');
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
      if (isMockDataEnabled) {
        return sendMockStop();
      }
      return apiClient.sendCommand('STOP', undefined, 'car01');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}
