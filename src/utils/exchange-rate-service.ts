import { supabase } from '@/integrations/supabase/client';

interface ExchangeRate {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  effective_date: string;
  source: string;
  created_at: string;
}

let cachedRate: { rate: number; fetchedAt: string; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function getLatestExchangeRate(): Promise<{ rate: number; fetchedAt: string; stale: boolean } | null> {
  if (cachedRate && Date.now() - cachedRate.timestamp < CACHE_TTL) {
    const hoursSinceFetch = (Date.now() - new Date(cachedRate.fetchedAt).getTime()) / (1000 * 60 * 60);
    return { rate: cachedRate.rate, fetchedAt: cachedRate.fetchedAt, stale: hoursSinceFetch > 24 };
  }

  try {
    const { data, error } = await supabase
      .from('acct_exchange_rates')
      .select('rate, effective_date, created_at')
      .eq('from_currency', 'USD')
      .eq('to_currency', 'SDG')
      .order('effective_date', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;

    const record = data[0] as ExchangeRate;
    // Use effective_date as a local noon timestamp to avoid timezone drift
    const fetchedAt = record.effective_date + 'T12:00:00';
    const hoursSinceFetch = (Date.now() - new Date(fetchedAt).getTime()) / (1000 * 60 * 60);

    cachedRate = {
      rate: Number(record.rate),
      fetchedAt,
      timestamp: Date.now(),
    };

    return { rate: Number(record.rate), fetchedAt, stale: hoursSinceFetch > 24 };
  } catch {
    return null;
  }
}

export function convertSdgToUsd(amountSdg: number, rate: number): number {
  if (!rate || rate <= 0) return 0;
  return amountSdg / rate;
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function clearExchangeRateCache(): void {
  cachedRate = null;
}
