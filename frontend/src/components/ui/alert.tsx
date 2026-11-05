import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'flex items-start gap-3 rounded-control border px-3 py-2.5 text-sm',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface-muted text-foreground',
        warning: 'border-warning/40 bg-warning-subtle text-warning-text',
        danger: 'border-danger/40 bg-danger-subtle text-danger-text',
        success: 'border-success/40 bg-success-subtle text-success-text',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type AlertProps = React.ComponentProps<'div'> &
  VariantProps<typeof alertVariants>;

function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div
      role="alert"
      data-slot="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('font-medium', className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-xs leading-5', className)} {...props} />;
}

export { Alert, AlertDescription, AlertTitle };
