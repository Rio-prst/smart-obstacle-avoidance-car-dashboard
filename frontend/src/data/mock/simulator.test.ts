import { describe, expect, it } from 'vitest';
import {
  advanceSimulation,
  applyStart,
  applyStop,
  createInitialSimulation,
} from './simulator';

const now = new Date('2026-11-04T08:00:00.000Z');
const fixedRandom = () => 0.5;

describe('mock simulator', () => {
  it('advances telemetry and completes an avoidance cycle', () => {
    let state = createInitialSimulation(now, fixedRandom);
    const initialAvoidCount = state.device.avoidCount;

    for (let index = 1; index <= 25; index += 1) {
      state = advanceSimulation(
        state,
        new Date(now.getTime() + index * 2000),
        fixedRandom,
      );
    }

    const latest = state.telemetry[state.telemetry.length - 1];

    expect(latest.ts).toBe(new Date(now.getTime() + 25 * 2000).toISOString());
    expect(state.device.avoidCount).toBe(initialAvoidCount + 1);
  });

  it('pauses on STOP and resumes on START', () => {
    let state = createInitialSimulation(now, fixedRandom);

    state = applyStop(state, now);
    state = advanceSimulation(state, new Date(now.getTime() + 2000), fixedRandom);

    expect(state.device.state).toBe('STOP');
    expect(state.telemetry[state.telemetry.length - 1].pwm).toBe(0);

    state = applyStart(state, new Date(now.getTime() + 4000));

    expect(state.device.state).toBe('MAJU');
    expect(state.autoPaused).toBe(false);
  });
});
