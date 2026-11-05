import { ArrowLeft, ArrowRight, ArrowUp, Hand, LogOut, Play, Square, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAcquireControl,
  useControlSnapshot,
  useDriveControl,
  useReleaseControl,
  useSetMode,
} from '@/hooks/use-control-data';
import { useStartCommand, useStopCommand } from '@/hooks/use-dashboard-data';
import type { DriveDirection } from '@/data/mock/simulator';
import { formatCm, formatDataAge, formatDateTime, formatMs, formatNumber } from '@/lib/format';
import {
  commandStatusStyle,
  connectionStatusStyle,
  dataValidityStyle,
  modeStyle,
  stateStyle,
} from '@/lib/status-style';
import { cn } from '@/lib/utils';
import type { DeviceMode } from '@/types/api';

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-control border border-border bg-surface-muted px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

export function ControlPage() {
  const { data, isLoading, isError, error, refetch } = useControlSnapshot();
  const setMode = useSetMode();
  const acquire = useAcquireControl();
  const release = useReleaseControl();
  const drive = useDriveControl();
  const startCommand = useStartCommand();
  const stopCommand = useStopCommand();
  const [speed, setSpeed] = useState(60);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeDirection = useRef<DriveDirection | null>(null);
  const speedRef = useRef(speed);
  const driveRef = useRef(drive);
  speedRef.current = speed;
  driveRef.current = drive;

  const clearHold = (sendStop: boolean) => {
    if (holdTimer.current !== null) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
    const direction = activeDirection.current;
    activeDirection.current = null;
    if (sendStop && direction !== null) {
      driveRef.current.mutate({ direction: 'S', speed: speedRef.current });
    }
  };

  useEffect(() => {
    return () => clearHold(false);
  }, []);

  if (isLoading) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Alert variant="danger" className="max-w-2xl">
        <WifiOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
        <div className="space-y-2">
          <AlertTitle>Kendali gagal dimuat</AlertTitle>
          <AlertDescription>{error?.message ?? 'Terjadi kesalahan.'}</AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Coba lagi
          </Button>
        </div>
      </Alert>
    );
  }

  const { device, latest, controller, config, rttMs, dataAgeSeconds, commands } = data;
  const connection = connectionStatusStyle(device.online, dataAgeSeconds > 5);
  const validity = dataValidityStyle(latest.valid);
  const mode = modeStyle(device.mode);
  const state = stateStyle(device.state);
  const canSwitchMode = device.online && device.state === 'STOP';
  const canDrive = device.mode === 'MANUAL' && controller !== null && device.online;
  const startDisabledReason = !device.online
    ? 'Perangkat offline.'
    : device.mode !== 'AUTO'
      ? 'Mode MANUAL tidak menerima START.'
      : device.state !== 'STOP'
        ? 'Perangkat harus STOP sebelum START.'
        : null;

  const handleStart = () => {
    startCommand.mutate(undefined, {
      onSuccess: () => toast('Perintah START dikirim (demo)'),
      onError: (mutationError) => toast(mutationError.message),
    });
  };

  const handleModeChange = (value: string) => {
    const next = value as DeviceMode;
    setMode.mutate(next, {
      onSuccess: () => toast(`Mode ${next} aktif (demo)`),
      onError: (mutationError) => toast(mutationError.message),
    });
  };

  const beginHold = (direction: DriveDirection) => {
    if (!canDrive) {
      return;
    }
    clearHold(false);
    activeDirection.current = direction;
    drive.mutate({ direction, speed });
    holdTimer.current = setInterval(() => {
      driveRef.current.mutate({ direction, speed: speedRef.current });
    }, 300);
  };

  const handleStop = () => {
    clearHold(false);
    stopCommand.mutate(undefined, {
      onSuccess: () => toast('Perintah STOP dikirim (demo)'),
      onError: (mutationError) => toast(mutationError.message),
    });
  };

  return (
    <div className="space-y-6">
      {!device.online ? (
        <Alert variant="danger">
          <WifiOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <div>
            <AlertTitle>Perangkat offline</AlertTitle>
            <AlertDescription>
              Data terakhir {formatDataAge(dataAgeSeconds)}. START dan gerak manual dinonaktifkan.
              STOP tetap tersedia, tetapi pengiriman bisa terlambat atau gagal.
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Status Perangkat</CardTitle>
              <CardDescription>Nilai terakhir dari simulator lokal.</CardDescription>
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              <Badge className={connection.className}>{connection.label}</Badge>
              <Badge className={mode.className}>{mode.label}</Badge>
              <Badge className={state.className}>{state.label}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Jarak depan" value={formatCm(latest.distCm, latest.valid)} />
            <Stat
              label="Validitas sensor"
              value={<Badge className={validity.className}>{validity.label}</Badge>}
            />
            <Stat label="Perintah PWM" value={`${formatNumber(latest.pwm)} PWM`} />
            <Stat label="Data" value={`${formatDataAge(dataAgeSeconds)} · ${formatMs(rttMs)}`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mode Kendali</CardTitle>
            <CardDescription>Ganti mode hanya saat perangkat STOP.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select
              value={device.mode}
              onValueChange={handleModeChange}
              disabled={!canSwitchMode || setMode.isPending}
            >
              <SelectTrigger aria-label="Pilih mode kendali">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AUTO">AUTO</SelectItem>
                <SelectItem value="MANUAL">MANUAL</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              {device.state === 'STOP'
                ? 'Perangkat berhenti. Mode dapat diganti.'
                : 'Tekan STOP terlebih dahulu sebelum mengganti mode.'}
            </p>
            {setMode.isError ? (
              <p className="text-xs text-danger-text">{setMode.error.message}</p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Perintah</CardTitle>
          <CardDescription>
            START menjalankan mode AUTO. STOP tersedia di semua mode tanpa mengambil kendali manual.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              size="lg"
              className="w-full"
              onClick={handleStart}
              disabled={Boolean(startDisabledReason) || startCommand.isPending}
              aria-describedby="control-start-help"
            >
              <Play className="fill-current" strokeWidth={0} />
              {startCommand.isPending ? 'Mengirim START…' : 'START'}
            </Button>
            <Button
              variant="destructive"
              size="lg"
              className="min-h-12 w-full"
              onClick={handleStop}
            >
              <Square className="fill-current" strokeWidth={0} />
              STOP
            </Button>
          </div>
          <p id="control-start-help" className="text-xs text-muted-foreground">
            {startDisabledReason ??
              'START tersedia saat perangkat online, mode AUTO, dan state STOP.'}
          </p>
          <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
            STOP dari dashboard bukan penghentian darurat. Siapkan switch fisik.
          </p>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Kendali Manual</CardTitle>
            <CardDescription>
              Tahan tombol arah untuk bergerak. Lepas tombol untuk mengirim STOP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {device.mode !== 'MANUAL' ? (
              <Alert>
                <Hand className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                <div>
                  <AlertTitle>Mode MANUAL belum aktif</AlertTitle>
                  <AlertDescription>
                    Ganti mode ke MANUAL saat perangkat STOP untuk membuka kendali manual.
                  </AlertDescription>
                </div>
              </Alert>
            ) : controller === null ? (
              <div className="flex flex-col gap-3 rounded-control border border-border bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Ambil kendali manual</p>
                  <p className="text-xs text-muted-foreground">
                    Kontrol berlaku 30 detik dan diperbarui saat Anda menggerakkan mobil.
                  </p>
                </div>
                <Button
                  onClick={() =>
                    acquire.mutate(undefined, {
                      onSuccess: () => toast('Kendali manual diambil (demo)'),
                      onError: (mutationError) => toast(mutationError.message),
                    })
                  }
                  disabled={acquire.isPending || !device.online}
                >
                  <Hand className="size-4" strokeWidth={1.75} />
                  Ambil kendali
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-control border border-success/40 bg-success-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-success-text">
                    Kendali aktif oleh {controller.username}
                  </p>
                  <p className="text-xs text-success-text">
                    Berlaku sampai {formatDateTime(controller.until)} WIB.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    release.mutate(undefined, {
                      onSuccess: () => toast('Kendali manual dilepas (demo)'),
                      onError: (mutationError) => toast(mutationError.message),
                    })
                  }
                  disabled={release.isPending}
                >
                  <LogOut className="size-4" strokeWidth={1.75} />
                  Lepas kendali
                </Button>
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
              <div className="mx-auto grid w-[208px] grid-cols-3 grid-rows-[64px_64px] gap-2">
                <span />
                <Button
                  variant="outline"
                  className="h-16"
                  aria-label="Maju"
                  disabled={!canDrive}
                  onPointerDown={() => beginHold('F')}
                  onPointerUp={() => clearHold(true)}
                  onPointerLeave={() => clearHold(true)}
                  onPointerCancel={() => clearHold(true)}
                >
                  <ArrowUp className="size-5" strokeWidth={1.75} />
                </Button>
                <span />
                <Button
                  variant="outline"
                  className="h-16"
                  aria-label="Belok kiri"
                  disabled={!canDrive}
                  onPointerDown={() => beginHold('L')}
                  onPointerUp={() => clearHold(true)}
                  onPointerLeave={() => clearHold(true)}
                  onPointerCancel={() => clearHold(true)}
                >
                  <ArrowLeft className="size-5" strokeWidth={1.75} />
                </Button>
                <Button
                  variant="destructive"
                  className="h-16"
                  aria-label="Berhenti"
                  onClick={handleStop}
                >
                  <Square className="size-5 fill-current" strokeWidth={0} />
                </Button>
                <Button
                  variant="outline"
                  className="h-16"
                  aria-label="Belok kanan"
                  disabled={!canDrive}
                  onPointerDown={() => beginHold('R')}
                  onPointerUp={() => clearHold(true)}
                  onPointerLeave={() => clearHold(true)}
                  onPointerCancel={() => clearHold(true)}
                >
                  <ArrowRight className="size-5" strokeWidth={1.75} />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Intensitas gerak</span>
                    <span className="font-medium text-foreground">{speed}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={speed}
                    onChange={(event) => setSpeed(Number(event.target.value))}
                    className="mt-2 w-full accent-primary"
                    aria-label="Intensitas gerak manual"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Efektif sekitar {Math.round((speed / 100) * config.manualMaxPwm)} PWM. Batas
                    manual {config.manualMaxPwm} PWM.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Stat
                    label="State perintah"
                    value={<Badge className={state.className}>{state.label}</Badge>}
                  />
                  <Stat label="PWM aktif" value={`${formatNumber(latest.pwm)} PWM`} />
                </div>

                <Alert variant="warning">
                  <Hand className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                  <div>
                    <AlertTitle>Batas simulasi</AlertTitle>
                    <AlertDescription>
                      Kendali manual hanya simulasi. STOP perangkat tetap membutuhkan switch fisik.
                    </AlertDescription>
                  </div>
                </Alert>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Perintah Terakhir</CardTitle>
            <CardDescription>10 perintah terbaru dari simulator.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {commands.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada perintah.</p>
            ) : (
              commands.map((command) => {
                const status = commandStatusStyle(command.status);
                return (
                  <div
                    key={command.id}
                    className="flex items-center gap-2 rounded-control border border-border px-3 py-2"
                  >
                    <span className="font-mono text-xs text-muted-foreground">#{command.seq}</span>
                    <span className="text-sm font-medium text-foreground">{command.cmd}</span>
                    <Badge className={cn('ml-auto', status.className)}>{status.label}</Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
