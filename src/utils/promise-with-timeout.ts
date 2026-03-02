/**
 * Wraps a promise in a timeout. Rejects with a descriptive error if the promise
 * does not resolve/reject within the given milliseconds.
 * Useful to prevent hanging when Supabase or other async operations freeze.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string = 'Operation timed out. Please try again or refresh the page.'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
  });
}
