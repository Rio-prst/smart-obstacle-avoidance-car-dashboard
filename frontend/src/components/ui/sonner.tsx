import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        style: {
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--foreground)',
          borderRadius: 'var(--control-radius)',
          boxShadow: 'var(--popover-shadow)',
        },
      }}
    />
  );
}
