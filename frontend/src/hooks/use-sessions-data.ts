import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addMockTrial,
  createMockSession,
  deleteMockTrial,
  endMockSession,
  getMockSession,
  getMockSessions,
} from '@/data/mock/mock-api';
import { apiClient } from '@/lib/api-client';
import type {
  CreateSessionInput,
  CreateTrialInput,
  SessionDetail,
  SessionListItem,
  TestSession,
  TestTrial,
} from '@/types/api';
import { isMockDataEnabled } from './use-dashboard-data';

export const sessionsQueryKey = ['sessions'] as const;
export const sessionQueryKey = (sid: string) => ['session', sid] as const;

export function useSessions() {
  return useQuery<SessionListItem[]>({
    queryKey: sessionsQueryKey,
    queryFn: () => {
      if (isMockDataEnabled) {
        return Promise.resolve(getMockSessions());
      }
      return apiClient.getSessions('car01');
    },
    staleTime: 2000,
  });
}

export function useSession(sid: string | undefined) {
  return useQuery<SessionDetail>({
    queryKey: sessionQueryKey(sid ?? ''),
    queryFn: () => {
      if (!sid) {
        throw new Error('Session ID is required.');
      }
      if (isMockDataEnabled) {
        return Promise.resolve(getMockSession(sid));
      }
      return apiClient.getSessionDetail(sid);
    },
    enabled: Boolean(sid),
    staleTime: 2000,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation<TestSession, Error, CreateSessionInput>({
    mutationFn: async (input) => {
      if (isMockDataEnabled) {
        return createMockSession(input);
      }
      return apiClient.createSession(input, 'car01');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

export function useEndSession() {
  const queryClient = useQueryClient();

  return useMutation<SessionDetail | TestSession, Error, string>({
    mutationFn: async (sid) => {
      if (isMockDataEnabled) {
        return endMockSession(sid);
      }
      return apiClient.endSession(sid);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

export function useAddTrial() {
  const queryClient = useQueryClient();

  return useMutation<
    TestTrial,
    Error,
    { sessionId: string; input: CreateTrialInput }
  >({
    mutationFn: async ({ sessionId, input }) => {
      if (isMockDataEnabled) {
        return addMockTrial(sessionId, input);
      }
      return apiClient.addTrial(sessionId, input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

export function useDeleteTrial() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { sessionId: string; trialId: string }>({
    mutationFn: async ({ sessionId, trialId }) => {
      if (isMockDataEnabled) {
        deleteMockTrial(sessionId, trialId);
        return;
      }
      return apiClient.deleteTrial(sessionId, trialId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}
