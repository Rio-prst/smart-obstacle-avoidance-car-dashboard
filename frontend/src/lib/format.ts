const numberFormatter = new Intl.NumberFormat('id-ID');

const decimalFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 1,
});

const wibTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  hourCycle: 'h23',
  timeZone: 'Asia/Jakarta',
});

const wibShortFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  hourCycle: 'h23',
  timeZone: 'Asia/Jakarta',
});

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  hourCycle: 'h23',
  timeZone: 'Asia/Jakarta',
});

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}

export function formatCm(value: number | null, valid: boolean): string {
  if (!valid || value === null) {
    return 'Tidak valid';
  }

  return `${formatDecimal(value)} cm`;
}

export function formatPwm(value: number): string {
  return `${formatNumber(value)} PWM`;
}

export function formatRssi(value: number | null): string {
  if (value === null) {
    return 'RSSI tidak tersedia';
  }

  return `${formatNumber(value)} dBm`;
}

export function formatMs(value: number | null): string {
  if (value === null) {
    return 'RTT tidak tersedia';
  }

  return `${formatNumber(value)} ms`;
}

export function formatDataAge(seconds: number): string {
  if (seconds <= 1) {
    return 'baru saja';
  }

  return `${formatNumber(Math.round(seconds))} detik lalu`;
}

export function formatWibTime(iso: string): string {
  return wibTimeFormatter.format(new Date(iso));
}

export function formatWibShort(iso: string): string {
  return wibShortFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

const eventTypeLabels: Record<string, string> = {
  START: 'Mulai',
  STOP: 'Berhenti',
  SET_MODE: 'Ganti mode',
  AVOID_DONE: 'Penghindaran selesai',
  PINDAI: 'Pindai',
  BELOK: 'Belok',
  BOOT: 'Menyala',
  DEVICE_ONLINE: 'Perangkat online',
  DEVICE_OFFLINE: 'Perangkat offline',
  MANUAL_BLOCKED: 'Manual diblokir',
  MANUAL_TIMEOUT: 'Manual timeout',
  SENSOR: 'Sensor',
  PENGHINDARAN: 'Penghindaran',
  JARAK_BERHENTI: 'Jarak berhenti',
  DAYA: 'Daya',
  KONEKSI_PUTUS: 'Koneksi putus',
};

const detailLabels: Record<string, string> = {
  dist_cm: 'Jarak',
  reason: 'Alasan',
  cmd: 'Perintah',
  mode: 'Mode',
  pwm: 'PWM',
  avoid_count: 'Jumlah',
  direction: 'Arah',
};

export function formatEventType(type: string): string {
  return eventTypeLabels[type] ?? type;
}

export function formatEventDetail(detail: Record<string, unknown>): string {
  const entries = Object.entries(detail);

  if (entries.length === 0) {
    return '-';
  }

  return entries
    .map(([key, value]) => {
      const label = detailLabels[key] ?? key;
      const formattedValue =
        value === null || value === undefined
          ? '-'
          : typeof value === 'number'
            ? formatDecimal(value)
            : String(value);
      return `${label}: ${formattedValue}`;
    })
    .join(', ');
}
