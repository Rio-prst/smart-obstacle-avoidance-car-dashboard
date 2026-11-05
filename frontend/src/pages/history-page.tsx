import { Download, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useCommandHistory,
  useEventHistory,
  useTelemetryHistory,
} from '@/hooks/use-history-data';
import { downloadCsv, toCsv, type CsvColumn } from '@/lib/csv';
import {
  formatCm,
  formatDateTime,
  formatEventDetail,
  formatEventType,
  formatNumber,
} from '@/lib/format';
import { commandStatusStyle, modeStyle, stateStyle } from '@/lib/status-style';
import { cn } from '@/lib/utils';
import type { Command, DeviceEvent, DeviceMode, Telemetry } from '@/types/api';

type ModeFilter = 'ALL' | DeviceMode;
type EventTypeFilter =
  | 'ALL'
  | 'STOP'
  | 'START'
  | 'SET_MODE'
  | 'AVOID_DONE'
  | 'PINDAI'
  | 'BELOK'
  | 'MANUAL_BLOCKED'
  | 'MANUAL_TIMEOUT'
  | 'DEVICE_ONLINE'
  | 'DEVICE_OFFLINE';

const rangeOptions = [
  { value: '60', label: '1 jam' },
  { value: '360', label: '6 jam' },
  { value: '1440', label: '24 jam' },
];

function exportTelemetry(rows: Telemetry[], rangeMinutes: number) {
  const columns: CsvColumn<Telemetry>[] = [
    { label: 'Waktu', value: (row) => row.ts },
    { label: 'Mode', value: (row) => row.mode },
    { label: 'State', value: (row) => row.state },
    { label: 'Jarak (cm)', value: (row) => (row.valid ? row.distCm : '') },
    { label: 'Valid', value: (row) => (row.valid ? 'ya' : 'tidak') },
    { label: 'PWM', value: (row) => row.pwm },
    { label: 'RSSI', value: (row) => row.rssi },
  ];
  downloadCsv(`telemetri-${rangeMinutes}m.csv`, toCsv(rows, columns));
}

function exportEvents(rows: DeviceEvent[], rangeMinutes: number) {
  const columns: CsvColumn<DeviceEvent>[] = [
    { label: 'Waktu', value: (row) => row.ts },
    { label: 'Tipe', value: (row) => row.type },
    { label: 'Mode', value: (row) => row.mode },
    { label: 'Sumber', value: (row) => row.source },
    { label: 'Detail', value: (row) => formatEventDetail(row.detail) },
  ];
  downloadCsv(`peristiwa-${rangeMinutes}m.csv`, toCsv(rows, columns));
}

function exportCommands(rows: Command[], rangeMinutes: number) {
  const columns: CsvColumn<Command>[] = [
    { label: 'Waktu', value: (row) => row.createdAt },
    { label: 'Urutan', value: (row) => row.seq },
    { label: 'Perintah', value: (row) => row.cmd },
    { label: 'Status', value: (row) => row.status },
    { label: 'Latensi (ms)', value: (row) => row.latencyMs },
    { label: 'Alasan', value: (row) => row.reason },
  ];
  downloadCsv(`perintah-${rangeMinutes}m.csv`, toCsv(rows, columns));
}

