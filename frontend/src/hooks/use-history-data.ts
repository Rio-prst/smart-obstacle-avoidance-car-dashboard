import { useQuery } from '@tanstack/react-query';
import {
  getMockCommandHistory,
  getMockEventHistory,
  getMockTelemetryHistory,
} from '@/data/mock/mock-api';
import type {
  CommandHistoryResult,
  DeviceMode,
  EventHistoryResult,
  TelemetryHistoryResult,
} from '@/types/api';
import { requireMockData } from './use-dashboard-data';

export function useTelemetryHistory(rangeMinutes: number, mode: DeviceMode | null) {
  return useQuery<TelemetryHistoryResult>({
    queryKey: ['history-telemetry', rangeMinutes, mode],
    queryFn: () => {
      requireMockData();
      return Promise.resolve(getMockTelemetryHistory(rangeMinutes, mode));
    },
    staleTime: 5000,
  });
}

export function useEventHistory(
  rangeMinutes: number,
  type: string | null,
  mode: DeviceMode | null,
) {
  return useQuery<EventHistoryResult>({
    queryKey: ['history-events', rangeMinutes, type, mode],
    queryFn: () => {
      requireMockData();
      return Promise.resolve(getMockEventHistory(rangeMinutes, type, mode));
    },
    staleTime: 5000,
  });
}

export function useCommandHistory(rangeMinutes: number) {
  return useQuery<CommandHistoryResult>({
    queryKey: ['history-commands', rangeMinutes],
    queryFn: () => {
      requireMockData();
      return Promise.resolve(getMockCommandHistory(rangeMinutes));
    },
    staleTime: 5000,
  });
}
