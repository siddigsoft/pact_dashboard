import { describe, expect, it, vi } from 'vitest';
import { scannerRequest } from './scannerRequest';

const reply = (status: number, data: unknown, headers?: HeadersInit) =>
  new Response(JSON.stringify(data), { status, headers });

describe('scannerRequest', () => {
  it('recovers from temporary overload without losing the result', async () => {
    const request = vi.fn().mockResolvedValueOnce(reply(503, {}))
      .mockResolvedValueOnce(reply(200, { text: '[]' }));
    const wait = vi.fn().mockResolvedValue(undefined);
    expect(await scannerRequest(request, undefined, wait)).toEqual({ text: '[]' });
    expect(wait).toHaveBeenCalledWith(3000);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('bounds overload retries and does not call it daily exhaustion', async () => {
    const request = vi.fn().mockImplementation(async () => reply(503, {}));
    await expect(scannerRequest(request, undefined, async () => {})).rejects.toThrow('temporarily busy');
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('does not retry a daily quota failure', async () => {
    const request = vi.fn().mockResolvedValue(reply(429, { isDailyExhausted: true }));
    await expect(scannerRequest(request)).rejects.toThrow('daily quota');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('honors bounded retry-after and reports the wait', async () => {
    const request = vi.fn().mockResolvedValueOnce(reply(429, {}, { 'Retry-After': '120' }))
      .mockResolvedValueOnce(reply(200, {}));
    const wait = vi.fn().mockResolvedValue(undefined);
    const status = vi.fn();
    await scannerRequest(request, status, wait);
    expect(wait).toHaveBeenCalledWith(60_000);
    expect(status).toHaveBeenCalledWith(expect.stringContaining('60s'));
  });
  it('does not expose raw provider diagnostics on permanent failures', async () => {
    await expect(scannerRequest(async () => reply(400, { error: 'internal provider JSON' })))
      .rejects.toThrow('HTTP 400');
  });
  it('aborts stalled requests', async () => {
    vi.useFakeTimers();
    try {
      const result = scannerRequest(signal => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }));
      const assertion = expect(result).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(60_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
