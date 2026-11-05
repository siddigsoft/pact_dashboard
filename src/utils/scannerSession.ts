export interface ScannerReceipt {
  id?: string;
  fileName?: string;
  status?: string;
  error?: string;
  amount?: number | string;
  [key: string]: unknown;
}

/** JSON round-trip preserves all receipt metadata, including duplicate rows. */
export function serializeScannerRows(rows: ScannerReceipt[]): ScannerReceipt[] {
  return JSON.parse(JSON.stringify(rows));
}

export function restoreScannerRows(rows: ScannerReceipt[]) {
  return rows.map(row => {
    const interrupted = row.status === 'pending' || row.status === 'processing';
    return {
      ...row,
      id: row.id || crypto.randomUUID(),
      fileName: row.fileName || '',
      status: interrupted ? 'error' : row.status === 'error' ? 'error' : 'done',
      ...(interrupted ? { error: 'Not completed in saved snapshot. Re-upload the original image to scan it.' } : {}),
    };
  });
}

export function scannerSavedTotal(rows: ScannerReceipt[]) {
  return rows.reduce((sum, row) => {
    if (row.status && row.status !== 'done') return sum;
    const value = Number(String(row.amount ?? 0).replace(/,/g, ''));
    return sum + (Number.isFinite(value) ? Math.round(value * 100) : 0);
  }, 0) / 100;
}

/** Serializes uploads and individual retries; spacing is between starts, not ends. */
export function createScannerQueue(
  spacingMs = 8000,
  now = () => Date.now(),
  wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
) {
  let tail: Promise<unknown> = Promise.resolve();
  let nextStart = 0;
  return <T>(task: () => Promise<T>): Promise<T> => {
    const job = tail.then(async () => {
      const delay = Math.max(0, nextStart - now());
      if (delay) await wait(delay);
      nextStart = now() + spacingMs;
      return task();
    });
    tail = job.catch(() => {});
    return job;
  };
}
