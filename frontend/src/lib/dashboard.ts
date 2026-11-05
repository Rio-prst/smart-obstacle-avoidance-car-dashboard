import type { Telemetry } from '@/types/api';
import { formatWibShort, formatWibTime } from './format';

export type ChartRange = '5m' | '15m' | '60m';

export const chartRangeLabels: Record<ChartRange, string> = {
  '5m': '5 menit',
  '15m': '15 menit',
  '60m': '60 menit',
};

const rangeMs: Record<ChartRange, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '60m': 60 * 60 * 1000,
};

export interface ChartPoint {
  label: string;
  distCm: number | null;
  pwm: number;
  valid: boolean;
}

export function buildChartPoints(telemetry: Telemetry[], range: ChartRange): ChartPoint[] {
  if (telemetry.length === 0) {
    return [];
  }

  const end = new Date(telemetry[telemetry.length - 1].ts).getTime();
  const start = end - rangeMs[range];
  const filtered = telemetry.filter((point) => new Date(point.ts).getTime() >= start);
  const step = Math.max(1, Math.ceil(filtered.length / 240));
  const sampled = filtered.filter(
    (_, index) => index % step === 0 || index === filtered.length - 1,
  );

  return sampled.map((point) => ({
    label: range === '60m' ? formatWibShort(point.ts) : formatWibTime(point.ts),
    distCm: point.valid ? point.distCm : null,
    pwm: point.pwm,
    valid: point.valid,
  }));
}

export function buildAvoidanceBuckets(
  telemetry: Telemetry[],
  bucketCount = 12,
  bucketMs = 5 * 60 * 1000,
): number[] {
  if (telemetry.length === 0) {
    return Array.from({ length: bucketCount }, () => 0);
  }

  const sorted = [...telemetry].sort((first, second) => first.ts.localeCompare(second.ts));
  const end = new Date(sorted[sorted.length - 1].ts).getTime();
  const start = end - bucketCount * bucketMs;
  const buckets = Array.from({ length: bucketCount }, () => 0);

  for (let index = 1; index < sorted.length; index += 1) {
    const point = sorted[index];
    const pointTime = new Date(point.ts).getTime();

    if (pointTime < start) {
      continue;
    }

    const delta = Math.max(0, point.avoidCount - sorted[index - 1].avoidCount);

    if (delta > 0) {
      const bucketIndex = Math.min(
        bucketCount - 1,
        Math.floor((pointTime - start) / bucketMs),
      );
      buckets[bucketIndex] += delta;
    }
  }

  return buckets;
}

export function getDistanceValues(telemetry: Telemetry[], count = 30): number[] {
  return telemetry
    .slice(-count)
    .flatMap((point) => (point.valid && point.distCm !== null ? [point.distCm] : []));
}

export function getRssiValues(telemetry: Telemetry[], count = 30): number[] {
  return telemetry
    .slice(-count)
    .flatMap((point) => (point.rssi !== null ? [point.rssi] : []));
}
