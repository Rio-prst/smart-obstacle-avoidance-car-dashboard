import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { startMockSimulation, stopMockSimulation } from '@/data/mock/mock-api';
import { isMockDataEnabled } from '@/hooks/use-dashboard-data';
import { AnalyticsPage } from '@/pages/analytics-page';
import { ConfigPage } from '@/pages/config-page';
import { ControlPage } from '@/pages/control-page';
import { DashboardPage } from '@/pages/dashboard-page';
import { HistoryPage } from '@/pages/history-page';
import { SessionDetailPage } from '@/pages/session-detail-page';
import { SessionsPage } from '@/pages/sessions-page';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function MockSimulation() {
  useEffect(() => {
    if (!isMockDataEnabled) {
      return;
    }

    startMockSimulation();
    return () => stopMockSimulation();
  }, []);

  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <BrowserRouter>
          <MockSimulation />
          <Toaster />
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="control" element={<ControlPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="sessions" element={<SessionsPage />} />
              <Route path="sessions/:sid" element={<SessionDetailPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="config" element={<ConfigPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
