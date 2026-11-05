import { describe, expect, it } from 'vitest';
import { formatCm, formatDataAge, formatEventType, formatNumber } from './format';

describe('format', () => {
  it('formats numbers with Indonesian separators', () => {
    expect(formatNumber(1042)).toBe('1.042');
  });

  it('formats distance and handles invalid readings', () => {
    expect(formatCm(38.5, true)).toBe('38,5 cm');
    expect(formatCm(38.5, false)).toBe('Tidak valid');
    expect(formatCm(null, true)).toBe('Tidak valid');
  });

  it('formats data age', () => {
    expect(formatDataAge(0)).toBe('baru saja');
    expect(formatDataAge(3)).toBe('3 detik lalu');
  });

  it('formats event types in Indonesian', () => {
    expect(formatEventType('AVOID_DONE')).toBe('Penghindaran selesai');
    expect(formatEventType('UNKNOWN_EVENT')).toBe('UNKNOWN_EVENT');
  });
});
