export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  approxRateToUSD: number;
  flag?: string;
  country?: string;
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', approxRateToUSD: 1, flag: '🇺🇸', country: 'United States' },
  { code: 'EUR', name: 'Euro', symbol: '€', approxRateToUSD: 0.92, flag: '🇪🇺', country: 'European Union' },
  { code: 'GBP', name: 'British Pound', symbol: '£', approxRateToUSD: 0.79, flag: '🇬🇧', country: 'United Kingdom' },
  { code: 'SDG', name: 'Sudanese Pound', symbol: 'SDG', approxRateToUSD: 3475, flag: '🇸🇩', country: 'Sudan' },
  { code: 'SSP', name: 'South Sudanese Pound', symbol: 'SSP', approxRateToUSD: 1300, flag: '🇸🇸', country: 'South Sudan' },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', approxRateToUSD: 3750, flag: '🇺🇬', country: 'Uganda' },
  { code: 'RWF', name: 'Rwandan Franc', symbol: 'RF', approxRateToUSD: 1320, flag: '🇷🇼', country: 'Rwanda' },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'ر.ق', approxRateToUSD: 3.64, flag: '🇶🇦', country: 'Qatar' },
  { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br', approxRateToUSD: 57, flag: '🇪🇹', country: 'Ethiopia' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', approxRateToUSD: 130, flag: '🇰🇪', country: 'Kenya' },
  { code: 'EGP', name: 'Egyptian Pound', symbol: '£', approxRateToUSD: 30.9, flag: '🇪🇬', country: 'Egypt' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', approxRateToUSD: 3.75, flag: '🇸🇦', country: 'Saudi Arabia' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', approxRateToUSD: 3.67, flag: '🇦🇪', country: 'UAE' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr', approxRateToUSD: 0.9, flag: '🇨🇭', country: 'Switzerland' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', approxRateToUSD: 1.36, flag: '🇨🇦', country: 'Canada' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', approxRateToUSD: 10.7, flag: '🇳🇴', country: 'Norway' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', approxRateToUSD: 10.5, flag: '🇸🇪', country: 'Sweden' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', approxRateToUSD: 6.9, flag: '🇩🇰', country: 'Denmark' },
];

export function getCurrencyByCode(code: string): CurrencyInfo | undefined {
  return SUPPORTED_CURRENCIES.find(c => c.code === code);
}

export function convertAmount(
  amount: number,
  fromCode: string,
  toCode: string,
  customRates?: Record<string, number>
): number {
  if (fromCode === toCode) return amount;

  const fromRate = customRates?.[fromCode] ?? SUPPORTED_CURRENCIES.find(c => c.code === fromCode)?.approxRateToUSD ?? 1;
  const toRate = customRates?.[toCode] ?? SUPPORTED_CURRENCIES.find(c => c.code === toCode)?.approxRateToUSD ?? 1;

  const usdAmount = fromRate > 1 ? amount / fromRate : amount / fromRate;
  return toRate > 1 ? usdAmount * toRate : usdAmount * toRate;
}

export function formatCurrencyAmount(amount: number, currencyCode: string, opts?: { compact?: boolean }): string {
  const currency = getCurrencyByCode(currencyCode);
  const symbol = currency?.symbol ?? currencyCode;

  if (opts?.compact && Math.abs(amount) >= 1_000_000) {
    return `${symbol} ${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (opts?.compact && Math.abs(amount) >= 1_000) {
    return `${symbol} ${(amount / 1_000).toFixed(1)}K`;
  }

  return `${symbol} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCurrencyAmountWithCode(amount: number, currencyCode: string): string {
  return `${currencyCode} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const CURRENCY_STORAGE_KEY_PREFIX = 'pact_currency_pref_';

export interface CurrencyPreference {
  incomeCurrency: string;
  expenseCurrency: string;
}

export const DEFAULT_CURRENCY_PREFERENCE: CurrencyPreference = {
  incomeCurrency: 'SDG',
  expenseCurrency: 'SDG',
};

export function loadCurrencyPreference(userId: string): CurrencyPreference {
  try {
    const raw = localStorage.getItem(`${CURRENCY_STORAGE_KEY_PREFIX}${userId}`);
    if (!raw) return { ...DEFAULT_CURRENCY_PREFERENCE };
    return { ...DEFAULT_CURRENCY_PREFERENCE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CURRENCY_PREFERENCE };
  }
}

export function saveCurrencyPreference(userId: string, pref: CurrencyPreference): void {
  try {
    localStorage.setItem(`${CURRENCY_STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(pref));
  } catch {
    // storage unavailable
  }
}
