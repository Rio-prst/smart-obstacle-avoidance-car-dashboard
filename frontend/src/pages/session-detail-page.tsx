import { ArrowLeft, Download, Plus, Trash2, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useParams } from 'react-router-dom';
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
import {
  useAddTrial,
  useDeleteTrial,
  useEndSession,
  useSession,
} from '@/hooks/use-sessions-data';
import { downloadCsv, toCsv, type CsvColumn } from '@/lib/csv';
import { formatDateTime, formatDecimal, formatNumber } from '@/lib/format';
import {
  sessionTypeLabels,
  trialResultClassNames,
  trialResultLabels,
} from '@/lib/session-labels';
import { modeStyle, sessionStatusStyle } from '@/lib/status-style';
import type {
  CreateTrialInput,
  SessionSummary,
  TestSession,
  TestTrial,
  TrialResult,
} from '@/types/api';

const trialResultOptions: TrialResult[] = ['SUCCESS', 'COLLISION', 'FAIL'];

const trialBaseSchema = z.object({
  result: z.string().optional(),
  refDistanceCm: z.string().optional(),
  measuredCm: z.string().optional(),
  valid: z.boolean(),
  pwm: z.string().optional(),
  stoppingDistanceCm: z.string().optional(),
  stopLatencyMs: z.string().optional(),
  note: z.string().optional(),
});

type TrialFormValues = z.infer<typeof trialBaseSchema>;

const defaultTrialValues: TrialFormValues = {
  result: '',
  refDistanceCm: '',
  measuredCm: '',
  valid: true,
  pwm: '',
  stoppingDistanceCm: '',
  stopLatencyMs: '',
  note: '',
};

function addNumberIssue(
  values: TrialFormValues,
  key: keyof TrialFormValues,
  label: string,
  minimum: number,
  maximum: number,
  ctx: z.RefinementCtx,
) {
  const value = values[key];
  if (typeof value !== 'string' || value.trim() === '') {
    ctx.addIssue({ code: 'custom', path: [key], message: `${label} wajib diisi.` });
    return;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    ctx.addIssue({
      code: 'custom',
      path: [key],
      message: `${label} harus ${minimum}-${maximum}.`,
    });
  }
}

function buildTrialSchema(type: TestSession['type']) {
  return trialBaseSchema.superRefine((values, ctx) => {
    if (type === 'PENGHINDARAN' || type === 'DAYA' || type === 'KONEKSI_PUTUS') {
      if (!values.result || !trialResultOptions.includes(values.result as TrialResult)) {
        ctx.addIssue({ code: 'custom', path: ['result'], message: 'Hasil wajib dipilih.' });
      }
    }

    if (type === 'SENSOR') {
      addNumberIssue(values, 'refDistanceCm', 'Jarak referensi', 5, 200, ctx);
      if (values.valid) {
        addNumberIssue(values, 'measuredCm', 'Jarak terukur', 5, 200, ctx);
      }
    }

    if (type === 'JARAK_BERHENTI') {
      addNumberIssue(values, 'pwm', 'PWM', 0, 255, ctx);
      addNumberIssue(values, 'stoppingDistanceCm', 'Jarak berhenti', 5, 200, ctx);
    }

    if (type === 'STOP') {
      addNumberIssue(values, 'stopLatencyMs', 'Latensi STOP', 0, 10000, ctx);
    }
  });
}

function numberOrNull(value: string | undefined): number | null {
  return value === undefined || value.trim() === '' ? null : Number(value);
}

function exportTrials(session: TestSession, trials: TestTrial[]) {
  const columns: CsvColumn<TestTrial>[] = [
    { label: 'No', value: (row) => row.trialNo },
    { label: 'Waktu', value: (row) => row.ts },
    { label: 'Hasil', value: (row) => row.result },
    { label: 'Referensi (cm)', value: (row) => row.refDistanceCm },
    { label: 'Terukur (cm)', value: (row) => row.measuredCm },
    { label: 'Valid', value: (row) => row.valid },
    { label: 'PWM', value: (row) => row.pwm },
    { label: 'Jarak berhenti (cm)', value: (row) => row.stoppingDistanceCm },
    { label: 'Latensi STOP (ms)', value: (row) => row.stopLatencyMs },
    { label: 'Catatan', value: (row) => row.note },
  ];
  downloadCsv(`sesi-${session.id}.csv`, toCsv(trials, columns));
}

