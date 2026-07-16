import { describe, expect, it } from 'vitest';
import {
  createLane,
  resetLane,
  stepLane,
} from '../../src/visualization/particles/particle-engine.ts';

describe('stepLane conservation', () => {
  it('conserves total transferred amount across accumulator and emitted quanta', () => {
    const lane = createLane();
    const rate = 0.5;
    const dtSim = 1 / 60;
    const totalSteps = 600;
    for (let i = 0; i < totalSteps; i++) {
      stepLane(lane, {
        rate,
        dtSim,
        dtWall: dtSim,
        quantum: 0.12,
        travelSeconds: 1,
        maxParticles: 1000,
      });
    }
    const totalSimTime = totalSteps * dtSim;
    expect(lane.emittedQuanta + lane.accumulator).toBeCloseTo(rate * totalSimTime, 10);
  });

  it('emits nothing and accumulates nothing at zero rate', () => {
    const lane = createLane();
    const emitted = stepLane(lane, {
      rate: 0,
      dtSim: 1 / 60,
      dtWall: 1 / 60,
      quantum: 0.1,
      travelSeconds: 1,
      maxParticles: 100,
    });
    expect(emitted).toBe(0);
    expect(lane.accumulator).toBe(0);
    expect(lane.emittedQuanta).toBe(0);
    expect(lane.particles).toEqual([]);
  });

  it('emits floor(integrated amount / quantum) particles for a clean case', () => {
    const lane = createLane();
    const emitted = stepLane(lane, {
      rate: 1,
      dtSim: 1,
      dtWall: 0,
      quantum: 0.25,
      travelSeconds: 1,
      maxParticles: 100,
    });
    expect(emitted).toBe(4);
    expect(lane.emittedQuanta).toBeCloseTo(1, 12);
    expect(lane.accumulator).toBeCloseTo(0, 12);
  });

  it('caps live particles at maxParticles while still tracking the full integral', () => {
    const lane = createLane();
    const maxParticles = 5;
    stepLane(lane, {
      rate: 1000,
      dtSim: 1,
      dtWall: 0,
      quantum: 0.1,
      travelSeconds: 1,
      maxParticles,
    });
    expect(lane.particles.length).toBe(maxParticles);
    // emittedQuanta plus whatever remains below one quantum in the
    // accumulator must reconstruct the full integrated amount.
    expect(lane.emittedQuanta + lane.accumulator).toBeCloseTo(1000, 6);
    expect(lane.accumulator).toBeLessThan(0.1);
  });
});

describe('resetLane', () => {
  it('clears particles and the accumulator, but leaves emittedQuanta and nextId untouched', () => {
    const lane = createLane();
    stepLane(lane, {
      rate: 1,
      dtSim: 1,
      dtWall: 0,
      quantum: 0.3,
      travelSeconds: 1,
      maxParticles: 100,
    });
    expect(lane.particles.length).toBeGreaterThan(0);
    expect(lane.accumulator).toBeGreaterThan(0);
    const emittedBefore = lane.emittedQuanta;
    const nextIdBefore = lane.nextId;

    resetLane(lane);

    expect(lane.accumulator).toBe(0);
    expect(lane.particles).toEqual([]);
    expect(lane.emittedQuanta).toBe(emittedBefore);
    expect(lane.nextId).toBe(nextIdBefore);
  });
});

describe('particle travel', () => {
  it('advances progress by dtWall / travelSeconds and removes arrivals', () => {
    const lane = createLane();
    const travelSeconds = 2;

    // First step: emit exactly one particle, starting at progress 0.
    stepLane(lane, {
      rate: 1,
      dtSim: 1,
      dtWall: 0,
      quantum: 1,
      travelSeconds,
      maxParticles: 10,
    });
    expect(lane.particles.length).toBe(1);
    expect(lane.particles[0].progress).toBeCloseTo(0, 12);

    // Second step: no new emissions, advance halfway across the channel.
    stepLane(lane, {
      rate: 0,
      dtSim: 0,
      dtWall: 1,
      quantum: 1,
      travelSeconds,
      maxParticles: 10,
    });
    expect(lane.particles.length).toBe(1);
    expect(lane.particles[0].progress).toBeCloseTo(0.5, 12);

    // Third step: push progress past 1; the particle should be removed.
    stepLane(lane, {
      rate: 0,
      dtSim: 0,
      dtWall: 1.2,
      quantum: 1,
      travelSeconds,
      maxParticles: 10,
    });
    expect(lane.particles.length).toBe(0);
  });
});
