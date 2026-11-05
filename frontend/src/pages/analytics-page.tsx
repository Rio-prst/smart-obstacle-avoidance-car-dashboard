import { Download, Info, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAnalytics } from '@/hooks/use-analytics-data';
import { useSessions } from '@/hooks/use-sessions-data';
import { downloadCsv, toCsv, type CsvColumn } from '@/lib/csv';
import { formatDateTime, formatDecimal, formatNumber } from '@/lib/format';
import { commandStatusStyle, modeStyle, stateStyle } from '@/lib/status-style';
import type {
  AnalyticsBundle,
  ConfigComparisonRow,
  DeviceMode,
  StopDistanceAnalytics,
} from '@/types/api';

type ModeFilter = 'ALL' | DeviceMode;

const rangeOptions = [
  { value: '1', label: '1 jam' },
  { value: '6', label: '6 jam' },
  { value: '24', label: '24 jam' },
];

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-control border border-border bg-surface-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ExportButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={disabled}>
      <Download className="size-4" strokeWidth={1.75} />
      {label}
    </Button>
  );
}

function exportStopDistance(data: StopDistanceAnalytics) {
  const columns: CsvColumn<StopDistanceAnalytics['byPwm'][number]>[] = [
    { label: 'PWM', value: (row) => row.pwm },
    { label: 'Percobaan', value: (row) => row.trials },
    { label: 'Rata-rata (cm)', value: (row) => row.avgCm },
    { label: 'Maksimum (cm)', value: (row) => row.maxCm },
  ];
  downloadCsv('analisis-jarak-berhenti.csv', toCsv(data.byPwm, columns));
}

function exportConfigComparison(rows: ConfigComparisonRow[]) {
  const columns: CsvColumn<ConfigComparisonRow>[] = [
    { label: 'Ambang STOP (cm)', value: (row) => row.stopCm },
    { label: 'Ambang lanjut (cm)', value: (row) => row.resumeCm },
    { label: 'PWM maksimum', value: (row) => row.maxPwm },
    { label: 'PWM manual maksimum', value: (row) => row.manualMaxPwm },
    { label: 'Sesi', value: (row) => row.sessions },
    { label: 'Percobaan', value: (row) => row.trials },
    { label: 'Berhasil', value: (row) => row.success },
    { label: 'Keberhasilan (%)', value: (row) => row.successRatePct },
  ];
  downloadCsv('perbandingan-konfigurasi.csv', toCsv(rows, columns));
}

