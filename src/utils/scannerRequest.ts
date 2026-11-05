/** Bound provider outages without confusing temporary overload with daily quota. */
export async function scannerRequest(
  request: (signal: AbortSignal) => Promise<Response>,
  onStatus?: (message: string) => void,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    let response: Response;
    let data: any;
    try {
      response = await request(controller.signal);
      // Include body reading in the timeout; a response can stall after headers.
      data = await response.json().catch(() => ({ error: `Scanner returned HTTP ${response.status}.` }));
    } catch (error) {
      const message = controller.signal.aborted
        ? 'Scanning timed out. Please retry this image.'
        : 'Could not reach the scanner. Check your connection and retry.';
      throw new Error(message);
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 503 && data.needsGroqKey) throw new Error('__NEEDS_GROQ_KEY__');
    if (response.status === 429 && data.isDailyExhausted) {
      throw new Error('All AI models at daily quota. Quotas reset at midnight Pacific time.');
    }
    if ([429, 502, 503, 504].includes(response.status)) {
      if (attempt === 2) {
        throw new Error('AI service is temporarily busy. This image was not read; retry it later.');
      }
      const requested = Number(response.headers.get('Retry-After') ?? data.retryAfterSec);
      const seconds = Number.isFinite(requested) && requested > 0
        ? Math.min(Math.max(requested, 1), 60)
        : response.status === 429 ? 30 : 3 * (attempt + 1);
      onStatus?.(`AI service busy — retry ${attempt + 1}/2 in ${seconds}s…`);
      await wait(seconds * 1000);
      continue;
    }
    if (!response.ok) {
      // Do not put raw provider JSON, HTML, or internal diagnostics into tooltips.
      throw new Error(`Scanner could not read this image (HTTP ${response.status}). Please retry.`);
    }
    return data;
  }
  throw new Error('Scanning failed. Please retry this image.');
}
