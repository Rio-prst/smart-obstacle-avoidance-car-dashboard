import { Download, ExternalLink, Play, WifiOff } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCreateSession, useEndSession, useSessions } from '@/hooks/use-sessions-data';
import { downloadCsv, toCsv, type CsvColumn } from '@/lib/csv';
import { formatDateTime, formatNumber } from '@/lib/format';
import {
  sessionTypeHints,
  sessionTypeLabels,
} from '@/lib/session-labels';
import { modeStyle, sessionStatusStyle } from '@/lib/status-style';
import type { CreateSessionInput, SessionListItem, SessionType } from '@/types/api';

const sessionTypes = [
  'SENSOR',
  'PENGHINDARAN',
  'JARAK_BERHENTI',
  'DAYA',
  'KONEKSI_PUTUS',
  'STOP',
] as const;

function optionalNumberText(minimum: number, maximum: number, label: string) {
  return z.string().optional().refine(
    (value) =>
      value === undefined ||
      value === '' ||
      (Number.isFinite(Number(value)) && Number(value) >= minimum && Number(value) <= maximum),
    `${label} harus berupa angka ${minimum}-${maximum}.`,
  );
}

const sessionSchema = z.object({
  name: z.string().min(3, 'Nama sesi minimal 3 karakter.'),
  type: z.enum(sessionTypes),
  obstacleType: z.string().optional(),
  obstacleSize: z.string().optional(),
  floorSurface: z.string().optional(),
  laneWidthCm: optionalNumberText(10, 300, 'Lebar lintasan'),
  batteryLevel: z.string().optional(),
  pwmSetting: optionalNumberText(0, 255, 'PWM'),
  notes: z.string().optional(),
});

type SessionFormValues = z.infer<typeof sessionSchema>;

const defaultSessionValues: SessionFormValues = {
  name: '',
  type: 'PENGHINDARAN',
  obstacleType: '',
  obstacleSize: '',
  floorSurface: 'keramik',
  laneWidthCm: '',
  batteryLevel: 'penuh',
  pwmSetting: '',
  notes: '',
};

function numberOrNull(value: string | undefined): number | null {
  return value === undefined || value === '' ? null : Number(value);
}

function textOrNull(value: string | undefined): string | null {
  return value === undefined || value.trim() === '' ? null : value.trim();
}

function exportSessions(rows: SessionListItem[]) {
  const columns: CsvColumn<SessionListItem>[] = [
    { label: 'ID', value: (row) => row.id },
    { label: 'Nama', value: (row) => row.name },
    { label: 'Tipe', value: (row) => sessionTypeLabels[row.type] },
    { label: 'Mode', value: (row) => row.mode },
    { label: 'Status', value: (row) => row.status },
    { label: 'Mulai', value: (row) => row.startedAt },
    { label: 'Selesai', value: (row) => row.endedAt },
    { label: 'Percobaan', value: (row) => row.trialCount },
    { label: 'Keberhasilan (%)', value: (row) => row.successRatePct },
  ];
  downloadCsv('sesi-uji.csv', toCsv(rows, columns));
}

