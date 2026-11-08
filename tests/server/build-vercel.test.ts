// Build Output API settings for Vercel: the cron must hit a function the handler serves.
import { describe, expect, it } from 'vitest';
import { CRON, FUNCTIONS, outputConfig, vcConfig } from '../../scripts/build-vercel.ts';

describe('Vercel build output', () => {
  it('has one function per API path, including the cron endpoint', () => {
    expect(FUNCTIONS).toEqual(['api/panel', 'api/health', 'api/cron/collect']);
    expect(FUNCTIONS.map((f) => `/${f}`)).toContain(CRON.path);
  });

  it('schedules the cron once a day (the Hobby limit) and serves static files first', () => {
    expect(CRON.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
    expect(outputConfig).toMatchObject({ version: 3, crons: [CRON] });
    expect(outputConfig.routes).toContainEqual({ handle: 'filesystem' });
    expect(outputConfig.routes[0]).toMatchObject({
      src: '^/(.*)$',
      headers: { 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN' },
      continue: true,
    });
  });

  it('serves the map worker (.mjs) as JavaScript before the filesystem, since nosniff is on', () => {
    const i = outputConfig.routes.findIndex((r) => 'src' in r && r.src === '^/assets/.*\\.mjs$');
    expect(i).toBeGreaterThan(-1);
    expect(outputConfig.routes[i]).toMatchObject({
      headers: { 'content-type': 'text/javascript; charset=utf-8' },
      continue: true,
    });
    expect(i).toBeLessThan(outputConfig.routes.findIndex((r) => 'handle' in r));
  });

  it('runs the bundled server/vercel.mjs on Node with up to 300 s per request', () => {
    expect(vcConfig).toMatchObject({
      handler: 'server/vercel.mjs',
      launcherType: 'Nodejs',
      maxDuration: 300,
    });
    expect(vcConfig.runtime).toMatch(/^nodejs\d+\.x$/);
  });
});
