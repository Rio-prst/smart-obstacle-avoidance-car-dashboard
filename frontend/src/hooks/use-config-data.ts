import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMockConfig, updateMockConfig } from '@/data/mock/mock-api';
import type { DeviceConfig, UpdateConfigInput } from '@/types/api';
import { requireMockData } from './use-dashboard-data';

export const configQueryKey = ['device-config'] as const;

export function useDeviceConfig() {
  return useQuery<DeviceConfig>({
    queryKey: configQueryKey,
    queryFn: () => {
      requireMockData();
      return Promise.resolve(getMockConfig());
    },
    staleTime: 5000,
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();

  return useMutation<DeviceConfig, Error, UpdateConfigInput>({
    mutationFn: async (input) => {
      requireMockData();
      return updateMockConfig(input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}
