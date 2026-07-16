import { beforeEach, describe, expect, it } from 'vitest';
import { useSimulationStore } from '../../src/state/simulation-store.ts';

beforeEach(() => {
  useSimulationStore.getState().selectPreset('steady-feed');
});

describe('setParam', () => {
  it('recomputes the trajectory with new identity and new values', () => {
    const before = useSimulationStore.getState().trajectory;
    useSimulationStore.getState().setParam('kf', 1.5);
    const after = useSimulationStore.getState();

    expect(after.trajectory).not.toBe(before);
    expect(after.params.kf).toBe(1.5);
    // Changing the forward rate constant must actually change the dynamics.
    expect(Array.from(after.trajectory.quantities[1])).not.toEqual(
      Array.from(before.quantities[1]),
    );
  });

  it('clamps parameter values to the declared range', () => {
    useSimulationStore.getState().setParam('kf', 100);
    expect(useSimulationStore.getState().params.kf).toBe(2);

    useSimulationStore.getState().setParam('kf', -5);
    expect(useSimulationStore.getState().params.kf).toBe(0);
  });
});

describe('scrubbing immutability', () => {
  it('keeps the same trajectory reference while moving time back and forth', () => {
    const trajectory = useSimulationStore.getState().trajectory;

    useSimulationStore.getState().setTime(10);
    expect(useSimulationStore.getState().trajectory).toBe(trajectory);
    expect(useSimulationStore.getState().time).toBe(10);

    useSimulationStore.getState().setTime(3);
    expect(useSimulationStore.getState().trajectory).toBe(trajectory);
    expect(useSimulationStore.getState().time).toBe(3);
  });

  it('clamps time to [0, duration]', () => {
    const duration = useSimulationStore.getState().trajectory.duration;

    useSimulationStore.getState().setTime(-5);
    expect(useSimulationStore.getState().time).toBe(0);

    useSimulationStore.getState().setTime(duration + 1000);
    expect(useSimulationStore.getState().time).toBe(duration);
  });
});

describe('playback speed independence', () => {
  it('does not recompute the trajectory when the speed changes', () => {
    const trajectory = useSimulationStore.getState().trajectory;
    useSimulationStore.getState().setSpeed(4);
    expect(useSimulationStore.getState().trajectory).toBe(trajectory);
  });

  it('scales how far advance() moves time by the current speed', () => {
    useSimulationStore.getState().play();
    useSimulationStore.getState().setSpeed(2);
    useSimulationStore.getState().advance(0.1);
    expect(useSimulationStore.getState().time).toBeCloseTo(0.2, 12);
  });
});

describe('selectPreset', () => {
  it('applies parameter and initial-condition overrides for closed-equilibrium', () => {
    useSimulationStore.getState().selectPreset('closed-equilibrium');
    const state = useSimulationStore.getState();

    expect(state.params.kout).toBe(0);
    expect(state.trajectory.quantities[0][0]).toBe(5);
  });
});

describe('setProfileKind', () => {
  it('changes the profile kind and recomputes the trajectory', () => {
    const before = useSimulationStore.getState();
    expect(before.profile.kind).toBe('constant');
    const trajectory = before.trajectory;

    useSimulationStore.getState().setProfileKind('pulse');
    const after = useSimulationStore.getState();

    expect(after.profile.kind).toBe('pulse');
    expect(after.trajectory).not.toBe(trajectory);
  });
});
