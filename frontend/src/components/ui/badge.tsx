import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-chip px-2 py-0.5 text-xs font-medium leading-4',
  {
    variants: {
      variant: {
        default: 'bg-primary-subtle text-primary-strong',
        secondary: 'bg-neutral-subtle text-muted-foreground',
        outline: 'border border-border bg-surface text-muted-foreground',
        success: 'bg-success-subtle text-success-text',
        warning: 'bg-warning-subtle text-warning-text',
        danger: 'bg-danger-subtle text-danger-text',
        neutral: 'bg-neutral-subtle text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type BadgeProps = React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge };
