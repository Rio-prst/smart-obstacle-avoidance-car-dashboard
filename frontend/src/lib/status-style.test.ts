import { describe, expect, it } from 'vitest';
import { connectionStatusStyle, modeStyle, stateStyle } from './status-style';

describe('status styles', () => {
  it('maps connection states', () => {
    expect(connectionStatusStyle(true, false).label).toBe('Online');
    expect(connectionStatusStyle(true, true).label).toBe('Data tidak mutakhir');
    expect(connectionStatusStyle(false, false).label).toBe('Offline');
  });

  it('maps device modes and states', () => {
    expect(modeStyle('AUTO').label).toBe('AUTO');
    expect(modeStyle('MANUAL').label).toBe('MANUAL');
    expect(stateStyle('STOP').label).toBe('STOP');
    expect(stateStyle('MAJU').label).toBe('MAJU');
  });
});
