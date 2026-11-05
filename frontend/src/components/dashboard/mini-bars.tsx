import { cn } from '@/lib/utils';

interface MiniBarsProps {
  values: number[];
  className?: string;
}

export function MiniBars({ values, className }: MiniBarsProps) {
  const maximum = Math.max(...values, 1);

  return (
    <div className={cn('flex h-10 items-end gap-1', className)} aria-hidden="true">
      {values.map((value, index) => (
        <span
          key={index}
          className={cn(
            'flex-1 rounded-t-[4px]',
            value > 0 ? 'bg-primary' : 'bg-primary-subtle',
          )}
          style={{ height: `${Math.max(8, (value / maximum) * 100)}%` }}
        />
      ))}
    </div>
  );
}
