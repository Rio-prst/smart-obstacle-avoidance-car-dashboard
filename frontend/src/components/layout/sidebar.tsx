import { Car, ClipboardList } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { isMockDataEnabled, useDashboardSnapshot } from '@/hooks/use-dashboard-data';
import { useSessions } from '@/hooks/use-sessions-data';
import { cn } from '@/lib/utils';
import { navItems } from '@/lib/navigation';

interface SidebarContentProps {
  compact?: boolean;
  onNavigate?: () => void;
}

function SidebarContent({ compact = false, onNavigate }: SidebarContentProps) {
  const sessions = useSessions();
  const { data: dashboard } = useDashboardSnapshot();
  const recentSessions = sessions.data?.slice(0, 4) ?? [];
  const online = dashboard?.device.online ?? false;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-surface">
      <div className={cn('border-b border-border p-4', compact ? 'px-3 xl:px-4' : 'pr-12')}>
        <div
          className={cn('flex items-center gap-3', compact && 'justify-center xl:justify-start')}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary text-primary-foreground">
            <Car className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div className={cn('min-w-0', compact && 'sr-only xl:not-sr-only')}>
            <p className="truncate text-sm font-medium text-foreground">Smart Car</p>
            <p className="text-xs text-muted-foreground">
              {isMockDataEnabled ? 'Mode demo · Tanpa login' : 'Dashboard IoT'}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        <p className={cn('px-2 pb-2 text-xs text-muted-foreground', compact && 'hidden xl:block')}>
          Navigasi
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex h-9 items-center gap-2 rounded-control px-2 text-sm font-medium transition-colors',
                  compact && 'justify-center xl:justify-start',
                  isActive
                    ? 'bg-neutral-subtle text-primary'
                    : 'text-muted-foreground hover:bg-neutral-subtle hover:text-foreground',
                )
              }
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={1.75} />
              <span className={cn(compact && 'hidden xl:inline')}>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className={cn('border-t border-border p-3', compact && 'hidden xl:block')}>
        <div className="flex items-center justify-between px-2 pb-2">
          <p className="text-xs text-muted-foreground">Perangkat</p>
          <Badge variant="secondary">{dashboard ? 1 : 0}</Badge>
        </div>
        <div className="flex items-center gap-2 rounded-control px-2 py-2">
          <span
            className={cn(
              'size-2 rounded-full',
              online ? 'live-dot bg-success' : 'bg-muted-foreground',
            )}
          />
          <span className="text-sm text-foreground">{dashboard?.device.name ?? 'Mobil 1'}</span>
          <span
            className={cn(
              'ml-auto text-xs',
              online ? 'text-success-text' : 'text-muted-foreground',
            )}
          >
            {online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      <div className={cn('border-t border-border p-3', compact && 'hidden xl:block')}>
        <p className="px-2 pb-2 text-xs text-muted-foreground">Sesi Terbaru</p>
        {recentSessions.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">Belum ada sesi.</p>
        ) : (
          <ul className="space-y-1">
            {recentSessions.map((session) => (
              <li key={session.id}>
                <Link
                  to={`/sessions/${session.id}`}
                  onClick={onNavigate}
                  className="flex items-center gap-2 rounded-control px-2 py-1.5 hover:bg-neutral-subtle"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-chip bg-primary-subtle">
                    <ClipboardList className="size-3.5 text-primary" strokeWidth={1.75} />
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{session.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={cn('mt-auto border-t border-border p-3', compact && 'hidden xl:block')}>
        <p className="rounded-control border border-border bg-surface-muted p-3 text-xs leading-5 text-muted-foreground">
          STOP dari dashboard bukan penghentian darurat. Siapkan switch fisik.
        </p>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden border-r border-border bg-surface md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-[72px] md:flex-col xl:w-64">
      <SidebarContent compact />
    </aside>
  );
}

export { SidebarContent };
