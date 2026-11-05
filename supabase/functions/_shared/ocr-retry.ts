/** Temporary service failures are not evidence of a daily quota exhaustion. */
export class OcrTemporaryError extends Error {
  constructor(
    message: string,
    public status: number = 503,
    public retryAfterSec: number = 5,
  ) {
    super(message);
  }
}

export function providerRetrySeconds(headers: Headers, message: string, fallback = 15) {
  const header = Number(headers.get('retry-after'));
  const match = message.match(/(?:retry|try again) in (\d+(?:\.\d+)?)s/i);
  return Math.max(1, Number.isFinite(header) && header > 0
    ? Math.ceil(header) : match ? Math.ceil(Number(match[1])) : fallback);
}

export async function ocrProviderFetch(url: string, options: RequestInit) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new OcrTemporaryError('The AI provider timed out or could not be reached. Please retry.', 503, 5);
  }
}
