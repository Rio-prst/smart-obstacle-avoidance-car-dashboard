import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addMockTrial,
  createMockSession,
  deleteMockTrial,
  endMockSession,
  getMockSession,
  getMockSessions,
} from '@/data/mock/mock-api';
import type {
  CreateSessionInput,
  CreateTrialInput,
  SessionDetail,
  SessionListItem,
  TestSession,
  TestTrial,
} from '@/types/api';
import { requireMockData } from './use-dashboard-data';

export const sessionsQueryKey = ['sessions'] as const;
export const sessionQueryKey = (sid: string) => ['session', sid] as const;

export function useSessions() {
  return useQuery<SessionListItem[]>({
    queryKey: sessionsQueryKey,
    queryFn: () => {
      requireMockData();
      return Promise.resolve(getMockSessions());
    },
    staleTime: 2000,
  });
}

export function useSession(sid: string | undefined) {
  return useQuery<SessionDetail>({
    queryKey: sessionQueryKey(sid ?? ''),
    queryFn: () => {
      requireMockData();
      if (!sid) {
        throw new Error('Session ID is required.');
      }
      return Promise.resolve(getMockSession(sid));
    },
    enabled: Boolean(sid),
    staleTime: 2000,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation<TestSession, Error, CreateSessionInput>({
    mutationFn: async (input) => {
      requireMockData();
      return createMockSession(input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

export function useEndSession() {
  const queryClient = useQueryClient();

  return useMutation<SessionDetail, Error, string>({
    mutationFn: async (sid) => {
      requireMockData();
      return endMockSession(sid);
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
      requireMockData();
      return addMockTrial(sessionId, input);
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
      requireMockData();
      deleteMockTrial(sessionId, trialId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}
