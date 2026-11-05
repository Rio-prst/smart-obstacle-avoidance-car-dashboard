import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acquireMockControl,
  getMockControlSnapshot,
  releaseMockControl,
  sendMockDrive,
  sendMockSetMode,
} from '@/data/mock/mock-api';
import type { DriveDirection } from '@/data/mock/simulator';
import type { Command, ControlSnapshot, DeviceMode } from '@/types/api';
import {
  dashboardQueryKey,
  isMockDataEnabled,
  requireMockData,
} from './use-dashboard-data';

export const controlQueryKey = ['control-snapshot'] as const;

export function useControlSnapshot() {
  return useQuery<ControlSnapshot>({
    queryKey: controlQueryKey,
    queryFn: () => {
      requireMockData();
      return Promise.resolve(getMockControlSnapshot());
    },
    refetchInterval: isMockDataEnabled ? 1500 : false,
    staleTime: 800,
  });
}

export function useAcquireControl() {
  const queryClient = useQueryClient();

  return useMutation<ControlSnapshot>({
    mutationFn: async () => {
      requireMockData();
      return acquireMockControl();
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
      requireMockData();
      return releaseMockControl();
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
      requireMockData();
      return sendMockDrive(direction, speed);
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
      requireMockData();
      return sendMockSetMode(mode);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}