export function SessionsPage() {
  const navigate = useNavigate();
  const sessions = useSessions();
  const createSession = useCreateSession();
  const endSession = useEndSession();
  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema),
    defaultValues: defaultSessionValues,
  });
  const selectedType = watch('type');

  const onSubmit = (values: SessionFormValues) => {
    const input: CreateSessionInput = {
      type: values.type as SessionType,
      name: values.name.trim(),
      obstacleType: textOrNull(values.obstacleType),
      obstacleSize: textOrNull(values.obstacleSize),
      floorSurface: textOrNull(values.floorSurface),
      laneWidthCm: numberOrNull(values.laneWidthCm),
      batteryLevel: textOrNull(values.batteryLevel),
      pwmSetting: numberOrNull(values.pwmSetting),
      notes: textOrNull(values.notes),
    };

    createSession.mutate(input, {
      onSuccess: (session) => {
        toast('Sesi uji dibuat (demo).');
        reset(defaultSessionValues);
        navigate(`/sessions/${session.id}`);
      },
      onError: (error) => toast(error.message),
    });
  };

  const handleEnd = (session: SessionListItem) => {
    if (!window.confirm(`Akhiri sesi "${session.name}"?`)) {
      return;
    }
    endSession.mutate(session.id, {
      onSuccess: () => toast('Sesi diakhiri (demo).'),
      onError: (error) => toast(error.message),
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Buat Sesi Uji</CardTitle>
          <CardDescription>
            Hanya satu sesi dapat berjalan. Mode sesi mengikuti mode perangkat saat dibuat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="session-name">Nama sesi</Label>
                <Input id="session-name" placeholder="Contoh: Balok 20 cm - ambang 25 cm" {...register('name')} />
                {errors.name ? <p className="text-xs text-danger-text">{errors.name.message}</p> : null}
              </div>

              <div className="space-y-1.5">
                <Label>Tipe sesi</Label>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Tipe sesi">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {sessionTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {sessionTypeLabels[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground">{sessionTypeHints[selectedType]}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="obstacle-type">Jenis rintangan</Label>
                <Input id="obstacle-type" placeholder="balok, dinding, papan" {...register('obstacleType')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="obstacle-size">Ukuran rintangan</Label>
                <Input id="obstacle-size" placeholder="20x20 cm" {...register('obstacleSize')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="floor-surface">Permukaan lantai</Label>
                <Input id="floor-surface" placeholder="keramik" {...register('floorSurface')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lane-width">Lebar lintasan (cm)</Label>
                <Input id="lane-width" type="number" inputMode="numeric" min={10} max={300} {...register('laneWidthCm')} />
                {errors.laneWidthCm ? (
                  <p className="text-xs text-danger-text">{errors.laneWidthCm.message}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="battery-level">Baterai</Label>
                <Input id="battery-level" placeholder="penuh atau 7.6 V" {...register('batteryLevel')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pwm-setting">Setelan PWM (opsional)</Label>
                <Input id="pwm-setting" type="number" inputMode="numeric" min={0} max={255} {...register('pwmSetting')} />
                {errors.pwmSetting ? (
                  <p className="text-xs text-danger-text">{errors.pwmSetting.message}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="session-notes">Catatan</Label>
              <Textarea id="session-notes" placeholder="Konteks pengujian, kondisi, atau target." {...register('notes')} />
            </div>

            {createSession.isError ? (
              <p className="text-xs text-danger-text">{createSession.error.message}</p>
            ) : null}

            <Button type="submit" disabled={createSession.isPending}>
              <Play className="fill-current" strokeWidth={0} />
              {createSession.isPending ? 'Membuat...' : 'Mulai sesi'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Daftar Sesi</CardTitle>
            <CardDescription>
              {sessions.data ? `${formatNumber(sessions.data.length)} sesi tersimpan` : 'Memuat data'}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!sessions.data || sessions.data.length === 0}
            onClick={() => sessions.data && exportSessions(sessions.data)}
          >
            <Download className="size-4" strokeWidth={1.75} />
            Ekspor CSV
          </Button>
        </CardHeader>
        <CardContent>
          {sessions.isLoading ? (
            <Skeleton className="h-64" />
          ) : sessions.isError ? (
            <Alert variant="danger">
              <WifiOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
              <div>
                <AlertTitle>Daftar sesi gagal dimuat</AlertTitle>
                <AlertDescription>{sessions.error.message}</AlertDescription>
              </div>
            </Alert>
          ) : sessions.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada sesi. Buat sesi pertama di atas.</p>
          ) : (
            <div className="overflow-auto rounded-control border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Mulai</TableHead>
                    <TableHead>Percobaan</TableHead>
                    <TableHead>Berhasil</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.data?.map((session) => {
                    const mode = modeStyle(session.mode);
                    const status = sessionStatusStyle(session.status);
                    return (
                      <TableRow key={session.id}>
                        <TableCell>
                          <Link className="font-medium text-primary hover:underline" to={`/sessions/${session.id}`}>
                            {session.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">{session.id}</p>
                        </TableCell>
                        <TableCell>{sessionTypeLabels[session.type]}</TableCell>
                        <TableCell>
                          <Badge className={mode.className}>{mode.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={status.className}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(session.startedAt)}
                        </TableCell>
                        <TableCell>{formatNumber(session.trialCount)}</TableCell>
                        <TableCell>
                          {session.successRatePct === null
                            ? '-'
                            : `${formatNumber(Math.round(session.successRatePct))}%`}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" asChild>
                              <Link to={`/sessions/${session.id}`}>
                                <ExternalLink className="size-3.5" strokeWidth={1.75} />
                                Detail
                              </Link>
                            </Button>
                            {session.status === 'running' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEnd(session)}
                                disabled={endSession.isPending}
                              >
                                Akhiri
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
