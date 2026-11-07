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
