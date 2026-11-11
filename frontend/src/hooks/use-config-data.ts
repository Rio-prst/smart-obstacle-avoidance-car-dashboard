import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMockConfig, updateMockConfig } from '@/data/mock/mock-api';
import { apiClient } from '@/lib/api-client';
import type { DeviceConfig, UpdateConfigInput } from '@/types/api';
import { isMockDataEnabled } from './use-dashboard-data';

export const configQueryKey = ['device-config'] as const;

export function useDeviceConfig() {
  return useQuery<DeviceConfig>({
    queryKey: configQueryKey,
    queryFn: () => {
      if (isMockDataEnabled) {
        return Promise.resolve(getMockConfig());
      }
      return apiClient.getConfig('car01');
    },
    staleTime: 5000,
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();

  return useMutation<DeviceConfig, Error, UpdateConfigInput>({
    mutationFn: async (input) => {
      if (isMockDataEnabled) {
        return updateMockConfig(input);
      }
      return apiClient.updateConfig(input, 'car01');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}