interface AddTrialFormProps {
  session: TestSession;
}

function AddTrialForm({ session }: AddTrialFormProps) {
  const addTrial = useAddTrial();
  const schema = useMemo(() => buildTrialSchema(session.type), [session.type]);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TrialFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultTrialValues,
  });

  const onSubmit = (values: TrialFormValues) => {
    const input: CreateTrialInput = {
      result:
        session.type === 'PENGHINDARAN' ||
        session.type === 'DAYA' ||
        session.type === 'KONEKSI_PUTUS'
          ? (values.result as TrialResult)
          : null,
      refDistanceCm: session.type === 'SENSOR' ? numberOrNull(values.refDistanceCm) : null,
      measuredCm: session.type === 'SENSOR' ? numberOrNull(values.measuredCm) : null,
      valid: session.type === 'SENSOR' ? values.valid : null,
      pwm: session.type === 'JARAK_BERHENTI' ? numberOrNull(values.pwm) : null,
      stoppingDistanceCm:
        session.type === 'JARAK_BERHENTI' ? numberOrNull(values.stoppingDistanceCm) : null,
      stopLatencyMs: session.type === 'STOP' ? numberOrNull(values.stopLatencyMs) : null,
      note: values.note?.trim() === '' ? null : (values.note?.trim() ?? null),
    };

    addTrial.mutate(
      { sessionId: session.id, input },
      {
        onSuccess: () => {
          toast('Percobaan ditambahkan (demo).');
          reset(defaultTrialValues);
        },
        onError: (error) => toast(error.message),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tambah Percobaan</CardTitle>
        <CardDescription>
          Isi kolom sesuai tipe {sessionTypeLabels[session.type]}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(session.type === 'PENGHINDARAN' ||
              session.type === 'DAYA' ||
              session.type === 'KONEKSI_PUTUS') && (
              <div className="space-y-1.5">
                <Label>Hasil</Label>
                <Controller
                  control={control}
                  name="result"
                  render={({ field }) => (
                    <Select
                      value={field.value === '' ? undefined : field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger aria-label="Hasil percobaan">
                        <SelectValue placeholder="Pilih hasil" />
                      </SelectTrigger>
                      <SelectContent>
                        {trialResultOptions.map((result) => (
                          <SelectItem key={result} value={result}>
                            {trialResultLabels[result]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.result ? <p className="text-xs text-danger-text">{errors.result.message}</p> : null}
              </div>
            )}

            {session.type === 'SENSOR' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="ref-distance">Jarak referensi (cm)</Label>
                  <Input id="ref-distance" type="number" step="0.1" {...register('refDistanceCm')} />
                  {errors.refDistanceCm ? (
                    <p className="text-xs text-danger-text">{errors.refDistanceCm.message}</p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="measured-distance">Jarak terukur (cm)</Label>
                  <Input id="measured-distance" type="number" step="0.1" {...register('measuredCm')} />
                  {errors.measuredCm ? (
                    <p className="text-xs text-danger-text">{errors.measuredCm.message}</p>
                  ) : null}
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" className="size-4 accent-primary" {...register('valid')} />
                    Pembacaan valid
                  </label>
                </div>
              </>
            ) : null}

            {session.type === 'JARAK_BERHENTI' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="trial-pwm">PWM</Label>
                  <Input id="trial-pwm" type="number" {...register('pwm')} />
                  {errors.pwm ? <p className="text-xs text-danger-text">{errors.pwm.message}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stopping-distance">Jarak berhenti (cm)</Label>
                  <Input id="stopping-distance" type="number" step="0.1" {...register('stoppingDistanceCm')} />
                  {errors.stoppingDistanceCm ? (
                    <p className="text-xs text-danger-text">{errors.stoppingDistanceCm.message}</p>
                  ) : null}
                </div>
              </>
            ) : null}

            {session.type === 'STOP' ? (
              <div className="space-y-1.5">
                <Label htmlFor="stop-latency">Latensi STOP (ms)</Label>
                <Input id="stop-latency" type="number" {...register('stopLatencyMs')} />
                {errors.stopLatencyMs ? (
                  <p className="text-xs text-danger-text">{errors.stopLatencyMs.message}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trial-note">Catatan</Label>
            <Textarea id="trial-note" placeholder="Catatan opsional." {...register('note')} />
          </div>

          {addTrial.isError ? (
            <p className="text-xs text-danger-text">{addTrial.error.message}</p>
          ) : null}

          <Button type="submit" disabled={addTrial.isPending}>
            <Plus className="size-4" strokeWidth={1.75} />
            {addTrial.isPending ? 'Menyimpan...' : 'Tambah percobaan'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ summary }: { summary: SessionSummary }) {
  if (summary.type === 'PENGHINDARAN') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Penghindaran</CardTitle>
          <CardDescription>
            Target awal {summary.target?.success}/{summary.target?.trials} percobaan berhasil.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-control bg-success-subtle p-3">
            <p className="text-xs text-success-text">Berhasil</p>
            <p className="text-2xl font-semibold text-success-text">{summary.success ?? 0}</p>
          </div>
          <div className="rounded-control bg-danger-subtle p-3">
            <p className="text-xs text-danger-text">Tabrakan</p>
            <p className="text-2xl font-semibold text-danger-text">{summary.collision ?? 0}</p>
          </div>
          <div className="rounded-control bg-warning-subtle p-3">
            <p className="text-xs text-warning-text">Gagal</p>
            <p className="text-2xl font-semibold text-warning-text">{summary.fail ?? 0}</p>
          </div>
          <div className="rounded-control bg-primary-subtle p-3">
            <p className="text-xs text-primary-strong">Tingkat berhasil</p>
            <p className="text-2xl font-semibold text-primary-strong">
              {summary.successRatePct === null ? '-' : `${formatNumber(Math.round(summary.successRatePct))}%`}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (summary.type === 'SENSOR') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Sensor</CardTitle>
          <CardDescription>Error dihitung dari pembacaan valid.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referensi</TableHead>
                <TableHead>Percobaan</TableHead>
                <TableHead>Valid</TableHead>
                <TableHead>Tidak valid</TableHead>
                <TableHead>Error rata-rata</TableHead>
                <TableHead>Error maksimum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(summary.byPoint ?? []).map((point) => (
                <TableRow key={point.refCm}>
                  <TableCell>{formatDecimal(point.refCm)} cm</TableCell>
                  <TableCell>{formatNumber(point.n)}</TableCell>
                  <TableCell>{formatNumber(point.validN)}</TableCell>
                  <TableCell>{formatNumber(point.invalidN)}</TableCell>
                  <TableCell>{point.errorAvgCm === null ? '-' : `${formatDecimal(point.errorAvgCm)} cm`}</TableCell>
                  <TableCell>{point.errorMaxCm === null ? '-' : `${formatDecimal(point.errorMaxCm)} cm`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  if (summary.type === 'JARAK_BERHENTI') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Jarak Berhenti</CardTitle>
          <CardDescription>Kelompokkan hasil berdasarkan nilai PWM.</CardDescription>
        </CardHeader>
        <CardContent>
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
              {(summary.byPwm ?? []).map((point) => (
                <TableRow key={point.pwm}>
                  <TableCell>{formatNumber(point.pwm)}</TableCell>
                  <TableCell>{formatNumber(point.n)}</TableCell>
                  <TableCell>{point.avgCm === null ? '-' : `${formatDecimal(point.avgCm)} cm`}</TableCell>
                  <TableCell>{point.maxCm === null ? '-' : `${formatDecimal(point.maxCm)} cm`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  if (summary.type === 'STOP') {
    const avgLatency = summary.latencyMs?.avg ?? null;
    const maxLatency = summary.latencyMs?.max ?? null;
    const latencyCount = summary.latencyMs?.n ?? 0;

    return (
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Latensi STOP</CardTitle>
          <CardDescription>Waktu dari perintah sampai motor berhenti.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-control bg-surface-muted p-3">
            <p className="text-xs text-muted-foreground">Rata-rata</p>
            <p className="text-2xl font-semibold">
              {avgLatency === null ? '-' : `${formatNumber(Math.round(avgLatency))} ms`}
            </p>
          </div>
          <div className="rounded-control bg-surface-muted p-3">
            <p className="text-xs text-muted-foreground">Maksimum</p>
            <p className="text-2xl font-semibold">
              {maxLatency === null ? '-' : `${formatNumber(maxLatency)} ms`}
            </p>
          </div>
          <div className="rounded-control bg-surface-muted p-3">
            <p className="text-xs text-muted-foreground">Percobaan</p>
            <p className="text-2xl font-semibold">{formatNumber(latencyCount)}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ringkasan Hasil</CardTitle>
        <CardDescription>Rekap hasil percobaan pada sesi ini.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.keys(summary.byResult ?? {}).length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada hasil.</p>
        ) : (
          Object.entries(summary.byResult ?? {}).map(([result, count]) => (
            <div key={result} className="flex items-center justify-between rounded-control bg-surface-muted px-3 py-2 text-sm">
              <span>{trialResultLabels[result as TrialResult] ?? result}</span>
              <span className="font-medium">{formatNumber(count)}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function SessionDetailPage() {
  const { sid } = useParams<{ sid: string }>();
  const detail = useSession(sid);
  const endSession = useEndSession();
  const deleteTrial = useDeleteTrial();

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <Alert variant="danger" className="max-w-2xl">
        <WifiOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
        <div className="space-y-2">
          <AlertTitle>Sesi gagal dimuat</AlertTitle>
          <AlertDescription>{detail.error?.message ?? 'Sesi tidak ditemukan.'}</AlertDescription>
          <Button variant="outline" size="sm" asChild>
            <Link to="/sessions">Kembali ke Sesi Uji</Link>
          </Button>
        </div>
      </Alert>
    );
  }

  const { session, trials, summary } = detail.data;
  const mode = modeStyle(session.mode);
  const status = sessionStatusStyle(session.status);
  const showResult =
    session.type === 'PENGHINDARAN' ||
    session.type === 'DAYA' ||
    session.type === 'KONEKSI_PUTUS';
  const showSensor = session.type === 'SENSOR';
  const showStopDistance = session.type === 'JARAK_BERHENTI';
  const showLatency = session.type === 'STOP';
  const columnCount =
    4 + (showResult ? 1 : 0) + (showSensor ? 3 : 0) + (showStopDistance ? 2 : 0) + (showLatency ? 1 : 0);

  const handleEnd = () => {
    if (!window.confirm(`Akhiri sesi "${session.name}"?`)) {
      return;
    }
    endSession.mutate(session.id, {
      onSuccess: () => toast('Sesi diakhiri (demo).'),
      onError: (error) => toast(error.message),
    });
  };

  const handleDelete = (trial: TestTrial) => {
    if (!window.confirm(`Hapus percobaan #${trial.trialNo}?`)) {
      return;
    }
    deleteTrial.mutate(
      { sessionId: session.id, trialId: trial.id },
      {
        onSuccess: () => toast('Percobaan dihapus (demo).'),
        onError: (error) => toast(error.message),
      },
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/sessions">
            <ArrowLeft className="size-4" strokeWidth={1.75} />
            Kembali
          </Link>
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-foreground">{session.name}</h2>
          <p className="text-xs text-muted-foreground">
            {session.id} · {sessionTypeLabels[session.type]}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge className={mode.className}>{mode.label}</Badge>
          <Badge className={status.className}>{status.label}</Badge>
          <Button
            variant="outline"
            size="sm"
            disabled={trials.length === 0}
            onClick={() => exportTrials(session, trials)}
          >
            <Download className="size-4" strokeWidth={1.75} />
            Ekspor CSV
          </Button>
          {session.status === 'running' ? (
            <Button variant="destructive" size="sm" onClick={handleEnd} disabled={endSession.isPending}>
              Akhiri sesi
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Metadata Sesi</CardTitle>
          <CardDescription>Konfigurasi dan kondisi saat sesi dibuat.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Mulai</p><p>{formatDateTime(session.startedAt)}</p></div>
          <div><p className="text-xs text-muted-foreground">Selesai</p><p>{session.endedAt ? formatDateTime(session.endedAt) : '-'}</p></div>
          <div><p className="text-xs text-muted-foreground">Rintangan</p><p>{session.obstacleType ?? '-'} {session.obstacleSize ? `· ${session.obstacleSize}` : ''}</p></div>
          <div><p className="text-xs text-muted-foreground">Lantai / lintasan</p><p>{session.floorSurface ?? '-'} {session.laneWidthCm === null ? '' : `· ${session.laneWidthCm} cm`}</p></div>
          <div><p className="text-xs text-muted-foreground">Baterai</p><p>{session.batteryLevel ?? '-'}</p></div>
          <div><p className="text-xs text-muted-foreground">PWM sesi</p><p>{session.pwmSetting === null ? '-' : formatNumber(session.pwmSetting)}</p></div>
          <div><p className="text-xs text-muted-foreground">Ambang STOP</p><p>{session.configSnapshot.stopCm} cm</p></div>
          <div><p className="text-xs text-muted-foreground">Config versi</p><p>v{session.configSnapshot.ver}</p></div>
          {session.notes ? (
            <div className="sm:col-span-2 xl:col-span-4">
              <p className="text-xs text-muted-foreground">Catatan</p>
              <p className="text-muted-foreground">{session.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <SummaryCard summary={summary} />

      {session.status === 'running' ? (
        <AddTrialForm key={`${session.id}-${session.type}`} session={session} />
      ) : (
        <Alert>
          <AlertTitle>Sesi sudah berakhir</AlertTitle>
          <AlertDescription>Percobaan tidak dapat ditambah atau dihapus pada sesi selesai.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Percobaan</CardTitle>
          <CardDescription>{formatNumber(trials.length)} percobaan tercatat.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-control border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No</TableHead>
                  <TableHead>Waktu</TableHead>
                  {showResult ? <TableHead>Hasil</TableHead> : null}
                  {showSensor ? (
                    <>
                      <TableHead>Referensi</TableHead>
                      <TableHead>Terukur</TableHead>
                      <TableHead>Valid</TableHead>
                    </>
                  ) : null}
                  {showStopDistance ? (
                    <>
                      <TableHead>PWM</TableHead>
                      <TableHead>Jarak berhenti</TableHead>
                    </>
                  ) : null}
                  {showLatency ? <TableHead>Latensi</TableHead> : null}
                  <TableHead>Catatan</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trials.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columnCount} className="text-center text-muted-foreground">
                      Belum ada percobaan.
                    </TableCell>
                  </TableRow>
                ) : (
                  trials.map((trial) => {
                    const result = trial.result;
                    const refLabel =
                      trial.refDistanceCm === null
                        ? '-'
                        : `${formatDecimal(trial.refDistanceCm)} cm`;
                    const measuredLabel =
                      trial.measuredCm === null
                        ? '-'
                        : `${formatDecimal(trial.measuredCm)} cm`;
                    const stoppingLabel =
                      trial.stoppingDistanceCm === null
                        ? '-'
                        : `${formatDecimal(trial.stoppingDistanceCm)} cm`;

                    return (
                      <TableRow key={trial.id}>
                        <TableCell>{trial.trialNo}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(trial.ts)}
                        </TableCell>
                        {showResult ? (
                          <TableCell>
                            {result ? (
                              <Badge className={trialResultClassNames[result]}>
                                {trialResultLabels[result]}
                              </Badge>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                        ) : null}
                        {showSensor ? (
                          <>
                            <TableCell>{refLabel}</TableCell>
                            <TableCell>{measuredLabel}</TableCell>
                            <TableCell>
                              {trial.valid === null ? '-' : trial.valid ? 'Ya' : 'Tidak'}
                            </TableCell>
                          </>
                        ) : null}
                        {showStopDistance ? (
                          <>
                            <TableCell>{trial.pwm === null ? '-' : formatNumber(trial.pwm)}</TableCell>
                            <TableCell>{stoppingLabel}</TableCell>
                          </>
                        ) : null}
                        {showLatency ? (
                          <TableCell>
                            {trial.stopLatencyMs === null
                              ? '-'
                              : `${formatNumber(trial.stopLatencyMs)} ms`}
                          </TableCell>
                        ) : null}
                        <TableCell className="max-w-56 text-xs text-muted-foreground">
                          {trial.note ?? '-'}
                        </TableCell>
                        <TableCell>
                          {session.status === 'running' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(trial)}
                              disabled={deleteTrial.isPending}
                            >
                              <Trash2 className="size-3.5" strokeWidth={1.75} />
                              Hapus
                            </Button>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
