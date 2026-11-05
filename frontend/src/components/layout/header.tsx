import { Menu, Square } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  isMockDataEnabled,
  useDashboardSnapshot,
  useStopCommand,
} from '@/hooks/use-dashboard-data';
import { getPageTitle } from '@/lib/navigation';
import { connectionStatusStyle, stateStyle } from '@/lib/status-style';
import { cn } from '@/lib/utils';

interface HeaderProps {
  onOpenMenu: () => void;
}

export function Header({ onOpenMenu }: HeaderProps) {
  const location = useLocation();
  const { data } = useDashboardSnapshot();
  const stopCommand = useStopCommand();

  const connection = data
    ? connectionStatusStyle(data.device.online, data.dataAgeSeconds > 5)
    : { label: 'Menghubungkan', className: 'bg-neutral-subtle text-muted-foreground' };
  const state = data ? stateStyle(data.device.state) : null;

  const handleStop = () => {
    stopCommand.mutate(undefined, {
      onSuccess: () => toast('Perintah STOP dikirim (demo)'),
      onError: (error) => toast(error.message),
    });
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface px-4 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 md:hidden"
        onClick={onOpenMenu}
        aria-label="Buka menu"
      >
        <Menu className="size-[18px]" strokeWidth={1.75} />
      </Button>

      <h1 className="min-w-0 truncate text-lg font-semibold leading-6 text-foreground">
        {getPageTitle(location.pathname)}
      </h1>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {isMockDataEnabled ? (
          <Badge variant="outline" className="hidden sm:inline-flex">
            Data demo
          </Badge>
        ) : null}

        {state ? (
          <Badge className={cn('hidden whitespace-nowrap sm:inline-flex', state.className)}>
            {state.label}
          </Badge>
        ) : null}

        <Badge
          className={cn('shrink-0 whitespace-nowrap', connection.className)}
          role="status"
          title={`Koneksi: ${connection.label}`}
        >
          <span
            className={cn(
              'size-1.5 rounded-full bg-current',
              data?.device.online && data.dataAgeSeconds <= 5 && 'live-dot',
            )}
          />
          <span className="sr-only">Koneksi: </span>
          <span className="sr-only md:not-sr-only">{connection.label}</span>
        </Badge>

        <Button variant="destructive" size="sm" onClick={handleStop}>
          <Square className="fill-current" strokeWidth={0} />
          STOP
        </Button>
      </div>
    </header>
  );
}
