import { ArrowRight, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useStartCommand } from '@/hooks/use-dashboard-data';
import { modeStyle } from '@/lib/status-style';
import type { Device } from '@/types/api';

interface QuickCommandPanelProps {
  device: Device;
}

export function QuickCommandPanel({ device }: QuickCommandPanelProps) {
  const startCommand = useStartCommand();
  const mode = modeStyle(device.mode);

  const handleStart = () => {
    startCommand.mutate(undefined, {
      onSuccess: () => toast('Perintah START dikirim (demo)'),
      onError: (error) => toast(error.message),
    });
  };

  const startDisabledReason = !device.online
    ? 'Perangkat offline.'
    : device.mode === 'MANUAL'
      ? 'Mode MANUAL tidak menerima START.'
      : device.state !== 'STOP'
        ? 'Perangkat harus STOP sebelum START.'
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perintah Cepat</CardTitle>
        <CardDescription>Mulai mode AUTO. STOP tersedia di header semua halaman.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-control border border-border bg-surface-muted px-3 py-2">
          <span className="text-sm text-muted-foreground">Mode saat ini</span>
          <Badge className={mode.className}>{mode.label}</Badge>
        </div>

        <div className="space-y-2">
          <Button
            className="w-full"
            onClick={handleStart}
            disabled={Boolean(startDisabledReason) || startCommand.isPending}
          >
            <Play className="fill-current" strokeWidth={0} />
            START
          </Button>
        </div>

        {startDisabledReason ? (
          <p className="text-xs text-muted-foreground">{startDisabledReason}</p>
        ) : null}

        <Button variant="ghost" size="sm" className="w-full justify-between" asChild>
          <Link to="/control">
            Buka kendali
            <ArrowRight className="size-3.5" strokeWidth={1.75} />
          </Link>
        </Button>

        <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
          STOP dari dashboard bukan penghentian darurat. Siapkan switch fisik.
        </p>
      </CardContent>
    </Card>
  );
}
