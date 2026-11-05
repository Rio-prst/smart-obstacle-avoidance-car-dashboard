import { Save, ShieldAlert, WifiOff } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useDeviceConfig, useUpdateConfig } from '@/hooks/use-config-data';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { DeviceConfig } from '@/types/api';

const configSchema = z
  .object({
    stopCm: z.coerce
      .number({ invalid_type_error: 'Ambang STOP harus berupa angka.' })
      .int('Gunakan bilangan bulat.')
      .min(15, 'Ambang STOP minimal 15 cm.')
      .max(100, 'Ambang STOP maksimal 100 cm.'),
    resumeCm: z.coerce
      .number({ invalid_type_error: 'Ambang lanjut harus berupa angka.' })
      .int('Gunakan bilangan bulat.')
      .min(18, 'Ambang lanjut minimal 18 cm.')
      .max(150, 'Ambang lanjut maksimal 150 cm.'),
    maxPwm: z.coerce
      .number({ invalid_type_error: 'PWM maksimum harus berupa angka.' })
      .int('Gunakan bilangan bulat.')
      .min(80, 'PWM maksimum minimal 80.')
      .max(255, 'PWM maksimum maksimal 255.'),
    manualMaxPwm: z.coerce
      .number({ invalid_type_error: 'PWM manual harus berupa angka.' })
      .int('Gunakan bilangan bulat.')
      .min(80, 'PWM manual minimal 80.')
      .max(180, 'PWM manual maksimal 180.'),
  })
  .superRefine((values, ctx) => {
    if (values.resumeCm < values.stopCm + 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['resumeCm'],
        message: 'Ambang lanjut minimal 3 cm di atas ambang STOP.',
      });
    }
    if (values.manualMaxPwm > values.maxPwm) {
      ctx.addIssue({
        code: 'custom',
        path: ['manualMaxPwm'],
        message: 'PWM manual tidak boleh melebihi PWM maksimum.',
      });
    }
  });

type ConfigFormValues = z.infer<typeof configSchema>;

function configToValues(config: DeviceConfig): ConfigFormValues {
  return {
    stopCm: config.stopCm,
    resumeCm: config.resumeCm,
    maxPwm: config.maxPwm,
    manualMaxPwm: config.manualMaxPwm,
  };
}

export function ConfigPage() {
  const config = useDeviceConfig();
  const updateConfig = useUpdateConfig();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      stopCm: 25,
      resumeCm: 30,
      maxPwm: 200,
      manualMaxPwm: 150,
    },
  });

  useEffect(() => {
    if (config.data) {
      reset(configToValues(config.data));
    }
  }, [config.data, reset]);

  const onSubmit = (values: ConfigFormValues) => {
    updateConfig.mutate(values, {
      onSuccess: (updated) => {
        toast(`Konfigurasi v${updated.ver} disimpan (demo).`);
        reset(configToValues(updated));
      },
      onError: (error) => toast(error.message),
    });
  };

  if (config.isLoading) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (config.isError || !config.data) {
    return (
      <Alert variant="danger" className="max-w-2xl">
        <WifiOff className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
        <div>
          <AlertTitle>Konfigurasi gagal dimuat</AlertTitle>
          <AlertDescription>{config.error?.message ?? 'Terjadi kesalahan.'}</AlertDescription>
        </div>
      </Alert>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Konfigurasi Perangkat</CardTitle>
          <CardDescription>
            Versi {formatNumber(config.data.ver)} · diperbarui {formatDateTime(config.data.updatedAt)} WIB
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stop-cm">Ambang STOP (cm)</Label>
                <Input id="stop-cm" type="number" min={15} max={100} {...register('stopCm')} />
                <p className="text-xs text-muted-foreground">Rentang 15-100 cm.</p>
                {errors.stopCm ? <p className="text-xs text-danger-text">{errors.stopCm.message}</p> : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="resume-cm">Ambang lanjut (cm)</Label>
                <Input id="resume-cm" type="number" min={18} max={150} {...register('resumeCm')} />
                <p className="text-xs text-muted-foreground">
                  Minimal 3 cm di atas ambang STOP, maksimal 150 cm.
                </p>
                {errors.resumeCm ? <p className="text-xs text-danger-text">{errors.resumeCm.message}</p> : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="max-pwm">PWM maksimum</Label>
                <Input id="max-pwm" type="number" min={80} max={255} {...register('maxPwm')} />
                <p className="text-xs text-muted-foreground">Rentang 80-255 PWM.</p>
                {errors.maxPwm ? <p className="text-xs text-danger-text">{errors.maxPwm.message}</p> : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="manual-max-pwm">PWM manual maksimum</Label>
                <Input id="manual-max-pwm" type="number" min={80} max={180} {...register('manualMaxPwm')} />
                <p className="text-xs text-muted-foreground">
                  Rentang 80-180 PWM dan tidak melebihi PWM maksimum.
                </p>
                {errors.manualMaxPwm ? (
                  <p className="text-xs text-danger-text">{errors.manualMaxPwm.message}</p>
                ) : null}
              </div>
            </div>

            {updateConfig.isError ? (
              <p className="text-xs text-danger-text">{updateConfig.error.message}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={updateConfig.isPending}>
                <Save className="size-4" strokeWidth={1.75} />
                {updateConfig.isPending ? 'Menyimpan...' : 'Simpan konfigurasi'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Perubahan hanya tersimpan di memori demo sampai halaman dimuat ulang.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Nilai Aktif</CardTitle>
            <CardDescription>Snapshot konfigurasi yang dipakai simulator.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-control bg-surface-muted px-3 py-2">
              <span className="text-muted-foreground">Ambang STOP</span>
              <span className="font-medium">{config.data.stopCm} cm</span>
            </div>
            <div className="flex items-center justify-between rounded-control bg-surface-muted px-3 py-2">
              <span className="text-muted-foreground">Ambang lanjut</span>
              <span className="font-medium">{config.data.resumeCm} cm</span>
            </div>
            <div className="flex items-center justify-between rounded-control bg-surface-muted px-3 py-2">
              <span className="text-muted-foreground">PWM maksimum</span>
              <span className="font-medium">{formatNumber(config.data.maxPwm)}</span>
            </div>
            <div className="flex items-center justify-between rounded-control bg-surface-muted px-3 py-2">
              <span className="text-muted-foreground">PWM manual maksimum</span>
              <span className="font-medium">{formatNumber(config.data.manualMaxPwm)}</span>
            </div>
          </CardContent>
        </Card>

        <Alert variant="warning">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <div>
            <AlertTitle>Batas keselamatan</AlertTitle>
            <AlertDescription>
              Konfigurasi ini hanya untuk simulasi. Validasi perangkat nyata dan switch fisik
              tetap wajib sebelum pengujian.
            </AlertDescription>
          </div>
        </Alert>
      </div>
    </div>
  );
}
