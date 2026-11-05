import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DistancePwmChart } from '@/components/charts/distance-pwm-chart';
import { chartRangeLabels, type ChartPoint, type ChartRange } from '@/lib/dashboard';

interface LiveChartPanelProps {
  data: ChartPoint[];
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function LiveChartPanel({ data, range, onRangeChange }: LiveChartPanelProps) {
  return (
    <Card className="xl:col-span-2">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Grafik Langsung</CardTitle>
          <CardDescription>Jarak depan dan perintah PWM</CardDescription>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 sm:flex">
            <LegendItem color="var(--primary)" label="Jarak" />
            <LegendItem color="var(--primary-soft)" label="PWM" />
          </div>
          <Select value={range} onValueChange={(value) => onRangeChange(value as ChartRange)}>
            <SelectTrigger className="w-[110px]" aria-label="Rentang grafik">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {(Object.keys(chartRangeLabels) as ChartRange[]).map((item) => (
                <SelectItem key={item} value={item}>
                  {chartRangeLabels[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {data.length >= 2 ? (
          <DistancePwmChart data={data} />
        ) : (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            Belum ada data pada rentang ini.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