function AnalyticsContent({ data }: { data: AnalyticsBundle }) {
  const maxStatePct = Math.max(1, ...data.stateDistribution.byState.map((point) => point.pct));
  const commandStatuses = Object.entries(data.commands.byStatus);
  const rejectReasons = Object.entries(data.commands.rejectReasons);

  return (
    <div className="space-y-5">
      <Alert variant="warning">
        <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
        <div>
          <AlertTitle>Angka analisis bersifat simulasi</AlertTitle>
          <AlertDescription>
            Sebagian metrik berasal dari data sintetis 24 jam dan sesi contoh. Gunakan untuk
            memeriksa alur dashboard, bukan sebagai kesimpulan kinerja perangkat nyata.
          </AlertDescription>
        </div>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Sampel telemetri"
          value={formatNumber(data.sensor.total)}
          hint={`${formatNumber(data.sensor.invalidCount)} tidak valid`}
        />
        <Metric
          label="Pembacaan valid"
          value={`${formatNumber(Math.round(100 - data.sensor.invalidPct))}%`}
          hint={`Rata-rata ${data.sensor.distCm.avg === null ? '-' : `${formatDecimal(data.sensor.distCm.avg)} cm`}`}
        />
        <Metric
          label="Siklus penghindaran"
          value={formatNumber(data.avoidance.cycles)}
          hint={`${formatNumber(data.avoidance.permanentStops)} STOP permanen`}
        />
        <Metric
          label="Uptime koneksi"
          value={`${formatNumber(Math.round(data.connectivity.uptimePct))}%`}
          hint={`${formatNumber(data.connectivity.disconnectCount)} putus`}
        />
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sebaran State</CardTitle>
            <CardDescription>
              {formatNumber(data.stateDistribution.observedSeconds)} detik teramati dalam rentang
              ini.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.stateDistribution.byState.map((point) => {
              const style = stateStyle(point.state);
              return (
                <div key={point.state} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Badge className={style.className}>{style.label}</Badge>
                    <span className="text-muted-foreground">
                      {formatDecimal(point.pct)}% · {formatNumber(Math.round(point.seconds))} detik
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-chip bg-neutral-subtle">
                    <div
                      className="h-full rounded-chip bg-primary"
                      style={{ width: `${(point.pct / maxStatePct) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sensor dan Kendali</CardTitle>
            <CardDescription>Kualitas data dan latensi perintah.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Metric
              label="Jarak rata-rata"
              value={data.sensor.distCm.avg === null ? '-' : `${formatDecimal(data.sensor.distCm.avg)} cm`}
            />
            <Metric
              label="Jarak minimum"
              value={data.sensor.distCm.min === null ? '-' : `${formatDecimal(data.sensor.distCm.min)} cm`}
            />
            <Metric
              label="Latensi perintah rata-rata"
              value={data.commands.latencyMs.avg === null ? '-' : `${formatNumber(Math.round(data.commands.latencyMs.avg))} ms`}
            />
            <Metric
              label="Latensi p95"
              value={data.commands.latencyMs.p95 === null ? '-' : `${formatNumber(Math.round(data.commands.latencyMs.p95))} ms`}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Penghindaran</CardTitle>
            <CardDescription>Siklus AUTO yang selesai pada rentang.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Metric label="Siklus selesai" value={formatNumber(data.avoidance.cycles)} />
            <Metric
              label="Durasi siklus rata-rata"
              value={
                data.avoidance.cycleDurationSec.avg === null
                  ? '-'
                  : `${formatDecimal(data.avoidance.cycleDurationSec.avg)} detik`
              }
            />
            <Metric
              label="Jarak pemicu STOP"
              value={
                data.avoidance.stopTriggerDistCm.avg === null
                  ? '-'
                  : `${formatDecimal(data.avoidance.stopTriggerDistCm.avg)} cm`
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Perintah</CardTitle>
            <CardDescription>Status perintah pada rentang.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {commandStatuses.map(([status, count]) => {
              const style = commandStatusStyle(status);
              return (
                <div key={status} className="flex items-center justify-between rounded-control bg-surface-muted px-3 py-2 text-sm">
                  <Badge className={style.className}>{style.label}</Badge>
                  <span className="font-medium">{formatNumber(count)}</span>
                </div>
              );
            })}
            {rejectReasons.length > 0 ? (
              <div className="border-t border-border pt-2">
                <p className="pb-1 text-xs text-muted-foreground">Alasan penolakan</p>
                {rejectReasons.map(([reason, count]) => (
                  <div key={reason} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{reason}</span>
                    <span>{formatNumber(count)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Konektivitas</CardTitle>
            <CardDescription>RSSI dan gangguan koneksi.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Metric label="RSSI rata-rata" value={data.connectivity.rssi.avg === null ? '-' : `${formatNumber(data.connectivity.rssi.avg)} dBm`} />
            <Metric label="RSSI minimum" value={data.connectivity.rssi.min === null ? '-' : `${formatNumber(data.connectivity.rssi.min)} dBm`} />
            <Metric label="Putus koneksi" value={formatNumber(data.connectivity.disconnectCount)} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Saran Ambang STOP</CardTitle>
              <CardDescription>Berdasarkan jarak berhenti maksimum pada sesi uji.</CardDescription>
            </div>
            <ExportButton
              label="CSV"
              onClick={() => exportStopDistance(data.stopDistance)}
              disabled={data.stopDistance.byPwm.length === 0}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-control border border-border bg-surface-muted p-3">
              <p className="text-xs text-muted-foreground">Rekomendasi ambang STOP</p>
              <p className="text-2xl font-semibold text-foreground">
                {data.stopDistance.recommendedStopCm === null
                  ? '-'
                  : `${data.stopDistance.recommendedStopCm} cm`}
              </p>
              <p className="text-xs text-muted-foreground">
                Jarak berhenti terburuk {data.stopDistance.worstStoppingDistanceCm === null ? '-' : `${formatDecimal(data.stopDistance.worstStoppingDistanceCm)} cm`} + margin {data.stopDistance.marginCm} cm.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PWM</TableHead>
                  <TableHead>Percobaan</TableHead>
                  <TableHead>Rata-rata</TableHead>
                  <TableHead>Maksimum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.stopDistance.byPwm.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Belum ada data jarak berhenti.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.stopDistance.byPwm.map((row) => (
                    <TableRow key={row.pwm}>
                      <TableCell>{formatNumber(row.pwm)}</TableCell>
                      <TableCell>{formatNumber(row.trials)}</TableCell>
                      <TableCell>{formatDecimal(row.avgCm)} cm</TableCell>
                      <TableCell>{formatDecimal(row.maxCm)} cm</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Saran dari data uji, tidak diterapkan otomatis.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/config">Buka konfigurasi</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Perbandingan Konfigurasi</CardTitle>
              <CardDescription>Hanya sesi penghindaran AUTO yang selesai.</CardDescription>
            </div>
            <ExportButton
              label="CSV"
              onClick={() => exportConfigComparison(data.configComparison)}
              disabled={data.configComparison.length === 0}
            />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ambang</TableHead>
                  <TableHead>PWM</TableHead>
                  <TableHead>Sesi</TableHead>
                  <TableHead>Percobaan</TableHead>
                  <TableHead>Berhasil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.configComparison.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Belum ada sesi pembanding.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.configComparison.map((row) => (
                    <TableRow
                      key={`${row.stopCm}-${row.resumeCm}-${row.maxPwm}-${row.manualMaxPwm}`}
                    >
                      <TableCell>
                        {row.stopCm} / {row.resumeCm} cm
                      </TableCell>
                      <TableCell>
                        {row.maxPwm} / {row.manualMaxPwm}
                      </TableCell>
                      <TableCell>{row.sessions}</TableCell>
                      <TableCell>{row.trials}</TableCell>
                      <TableCell>
                        {row.successRatePct === null
                          ? '-'
                          : `${formatNumber(Math.round(row.successRatePct))}%`}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {(Object.keys(data.overview) as DeviceMode[]).map((mode) => {
          const overview = data.overview[mode];
          const style = modeStyle(mode);
          return (
            <Card key={mode}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Ringkasan {mode}
                  <Badge className={style.className}>{style.label}</Badge>
                </CardTitle>
                <CardDescription>
                  {formatNumber(overview.samples)} sampel · {formatNumber(Object.values(overview.events).reduce((total, count) => total + count, 0))} peristiwa
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {Object.entries(overview.stateSeconds).map(([state, seconds]) => (
                  <Metric
                    key={state}
                    label={`State ${state}`}
                    value={`${formatNumber(Math.round(seconds))} detik`}
                  />
                ))}
              </CardContent>
            </Card>
          );
        })}
      </section>

      {data.connectivity.outages.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Riwayat Putus Koneksi</CardTitle>
            <CardDescription>Gangguan koneksi pada rentang analisis.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mulai</TableHead>
                  <TableHead>Selesai</TableHead>
                  <TableHead>Durasi</TableHead>
                  <TableHead>Sumber</TableHead>
                  <TableHead>RSSI sebelum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.connectivity.outages.map((outage) => (
                  <TableRow key={`${outage.from}-${outage.source}`}>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(outage.from)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(outage.to)}</TableCell>
                    <TableCell>{formatNumber(outage.durationSec)} detik</TableCell>
                    <TableCell>{outage.source}</TableCell>
                    <TableCell>{outage.rssiBefore === null ? '-' : `${outage.rssiBefore} dBm`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Rentang data: {formatDateTime(data.meta.from)} sampai {formatDateTime(data.meta.to)} WIB.
        Mode: {data.meta.mode ?? 'semua'}.
      </p>
    </div>
  );
}

export function AnalyticsPage() {
  const [rangeHours, setRangeHours] = useState(24);
  const [sessionId, setSessionId] = useState('ALL');
  const [mode, setMode] = useState<ModeFilter>('ALL');
  const sessions = useSessions();
  const analytics = useAnalytics({
    rangeHours,
    sessionId: sessionId === 'ALL' ? null : sessionId,
    mode: mode === 'ALL' ? null : mode,
  });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Filter Analisis</CardTitle>
          <CardDescription>
            Pilih sesi untuk memakai rentang sesi; pilihan waktu diabaikan saat sesi dipilih.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="space-y-1 text-xs font-medium text-foreground">
            Rentang
            <Select value={String(rangeHours)} onValueChange={(value) => setRangeHours(Number(value))}>
              <SelectTrigger className="w-full sm:w-36" aria-label="Rentang analisis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {rangeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-1 text-xs font-medium text-foreground">
            Sesi
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger className="w-full sm:w-64" aria-label="Filter sesi">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua sesi</SelectItem>
                {sessions.data?.map((session) => (
                  <SelectItem key={session.id} value={session.id}>
                    {session.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-1 text-xs font-medium text-foreground">
            Mode
            <Select value={mode} onValueChange={(value) => setMode(value as ModeFilter)}>
              <SelectTrigger className="w-full sm:w-36" aria-label="Filter mode analisis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua mode</SelectItem>
                <SelectItem value="AUTO">AUTO</SelectItem>
                <SelectItem value="MANUAL">MANUAL</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </CardContent>
      </Card>

      {analytics.isLoading ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64 xl:col-span-2" />
        </div>
      ) : analytics.isError ? (
        <Alert variant="danger" className="max-w-2xl">
          <WifiOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <div>
            <AlertTitle>Analisis gagal dimuat</AlertTitle>
            <AlertDescription>{analytics.error.message}</AlertDescription>
          </div>
        </Alert>
      ) : analytics.data ? (
        <AnalyticsContent data={analytics.data} />
      ) : null}
    </div>
  );
}
