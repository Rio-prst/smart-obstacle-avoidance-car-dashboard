import type { SessionType, TrialResult } from '@/types/api';

export const sessionTypeLabels: Record<SessionType, string> = {
  SENSOR: 'Sensor',
  PENGHINDARAN: 'Penghindaran',
  JARAK_BERHENTI: 'Jarak berhenti',
  DAYA: 'Daya',
  KONEKSI_PUTUS: 'Koneksi putus',
  STOP: 'Latensi STOP',
};

export const sessionTypeHints: Record<SessionType, string> = {
  SENSOR: 'Bandingkan jarak referensi dengan pembacaan sensor.',
  PENGHINDARAN: 'Catat hasil tiap percobaan menghindari rintangan.',
  JARAK_BERHENTI: 'Ukur jarak berhenti untuk beberapa nilai PWM.',
  DAYA: 'Catat hasil percobaan pada kondisi baterai tertentu.',
  KONEKSI_PUTUS: 'Catat perilaku mobil saat koneksi terputus.',
  STOP: 'Ukur latensi dari tombol STOP sampai motor berhenti.',
};

export const trialResultLabels: Record<TrialResult, string> = {
  SUCCESS: 'Berhasil',
  COLLISION: 'Tabrakan',
  FAIL: 'Gagal',
};

export const trialResultClassNames: Record<TrialResult, string> = {
  SUCCESS: 'bg-success-subtle text-success-text',
  COLLISION: 'bg-danger-subtle text-danger-text',
  FAIL: 'bg-warning-subtle text-warning-text',
};
