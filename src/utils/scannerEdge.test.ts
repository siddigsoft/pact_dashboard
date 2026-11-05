import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { OcrTemporaryError, ocrProviderFetch, providerRetrySeconds } from '../../supabase/functions/_shared/ocr-retry';

// Exercise the real Edge handler without a live provider, credentials or Deno
// listener. Only its two platform imports are replaced by the supplied bindings.
const source = readFileSync('supabase/functions/extract-transaction/index.ts', 'utf8')
  .replace(/^import .*$/gm, '');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function handler() {
  let captured: (request: Request) => Promise<Response>;
  new Function('serve', 'OcrTemporaryError', 'ocrProviderFetch', 'providerRetrySeconds', 'Deno', compiled)(
    (fn: typeof captured) => { captured = fn; },
    OcrTemporaryError, ocrProviderFetch, providerRetrySeconds,
    { env: { get: (name: string) => ['GOOGLE_AI_API_KEY', 'GROQ_API_KEY'].includes(name) ? 'test-only' : undefined } },
  );
  return captured!;
}

const request = () => new Request('https://scanner.invalid', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ images: [{ base64: 'test-image', mimeType: 'image/jpeg' }] }),
});

afterEach(() => vi.unstubAllGlobals());

describe('real scanner Edge error mapping', () => {
  it('returns temporary overload without claiming daily exhaustion', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('Busy', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    const response = await handler()(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ isDailyExhausted: false, retryAfterSec: 5 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('returns minute-limit cooldown immediately instead of sleeping inside the server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('retry in 12.3s', { status: 429 })));
    const response = await handler()(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ retryAfterSec: 13, isDailyExhausted: false });
  });
  it('preserves Groq temporary errors through both fallback catch blocks', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response('Unavailable', { status: url.includes('generativelanguage') ? 404 : 503 })));
    const response = await handler()(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ isDailyExhausted: false });
  });
  it('keeps successful receipt extraction working', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify([
        { transaction_id: '0123', amount: '1,200', from_account: '00 01', to_account: '00 02' },
      ]) }] } }],
    })));
    const response = await handler()(request());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(JSON.parse(payload.text)[0]).toMatchObject({
      transaction_id: '0123', amount: 1200, from_account: '0001', to_account: '0002',
    });
  });
});
