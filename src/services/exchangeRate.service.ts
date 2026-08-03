import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

// acct_exchange_rates schema: id, from_currency, to_currency, rate, effective_date (date), source, created_at
interface AcRateRow {
  id?: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  effective_date: string;
  source?: string;
  created_at?: string;
}

export interface ExchangeRate {
  id?: string;
  source_bank: 'bank_of_sudan' | 'bank_of_khartoum' | 'faisal_islamic';
  rate_type: 'buy' | 'sell' | 'mid';
  usd_to_sdg: number;
  fetched_at: string;
  is_active: boolean;
}

export interface ExchangeRateSummary {
  bank_of_sudan?: { buy?: number; sell?: number; mid?: number };
  bank_of_khartoum?: { buy?: number; sell?: number; mid?: number };
  faisal_islamic?: { buy?: number; sell?: number; mid?: number };
  weighted_average: number;
  last_updated: string;
  sources_available: number;
}

export interface FallbackOption {
  id: 'algorithm_rate' | 'locality_median' | 'manual';
  label: string;
  description: string;
  predicted_cost?: number;
  confidence?: number;
  exchange_rate_used?: number;
  source?: string;
}

const BANK_DISPLAY_NAMES: Record<string, string> = {
  'bank_of_sudan': 'Bank of Sudan',
  'bank_of_khartoum': 'Bank of Khartoum',
  'faisal_islamic': 'Faisal Islamic Bank'
};

export class ExchangeRateService {
  private static cachedRates: ExchangeRateSummary | null = null;
  private static cacheTimestamp: number = 0;
  private static CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  static async getLatestRates(): Promise<ExchangeRateSummary> {
    const now = Date.now();
    if (this.cachedRates && (now - this.cacheTimestamp) < this.CACHE_DURATION_MS) {
      return this.cachedRates;
    }

    try {
      const { data, error } = await supabase
        .from('acct_exchange_rates')
        .select('rate, effective_date, source, created_at')
        .eq('from_currency', 'USD')
        .eq('to_currency', 'SDG')
        .order('effective_date', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching exchange rates:', error);
        return this.getDefaultRates();
      }

      if (!data || data.length === 0) {
        return this.getDefaultRates();
      }

      const summary = this.buildSummary(data as AcRateRow[]);
      this.cachedRates = summary;
      this.cacheTimestamp = now;
      return summary;
    } catch (err) {
      console.error('Exception fetching exchange rates:', err);
      return this.getDefaultRates();
    }
  }

  private static buildSummary(rows: AcRateRow[]): ExchangeRateSummary {
    const summary: ExchangeRateSummary = {
      weighted_average: 0,
      last_updated: new Date().toISOString(),
      sources_available: 0
    };

    // Group by source bank — most-recent row per source wins
    const byBank: Record<string, number> = {};
    for (const row of rows) {
      const bank = (row.source ?? 'bank_of_khartoum') as string;
      if (!(bank in byBank)) {
        byBank[bank] = Number(row.rate);
        // Track most-recent effective_date
        const ts = row.effective_date + 'T12:00:00';
        if (!summary.last_updated || ts > summary.last_updated) {
          summary.last_updated = ts;
        }
      }
    }

    const banks = ['bank_of_sudan', 'bank_of_khartoum', 'faisal_islamic'] as const;
    const midRates: number[] = [];

    for (const bank of banks) {
      if (bank in byBank) {
        const rate = byBank[bank];
        (summary as any)[bank] = { mid: rate };
        midRates.push(rate);
        summary.sources_available++;
      }
    }

    // Include any other source-bank values not in the three above
    for (const [bank, rate] of Object.entries(byBank)) {
      if (!banks.includes(bank as any)) {
        midRates.push(rate);
      }
    }

    if (midRates.length > 0) {
      summary.weighted_average = midRates.reduce((a, b) => a + b, 0) / midRates.length;
    }

    return summary;
  }

  private static getDefaultRates(): ExchangeRateSummary {
    return {
      bank_of_sudan: { buy: 3420.00, sell: 3520.00, mid: 3470.00 },
      bank_of_khartoum: { buy: 3450.00, sell: 3550.00, mid: 3500.00 },
      faisal_islamic: { buy: 3400.00, sell: 3500.00, mid: 3450.00 },
      weighted_average: 3475.00,
      last_updated: new Date().toISOString(),
      sources_available: 3
    };
  }