export function HistoryPage() {
  const [rangeMinutes, setRangeMinutes] = useState(1440);
  const [mode, setMode] = useState<ModeFilter>('ALL');
  const [eventType, setEventType] = useState<EventTypeFilter>('ALL');
  const modeFilter = mode === 'ALL' ? null : mode;
  const typeFilter = eventType === 'ALL' ? null : eventType;
  const telemetry = useTelemetryHistory(rangeMinutes, modeFilter);
  const events = useEventHistory(rangeMinutes, typeFilter, modeFilter);
  const commands = useCommandHistory(rangeMinutes);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Filter Riwayat</CardTitle>
          <CardDescription>Data berasal dari simulasi dan disimpan di memori browser.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="space-y-1 text-xs font-medium text-foreground">
            Rentang
            <Select value={String(rangeMinutes)} onValueChange={(value) => setRangeMinutes(Number(value))}>
              <SelectTrigger className="w-full sm:w-36" aria-label="Rentang riwayat">
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
            Mode
            <Select value={mode} onValueChange={(value) => setMode(value as ModeFilter)}>
              <SelectTrigger className="w-full sm:w-36" aria-label="Filter mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua mode</SelectItem>
                <SelectItem value="AUTO">AUTO</SelectItem>
                <SelectItem value="MANUAL">MANUAL</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-1 text-xs font-medium text-foreground">
            Tipe peristiwa
            <Select
              value={eventType}
              onValueChange={(value) => setEventType(value as EventTypeFilter)}
            >
              <SelectTrigger className="w-full sm:w-48" aria-label="Filter tipe peristiwa">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua peristiwa</SelectItem>
                <SelectItem value="STOP">Berhenti</SelectItem>
                <SelectItem value="START">Mulai</SelectItem>
                <SelectItem value="SET_MODE">Ganti mode</SelectItem>
                <SelectItem value="AVOID_DONE">Penghindaran selesai</SelectItem>
                <SelectItem value="PINDAI">Pindai</SelectItem>
                <SelectItem value="BELOK">Belok</SelectItem>
                <SelectItem value="MANUAL_BLOCKED">Manual diblokir</SelectItem>
                <SelectItem value="MANUAL_TIMEOUT">Manual timeout</SelectItem>
                <SelectItem value="DEVICE_ONLINE">Perangkat online</SelectItem>
                <SelectItem value="DEVICE_OFFLINE">Perangkat offline</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </CardContent>
      </Card>

      <Tabs defaultValue="telemetry">
        <TabsList>
          <TabsTrigger value="telemetry">Telemetri</TabsTrigger>
          <TabsTrigger value="events">Peristiwa</TabsTrigger>
          <TabsTrigger value="commands">Perintah</TabsTrigger>
        </TabsList>

        <TabsContent value="telemetry">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Riwayat Telemetri</CardTitle>
                <CardDescription>
                  {telemetry.data ? `${formatNumber(telemetry.data.meta.count)} baris` : 'Memuat data'}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!telemetry.data || telemetry.data.data.length === 0}
                onClick={() => telemetry.data && exportTelemetry(telemetry.data.data, rangeMinutes)}
              >
                <Download className="size-4" strokeWidth={1.75} />
                Ekspor CSV
              </Button>
            </CardHeader>
            <CardContent>
              {telemetry.isLoading ? (
                <Skeleton className="h-72" />
              ) : telemetry.isError ? (
                <Alert variant="danger">
                  <WifiOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                  <div>
                    <AlertTitle>Riwayat telemetri gagal dimuat</AlertTitle>
                    <AlertDescription>{telemetry.error.message}</AlertDescription>
                  </div>
                </Alert>
              ) : (
                <div className="max-h-[520px] overflow-auto rounded-control border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Jarak</TableHead>
                        <TableHead>PWM</TableHead>
                        <TableHead>RSSI</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {telemetry.data?.data.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            Tidak ada telemetri pada rentang ini.
                          </TableCell>
                        </TableRow>
                      ) : (
                        telemetry.data?.data.map((point) => {
                          const modeBadge = modeStyle(point.mode);
                          const stateBadge = stateStyle(point.state);
                          return (
                            <TableRow key={point.ts}>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {formatDateTime(point.ts)}
                              </TableCell>
                              <TableCell>
                                <Badge className={modeBadge.className}>{modeBadge.label}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={stateBadge.className}>{stateBadge.label}</Badge>
                              </TableCell>
                              <TableCell className={cn(!point.valid && 'text-warning-text')}>
                                {point.valid ? formatCm(point.distCm, true) : 'Tidak valid'}
                              </TableCell>
                              <TableCell>{formatNumber(point.pwm)}</TableCell>
                              <TableCell>{point.rssi === null ? '-' : `${formatNumber(point.rssi)} dBm`}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Riwayat Peristiwa</CardTitle>
                <CardDescription>
                  {events.data ? `${formatNumber(events.data.meta.count)} peristiwa` : 'Memuat data'}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!events.data || events.data.data.length === 0}
                onClick={() => events.data && exportEvents(events.data.data, rangeMinutes)}
              >
                <Download className="size-4" strokeWidth={1.75} />
                Ekspor CSV
              </Button>
            </CardHeader>
            <CardContent>
              {events.isLoading ? (
                <Skeleton className="h-72" />
              ) : events.isError ? (
                <Alert variant="danger">
                  <WifiOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                  <div>
                    <AlertTitle>Riwayat peristiwa gagal dimuat</AlertTitle>
                    <AlertDescription>{events.error.message}</AlertDescription>
                  </div>
                </Alert>
              ) : (
                <div className="max-h-[520px] overflow-auto rounded-control border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Peristiwa</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>Sumber</TableHead>
                        <TableHead>Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.data?.data.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            Tidak ada peristiwa pada rentang ini.
                          </TableCell>
                        </TableRow>
                      ) : (
                        events.data?.data.map((event) => {
                          const modeBadge = modeStyle(event.mode);
                          return (
                            <TableRow key={event.id}>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {formatDateTime(event.ts)}
                              </TableCell>
                              <TableCell className="font-medium">{formatEventType(event.type)}</TableCell>
                              <TableCell>
                                <Badge className={modeBadge.className}>{modeBadge.label}</Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{event.source}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatEventDetail(event.detail)}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commands">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Riwayat Perintah</CardTitle>
                <CardDescription>
                  {commands.data ? `${formatNumber(commands.data.meta.count)} perintah` : 'Memuat data'}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!commands.data || commands.data.data.length === 0}
                onClick={() => commands.data && exportCommands(commands.data.data, rangeMinutes)}
              >
                <Download className="size-4" strokeWidth={1.75} />
                Ekspor CSV
              </Button>
            </CardHeader>
            <CardContent>
              {commands.isLoading ? (
                <Skeleton className="h-72" />
              ) : commands.isError ? (
                <Alert variant="danger">
                  <WifiOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                  <div>
                    <AlertTitle>Riwayat perintah gagal dimuat</AlertTitle>
                    <AlertDescription>{commands.error.message}</AlertDescription>
                  </div>
                </Alert>
              ) : (
                <div className="max-h-[520px] overflow-auto rounded-control border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Urutan</TableHead>
                        <TableHead>Perintah</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Latensi</TableHead>
                        <TableHead>Alasan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commands.data?.data.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            Tidak ada perintah pada rentang ini.
                          </TableCell>
                        </TableRow>
                      ) : (
                        commands.data?.data.map((command) => {
                          const status = commandStatusStyle(command.status);
                          return (
                            <TableRow key={command.id}>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {formatDateTime(command.createdAt)}
                              </TableCell>
                              <TableCell className="font-mono text-xs">#{command.seq}</TableCell>
                              <TableCell className="font-medium">{command.cmd}</TableCell>
                              <TableCell>
                                <Badge className={status.className}>{status.label}</Badge>
                              </TableCell>
                              <TableCell>
                                {command.latencyMs === null ? '-' : `${formatNumber(command.latencyMs)} ms`}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {command.reason ?? '-'}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
