import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  title: string;
  value: ReactNode;
  valueClassName?: string;
  subtitle?: ReactNode;
  chip?: ReactNode;
  visual?: ReactNode;
  footerLabel: string;
  footerTo: string;
}

export function KpiCard({
  title,
  value,
  valueClassName,
  subtitle,
  chip,
  visual,
  footerLabel,
  footerTo,
}: KpiCardProps) {
  return (
    <Card className="overflow-hidden">
      <div className="flex min-h-[136px] flex-1 items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-[18px] text-foreground">{title}</p>
          <div
            className={cn(
              'mt-2 text-4xl font-semibold leading-10 tabular-nums text-foreground',
              valueClassName,
            )}
          >
            {value}
          </div>
          {subtitle ? (
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</div>
          ) : null}
          {chip ? <div className="mt-2">{chip}</div> : null}
        </div>
        {visual ? <div className="w-24 shrink-0 pt-1">{visual}</div> : null}
      </div>
      <Link
        to={footerTo}
        className="flex h-10 shrink-0 items-center justify-center gap-1 border-t border-border bg-surface-muted text-xs font-medium text-primary hover:bg-neutral-subtle"
      >
        {footerLabel}
        <ArrowRight className="size-3.5" strokeWidth={1.75} />
      </Link>
    </Card>
  );
}