  static async saveRate(rate: Omit<ExchangeRate, 'id'>): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('acct_exchange_rates')
        .upsert(
          {
            from_currency: 'USD',
            to_currency: 'SDG',
            rate: rate.usd_to_sdg,
            effective_date: format(new Date(rate.fetched_at), 'yyyy-MM-dd'),
            source: rate.source_bank,
          },
          { onConflict: 'from_currency,to_currency,effective_date' }
        );

      if (error) return { success: false, error: error.message };
      this.cachedRates = null;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async updateRatesFromSources(): Promise<{ success: boolean; updated: number; error?: string; isDefault?: boolean }> {
    // Upsert today's default rates into acct_exchange_rates (one row per source per day)
    const today = format(new Date(), 'yyyy-MM-dd');

    const defaults = [
      { source: 'bank_of_sudan', rate: 3470.00 },
      { source: 'bank_of_khartoum', rate: 3500.00 },
      { source: 'faisal_islamic', rate: 3450.00 },
    ];

    let updatedCount = 0;
    let hasErrors = false;

    for (const d of defaults) {
      const { error } = await supabase
        .from('acct_exchange_rates')
        .upsert(
          { from_currency: 'USD', to_currency: 'SDG', rate: d.rate, effective_date: today, source: d.source },
          { onConflict: 'from_currency,to_currency,effective_date' }
        );
      if (!error) updatedCount++;
      else hasErrors = true;
    }

    this.cachedRates = null;

    if (hasErrors && updatedCount === 0) {
      return { success: false, updated: 0, error: 'Failed to update any rates', isDefault: true };
    }

    return { success: true, updated: updatedCount, isDefault: true };
  }

  static async getFallbackOptions(
    siteId: string,
    stateName: string,
    localityName: string,
    hubId?: string
  ): Promise<FallbackOption[]> {
    const rates = await this.getLatestRates();
    const exchangeRate = rates.weighted_average;

    const options: FallbackOption[] = [];

    const { data: localityCosts } = await supabase
      .from('historical_site_costs')
      .select('actual_cost')
      .ilike('locality_id', `%${localityName}%`)
      .order('visit_date', { ascending: false })
      .limit(20);

    let localityMedian = 0;
    if (localityCosts && localityCosts.length > 0) {
      const costs = localityCosts.map(c => c.actual_cost).sort((a, b) => a - b);
      const mid = Math.floor(costs.length / 2);
      localityMedian = costs.length % 2 !== 0 ? costs[mid] : (costs[mid - 1] + costs[mid]) / 2;
    }

    const ugandaBaselineUSD = 0.85;
    const algorithmPrediction = Math.round(ugandaBaselineUSD * exchangeRate);

    options.push({
      id: 'algorithm_rate',
      label: 'Algorithm + Exchange Rate',
      description: `Calculated using Uganda baseline ($${ugandaBaselineUSD} USD) at current rate`,
      predicted_cost: algorithmPrediction,
      confidence: 60,
      exchange_rate_used: exchangeRate,
      source: 'Weighted average from Sudan banks'
    });

    if (localityMedian > 0) {
      options.push({
        id: 'locality_median',
        label: 'Locality Median',
        description: `Based on ${localityCosts?.length || 0} similar sites in ${localityName}`,
        predicted_cost: Math.round(localityMedian),
        confidence: 55,
        source: `${localityCosts?.length || 0} historical records`
      });
    } else {
      const { data: stateCosts } = await supabase
        .from('historical_site_costs')
        .select('actual_cost')
        .ilike('state_id', `%${stateName}%`)
        .order('visit_date', { ascending: false })
        .limit(50);

      if (stateCosts && stateCosts.length > 0) {
        const costs = stateCosts.map(c => c.actual_cost).sort((a, b) => a - b);
        const mid = Math.floor(costs.length / 2);
        const stateMedian = costs.length % 2 !== 0 ? costs[mid] : (costs[mid - 1] + costs[mid]) / 2;

        options.push({
          id: 'locality_median',
          label: 'State Median',
          description: `Based on ${stateCosts.length} sites in ${stateName}`,
          predicted_cost: Math.round(stateMedian),
          confidence: 45,
          source: `${stateCosts.length} historical records from state`
        });
      }
    }

    options.push({
      id: 'manual',
      label: 'Manual Entry',
      description: 'Enter amount manually with justification (required for audit)',
      confidence: undefined,
      source: 'User-provided'
    });

    return options;
  }

  static getBankDisplayName(bankId: string): string {
    return BANK_DISPLAY_NAMES[bankId] || bankId;
  }

  static formatRate(rate: number): string {
    return rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  static formatTimeSince(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }
}
