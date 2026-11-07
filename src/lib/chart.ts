// Chart math for the hand-built SVG charts (no DOM).

/** Round a maximum up to 1, 1.5, 2, 2.5, 5 or 10 × 10^k so axes read cleanly. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  const step = [1, 1.5, 2, 2.5, 5, 10].find((s) => f <= s + 1e-9) ?? 10;
  return Number((step * p).toPrecision(12));
}

export function ticks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => Number(((max * i) / count).toPrecision(12)));
}

export function scale([d0, d1]: [number, number], [r0, r1]: [number, number]): (v: number) => number {
  const span = d1 - d0;
  return (v) => (span === 0 ? r0 : r0 + ((v - d0) / span) * (r1 - r0));
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function linePath(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${r2(x)} ${r2(y)}`).join('');
}

/** Ticks from 0 to `max` whose step is 1, 2, 2.5 or 5 × 10^k (tries 4, 5, 3 then 2 steps). */
export function axisTicks(max: number): number[] {
  for (const count of [4, 5, 3, 2]) {
    const step = max / count;
    const f = step / 10 ** Math.floor(Math.log10(step));
    if ([1, 2, 2.5, 5, 10].some((n) => Math.abs(f - n) < 1e-9)) return ticks(max, count);
  }
  return ticks(max, 4);
}
