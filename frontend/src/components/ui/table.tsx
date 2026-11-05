import * as React from 'react';
import { cn } from '@/lib/utils';

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-auto">
      <table
        data-slot="table"
        className={cn('w-full border-collapse text-sm', className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      className={cn('sticky top-0 bg-surface-muted text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr className={cn('h-11', className)} {...props} />;
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      className={cn('px-4 py-3 text-left font-medium first:rounded-l-control last:rounded-r-control', className)}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 text-foreground', className)} {...props} />;
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
