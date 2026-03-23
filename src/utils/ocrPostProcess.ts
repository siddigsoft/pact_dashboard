/**
 * Cleans up the raw text returned by the OCR model before sending to the client.
 *
 * - Strips spaces from account number fields
 * - Coerces `amount` to a clean float (removes commas, handles NaN)
 * - Returns the original text unchanged if it is not parseable JSON
 */
export function ocrPostProcess(text: string): string {
  try {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return text;

    arr.forEach((obj: Record<string, unknown>) => {
      if (typeof obj.from_account === 'string' || typeof obj.from_account === 'number') {
        obj.from_account = String(obj.from_account).replace(/\s+/g, '');
      }
      if (typeof obj.to_account === 'string' || typeof obj.to_account === 'number') {
        obj.to_account = String(obj.to_account).replace(/\s+/g, '');
      }
      if (obj.amount != null) {
        const n = parseFloat(String(obj.amount).replace(/,/g, ''));
        obj.amount = isNaN(n) ? 0 : n;
      }
    });

    return JSON.stringify(arr);
  } catch {
    // Not valid JSON — return as-is so the caller can surface the error
    return text;
  }
}
