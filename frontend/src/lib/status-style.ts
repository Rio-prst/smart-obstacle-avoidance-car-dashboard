import type { DeviceMode, DeviceState } from '@/types/api';

export interface StatusStyle {
  label: string;
  className: string;
}

const onlineStyle: StatusStyle = {
  label: 'Online',
  className: 'bg-success-subtle text-success-text',
};

const offlineStyle: StatusStyle = {
  label: 'Offline',
  className: 'bg-danger-subtle text-danger-text',
};

const staleStyle: StatusStyle = {
  label: 'Data tidak mutakhir',
  className: 'bg-warning-subtle text-warning-text',
};

export function connectionStatusStyle(online: boolean, stale: boolean): StatusStyle {
  if (!online) {
    return offlineStyle;
  }

  if (stale) {
    return staleStyle;
  }

  return onlineStyle;
}

export function dataValidityStyle(valid: boolean): StatusStyle {
  if (!valid) {
    return {
      label: 'Tidak valid',
      className: 'bg-warning-subtle text-warning-text',
    };
  }

  return {
    label: 'Valid',
    className: 'bg-success-subtle text-success-text',
  };
}

export function modeStyle(mode: DeviceMode): StatusStyle {
  if (mode === 'MANUAL') {
    return {
      label: 'MANUAL',
      className: 'bg-warning-subtle text-warning-text',
    };
  }

  return {
    label: 'AUTO',
    className: 'bg-neutral-subtle text-muted-foreground',
  };
}

const stateClassNames: Record<DeviceState, string> = {
  MAJU: 'bg-primary-subtle text-primary-strong',
  BELOK: 'bg-primary-subtle text-primary',
  PINDAI: 'bg-primary-subtle text-primary-soft',
  STOP: 'bg-neutral-subtle text-foreground',
};

export function stateStyle(state: DeviceState): StatusStyle {
  return {
    label: state,
    className: stateClassNames[state],
  };
}

export function commandStatusStyle(status: string): StatusStyle {
  switch (status) {
    case 'acked':
      return { label: 'Diterima', className: 'bg-success-subtle text-success-text' };
    case 'rejected':
      return { label: 'Ditolak', className: 'bg-danger-subtle text-danger-text' };
    case 'expired':
      return { label: 'Kedaluwarsa', className: 'bg-warning-subtle text-warning-text' };
    default:
      return { label: 'Menunggu', className: 'bg-neutral-subtle text-muted-foreground' };
  }
}

export function sessionStatusStyle(status: 'running' | 'ended'): StatusStyle {
  if (status === 'running') {
    return { label: 'Berjalan', className: 'bg-primary-subtle text-primary-strong' };
  }

  return { label: 'Selesai', className: 'bg-neutral-subtle text-muted-foreground' };
}
