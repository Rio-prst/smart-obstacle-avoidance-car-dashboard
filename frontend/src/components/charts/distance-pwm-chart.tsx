import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartPoint } from '@/lib/dashboard';

interface DistancePwmChartProps {
  data: ChartPoint[];
}

export function DistancePwmChart({ data }: DistancePwmChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
          minTickGap={32}
        />
        <YAxis
          yAxisId="distance"
          domain={[0, 120]}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <YAxis
          yAxisId="pwm"
          orientation="right"
          domain={[0, 255]}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <RechartsTooltip
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--control-radius)',
            boxShadow: 'var(--popover-shadow)',
            color: 'var(--foreground)',
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
        />
        <Line
          yAxisId="distance"
          type="monotone"
          dataKey="distCm"
          name="Jarak"
          unit=" cm"
          stroke="var(--primary)"
          strokeWidth={1.5}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Line
          yAxisId="pwm"
          type="monotone"
          dataKey="pwm"
          name="PWM"
          unit=" PWM"
          stroke="var(--primary-soft)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
