import { supabase } from '@/integrations/supabase/client';

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
        .from('exchange_rates')
        .select('*')
        .eq('is_active', true)
        .order('fetched_at', { ascending: false });

      if (error) {
        console.error('Error fetching exchange rates:', error);
        return this.getDefaultRates();
      }

      if (!data || data.length === 0) {
        return this.getDefaultRates();
      }

      const summary = this.buildSummary(data as ExchangeRate[]);
      this.cachedRates = summary;
      this.cacheTimestamp = now;
      return summary;
    } catch (err) {
      console.error('Exception fetching exchange rates:', err);
      return this.getDefaultRates();
    }
  }

  private static buildSummary(rates: ExchangeRate[]): ExchangeRateSummary {
    const summary: ExchangeRateSummary = {
      weighted_average: 0,
      last_updated: new Date().toISOString(),
      sources_available: 0
    };

    const bankRates: Record<string, Record<string, number>> = {};
    
    for (const rate of rates) {
      if (!bankRates[rate.source_bank]) {
        bankRates[rate.source_bank] = {};
      }
      bankRates[rate.source_bank][rate.rate_type] = rate.usd_to_sdg;
      
      if (new Date(rate.fetched_at) > new Date(summary.last_updated)) {
        summary.last_updated = rate.fetched_at;
      }
    }

    if (bankRates['bank_of_sudan']) {
      summary.bank_of_sudan = bankRates['bank_of_sudan'] as any;
      summary.sources_available++;
    }
    if (bankRates['bank_of_khartoum']) {
      summary.bank_of_khartoum = bankRates['bank_of_khartoum'] as any;
      summary.sources_available++;
    }
    if (bankRates['faisal_islamic']) {
      summary.faisal_islamic = bankRates['faisal_islamic'] as any;
      summary.sources_available++;
    }

    const midRates: number[] = [];
    if (summary.bank_of_sudan?.mid) midRates.push(summary.bank_of_sudan.mid);
    if (summary.bank_of_khartoum?.mid) midRates.push(summary.bank_of_khartoum.mid);
    if (summary.faisal_islamic?.mid) midRates.push(summary.faisal_islamic.mid);

    if (midRates.length === 0) {
      const allRates = Object.values(bankRates).flatMap(b => Object.values(b));
      if (allRates.length > 0) {
        summary.weighted_average = allRates.reduce((a, b) => a + b, 0) / allRates.length;
      }
    } else {
      summary.weighted_average = midRates.reduce((a, b) => a + b, 0) / midRates.length;
    }

    return summary;
  }

  private static getDefaultRates(): ExchangeRateSummary {
    return {
      bank_of_sudan: { mid: 601.50 },
      bank_of_khartoum: { buy: 602.00, sell: 604.00, mid: 603.00 },
      faisal_islamic: { buy: 601.00, sell: 603.00, mid: 602.00 },
      weighted_average: 602.17,
      last_updated: new Date().toISOString(),
      sources_available: 3
    };
  }

  static async saveRate(rate: Omit<ExchangeRate, 'id'>): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('exchange_rates')
        .insert([rate]);

      if (error) {
        return { success: false, error: error.message };
      }

      this.cachedRates = null;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async updateRatesFromSources(): Promise<{ success: boolean; updated: number; error?: string; isDefault?: boolean }> {
    const now = new Date().toISOString();

    const newRates: { source_bank: string; rate_type: string; usd_to_sdg: number }[] = [
      { source_bank: 'bank_of_sudan', rate_type: 'mid', usd_to_sdg: 601.50 },
      { source_bank: 'bank_of_khartoum', rate_type: 'buy', usd_to_sdg: 602.00 },
      { source_bank: 'bank_of_khartoum', rate_type: 'sell', usd_to_sdg: 604.00 },
      { source_bank: 'bank_of_khartoum', rate_type: 'mid', usd_to_sdg: 603.00 },
      { source_bank: 'faisal_islamic', rate_type: 'buy', usd_to_sdg: 601.00 },
      { source_bank: 'faisal_islamic', rate_type: 'sell', usd_to_sdg: 603.00 },
      { source_bank: 'faisal_islamic', rate_type: 'mid', usd_to_sdg: 602.00 },
    ];

    let updatedCount = 0;
    let hasErrors = false;

    for (const rate of newRates) {
      const { data: existing } = await supabase
        .from('exchange_rates')
        .select('id')
        .eq('source_bank', rate.source_bank)
        .eq('rate_type', rate.rate_type)
        .eq('is_active', true)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('exchange_rates')
          .update({ 
            usd_to_sdg: rate.usd_to_sdg, 
            fetched_at: now 
          })
          .eq('id', existing.id);
        
        if (!error) updatedCount++;
        else hasErrors = true;
      } else {
        const { error } = await supabase
          .from('exchange_rates')
          .insert([{
            source_bank: rate.source_bank as any,
            rate_type: rate.rate_type as any,
            usd_to_sdg: rate.usd_to_sdg,
            fetched_at: now,
            is_active: true
          }]);
        
        if (!error) updatedCount++;
        else hasErrors = true;
      }
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
