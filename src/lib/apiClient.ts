import { getAppVersion } from '@/utils/versionChecker';

export class APIError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data?: any
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'APIError';
  }
}

export async function apiRequest(
  url: string,
  options: RequestInit = {}
): Promise<any> {
  const currentVersion = getAppVersion();
  
  const headers = {
    'Content-Type': 'application/json',
    'X-App-Version': currentVersion,
    'X-Platform': 'web',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 426) {
    const data = await response.json().catch(() => ({}));
    throw new APIError(
      response.status,
      'Upgrade Required',
      data
    );
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new APIError(
      response.status,
      response.statusText,
      errorData
    );
  }

  if (response.headers.get('Content-Type')?.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

export async function apiRequestWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3
): Promise<any> {
  let lastError: APIError | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiRequest(url, options);
    } catch (error) {
      if (error instanceof APIError) {
        if (error.status === 426) {
          throw error;
        }
        lastError = error;
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      } else {
        throw error;
      }
    }
  }
  
  throw lastError;
}
