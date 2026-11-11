import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acquireMockControl,
  getMockControlSnapshot,
  releaseMockControl,
  sendMockDrive,
  sendMockSetMode,
} from '@/data/mock/mock-api';
import type { DriveDirection } from '@/data/mock/simulator';
import { apiClient } from '@/lib/api-client';
import { realtimeClient } from '@/lib/realtime-client';
import type { Command, ControlSnapshot, DeviceMode } from '@/types/api';
import {
  dashboardQueryKey,
  isMockDataEnabled,
} from './use-dashboard-data';

export const controlQueryKey = ['control-snapshot'] as const;

export function useControlSnapshot() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isMockDataEnabled) return;

    void realtimeClient.connect('car01');

    const unsubscribe = realtimeClient.subscribe((event) => {
      if (
        event === 'control.update' ||
        event === 'rtt' ||
        event === 'status' ||
        event === 'command.update' ||
        event === 'telemetry'
      ) {
        void queryClient.invalidateQueries({ queryKey: controlQueryKey });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient]);

  return useQuery<ControlSnapshot>({
    queryKey: controlQueryKey,
    queryFn: () => {
      if (isMockDataEnabled) {
        return Promise.resolve(getMockControlSnapshot());
      }
      return apiClient.getControlSnapshot('car01');
    },
    refetchInterval: isMockDataEnabled ? 1500 : 2000,
    staleTime: 800,
  });
}

export function useAcquireControl() {
  const queryClient = useQueryClient();

  return useMutation<ControlSnapshot>({
    mutationFn: async () => {
      if (isMockDataEnabled) {
        return acquireMockControl();
      }
      await apiClient.acquireControl('car01');
      realtimeClient.startHeartbeat();
      return apiClient.getControlSnapshot('car01');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

export function useReleaseControl() {
  const queryClient = useQueryClient();

  return useMutation<ControlSnapshot>({
    mutationFn: async () => {
      if (isMockDataEnabled) {
        return releaseMockControl();
      }
      realtimeClient.stopHeartbeat();
      await apiClient.releaseControl('car01');
      return apiClient.getControlSnapshot('car01');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

export function useDriveControl() {
  const queryClient = useQueryClient();

  return useMutation<ControlSnapshot, Error, { direction: DriveDirection; speed: number }>({
    mutationFn: async ({ direction, speed }) => {
      if (isMockDataEnabled) {
        return sendMockDrive(direction, speed);
      }
      realtimeClient.sendDrive(direction, speed);
      const current = queryClient.getQueryData<ControlSnapshot>(controlQueryKey);
      if (current) return current;
      return apiClient.getControlSnapshot('car01');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: controlQueryKey });
      void queryClient.invalidateQueries({ queryKey: dashboardQueryKey });
    },
  });
}

export function useSetMode() {
  const queryClient = useQueryClient();

  return useMutation<Command, Error, DeviceMode>({
    mutationFn: async (mode) => {
      if (isMockDataEnabled) {
        return sendMockSetMode(mode);
      }
      return apiClient.sendCommand('SET_MODE', mode, 'car01');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}
