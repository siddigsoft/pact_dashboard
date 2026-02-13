import { supabase } from '@/integrations/supabase/client';

interface ExchangeRate {
  id: string;
  source_bank: string;
  rate_type: string;
  usd_to_sdg: number;
  fetched_at: string;
  is_active: boolean;
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
      .from('exchange_rates')
      .select('usd_to_sdg, fetched_at')
      .eq('is_active', true)
      .order('fetched_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;

    const record = data[0];
    const hoursSinceFetch = (Date.now() - new Date(record.fetched_at).getTime()) / (1000 * 60 * 60);

    cachedRate = {
      rate: record.usd_to_sdg,
      fetchedAt: record.fetched_at,
      timestamp: Date.now(),
    };

    return { rate: record.usd_to_sdg, fetchedAt: record.fetched_at, stale: hoursSinceFetch > 24 };
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
