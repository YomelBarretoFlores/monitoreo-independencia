import { describe, expect, it } from 'vitest';
import { axisTicks, linePath, niceMax, scale, ticks } from '../../src/lib/chart.ts';

describe('niceMax', () => {
  it('rounds up to a readable axis maximum', () => {
    expect(niceMax(7.3)).toBe(10);
    expect(niceMax(13)).toBe(15);
    expect(niceMax(21)).toBe(25);
    expect(niceMax(0.42)).toBe(0.5);
    expect(niceMax(180)).toBe(200);
  });
  it('never returns zero, so bars always have a scale', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-3)).toBe(1);
  });
});

describe('ticks', () => {
  it('splits the axis in equal steps including both ends', () => {
    expect(ticks(20, 4)).toEqual([0, 5, 10, 15, 20]);
  });
});

describe('scale', () => {
  it('maps a domain linearly onto a range', () => {
    const y = scale([0, 10], [100, 0]);
    expect(y(0)).toBe(100);
    expect(y(5)).toBe(50);
    expect(y(10)).toBe(0);
  });
  it('maps a flat domain to the range start instead of NaN', () => {
    expect(scale([3, 3], [0, 50])(3)).toBe(0);
  });
});

describe('linePath', () => {
  it('builds an SVG path with rounded coordinates', () => {
    expect(linePath([[0, 10], [5.555, 2.004]])).toBe('M0 10L5.56 2');
    expect(linePath([])).toBe('');
  });
});

describe('axisTicks', () => {
  it('picks a step count that gives round labels', () => {
    expect(axisTicks(50)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(axisTicks(20)).toEqual([0, 5, 10, 15, 20]);
    expect(axisTicks(15)).toEqual([0, 5, 10, 15]);
    expect(axisTicks(25)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(axisTicks(1.5)).toEqual([0, 0.5, 1, 1.5]);
  });
});
