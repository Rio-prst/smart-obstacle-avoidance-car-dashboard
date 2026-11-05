import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

interface SparklineProps {
  values: number[];
  className?: string;
}

export function Sparkline({ values, className }: SparklineProps) {
  if (values.length < 2) {
    return <div className={cn('h-10', className)} aria-hidden="true" />;
  }

  const data = values.map((value, index) => ({ index, value }));

  return (
    <div className={cn('h-10', className)} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--primary)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
