import { Clock, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { LiveChartPanel } from '@/components/dashboard/live-chart-panel';
import { MiniBars } from '@/components/dashboard/mini-bars';
import { QuickCommandPanel } from '@/components/dashboard/quick-command-panel';
import { RecentEventsTable } from '@/components/dashboard/recent-events-table';
import { Sparkline } from '@/components/charts/sparkline';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { isMockDataEnabled, useDashboardSnapshot } from '@/hooks/use-dashboard-data';
import {
  buildAvoidanceBuckets,
  buildChartPoints,
  getDistanceValues,
  getRssiValues,
  type ChartRange,
} from '@/lib/dashboard';
import {
  formatCm,
  formatDataAge,
  formatMs,
  formatNumber,
  formatRssi,
} from '@/lib/format';
import {
  connectionStatusStyle,
  dataValidityStyle,
  modeStyle,
} from '@/lib/status-style';
import { cn } from '@/lib/utils';

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-10 w-32" />
              <Skeleton className="mt-2 h-4 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-[350px] xl:col-span-2" />
        <Skeleton className="h-[350px]" />
      </div>
      <Skeleton className="h-[320px]" />
    </div>
  );
}

export function DashboardPage() {
  const [range, setRange] = useState<ChartRange>('5m');
  const { data, isError, error, isLoading, refetch } = useDashboardSnapshot();

  const chartData = useMemo(
    () => (data ? buildChartPoints(data.telemetry, range) : []),
    [data, range],
  );
  const distanceValues = useMemo(
    () => (data ? getDistanceValues(data.telemetry) : []),
    [data],
  );
  const rssiValues = useMemo(
    () => (data ? getRssiValues(data.telemetry) : []),
    [data],
  );
  const avoidanceBuckets = useMemo(
    () => (data ? buildAvoidanceBuckets(data.telemetry) : []),
    [data],
  );

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isError || !data) {
    return (
      <Alert variant="danger" className="max-w-2xl">
        <WifiOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
        <div className="space-y-2">
          <AlertTitle>Data dashboard gagal dimuat</AlertTitle>
          <AlertDescription>
            {error?.message ?? 'Terjadi kesalahan yang tidak diketahui.'}
          </AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Coba lagi
          </Button>
        </div>
      </Alert>
    );
  }

  const { device, latest, events, rttMs, dataAgeSeconds } = data;
  const stale = dataAgeSeconds > 5;
  const connection = connectionStatusStyle(device.online, stale);
  const validity = dataValidityStyle(latest.valid);
  const mode = modeStyle(device.mode);

  return (
    <div className="space-y-6">
      {!device.online ? (
        <Alert variant="danger">
          <WifiOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <div>
            <AlertTitle>Perangkat offline</AlertTitle>
            <AlertDescription>
              Data terakhir {formatDataAge(dataAgeSeconds)}. Jangan menganggap tampilan ini live.
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      {device.online && stale ? (
        <Alert variant="warning">
          <Clock className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <div>
            <AlertTitle>Data tidak mutakhir</AlertTitle>
            <AlertDescription>
              Umur data {formatDataAge(dataAgeSeconds)}. Batas data live adalah 5 detik.
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold leading-5 text-foreground">
            Ringkasan Langsung
          </h2>
          <p className="text-xs text-muted-foreground">
            {device.name} · {isMockDataEnabled ? 'data simulasi diperbarui setiap 2 detik' : 'data perangkat'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Jarak Depan"
            value={formatCm(latest.distCm, latest.valid)}
            valueClassName={!latest.valid ? 'text-2xl text-warning-text' : undefined}
            subtitle={formatDataAge(dataAgeSeconds)}
            chip={<Badge className={validity.className}>{validity.label}</Badge>}
            visual={<Sparkline values={distanceValues} />}
            footerLabel="Lihat riwayat"
            footerTo="/history"
          />

          <KpiCard
            title="Mode dan State"
            value={device.state}
            valueClassName="text-3xl"
            subtitle={`Perintah PWM ${formatNumber(latest.pwm)}`}
            chip={<Badge className={mode.className}>{mode.label}</Badge>}
            footerLabel="Buka kendali"
            footerTo="/control"
          />

          <KpiCard
            title="Penghindaran"
            value={formatNumber(device.avoidCount)}
            subtitle="Siklus selesai sejak boot"
            visual={<MiniBars values={avoidanceBuckets} />}
            footerLabel="Lihat analisis"
            footerTo="/analytics"
          />

          <KpiCard
            title="Konektivitas"
            value={device.online ? 'Online' : 'Offline'}
            valueClassName={cn('text-3xl', device.online ? 'text-success-text' : 'text-danger-text')}
            subtitle={
              <span className="block">
                <span className="block">{formatRssi(latest.rssi)}</span>
                <span className="block">
                  {formatMs(rttMs)} · {formatDataAge(dataAgeSeconds)}
                </span>
              </span>
            }
            chip={<Badge className={connection.className}>{connection.label}</Badge>}
            visual={<Sparkline values={rssiValues} />}
            footerLabel="Detail koneksi"
            footerTo="/history"
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <LiveChartPanel data={chartData} range={range} onRangeChange={setRange} />
        <QuickCommandPanel device={device} />
      </section>

      <section>
        <RecentEventsTable events={events} />
      </section>
    </div>
  );
}
