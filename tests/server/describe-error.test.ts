// Plain-Spanish error messages for a failed source, shown in the Fuentes table.
import { describe, expect, it } from 'vitest';
import { describeError } from '../../server/fetch.ts';

const fetchFailed = (code?: string) =>
  Object.assign(new TypeError('fetch failed'), code ? { cause: { code } } : {});

describe('describeError', () => {
  it('names the network error code when fetch fails without a known cause', () => {
    expect(describeError(fetchFailed('UND_ERR_CONNECT_TIMEOUT'))).toBe(
      'No se pudo leer la fuente: fetch failed (UND_ERR_CONNECT_TIMEOUT)',
    );
  });

  it('keeps the friendly messages for DNS and refused connections', () => {
    expect(describeError(fetchFailed('ENOTFOUND'))).toBe(
      'No se encontró el servidor de la fuente (sin conexión o DNS).',
    );
    expect(describeError(fetchFailed('ECONNRESET'))).toBe(
      'El servidor de la fuente rechazó o cortó la conexión.',
    );
  });

  it('keeps the old message when there is no code', () => {
    expect(describeError(fetchFailed())).toBe('No se pudo leer la fuente: fetch failed');
  });
});
