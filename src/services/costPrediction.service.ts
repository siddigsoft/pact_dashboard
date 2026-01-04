import { supabase } from '@/integrations/supabase/client';
import { normalizeStateId, normalizeLocalityId } from '@/utils/siteNormalization';

export interface HistoricalSiteCost {
  id?: string;
  site_id: string;
  site_name: string;
  state_id: string;
  locality_id: string;
  hub_id?: string;
  visit_date: string;
  actual_cost: number;
  transport_mode?: string;
  gps_latitude?: number | null;
  gps_longitude?: number | null;
  gps_source?: 'registry' | 'mmp' | 'upload' | 'manual' | string;
  data_collector_id?: string | null;
  collector_distance_km?: number | null;
  mmp_id?: string | null;
  source: 'historical_upload' | 'live';
  uploaded_at?: string;
}

export interface PredictionProvenance {
  method: string;
  description: string;
  data_points: number;
  source_area?: string;
  avg_cost?: number;
  min_cost?: number;
  max_cost?: number;
  trend?: 'increasing' | 'decreasing' | 'stable';
  variance_pct?: number;
}

export interface CostPrediction {
  site_id: string;
  predicted_cost: number;
  confidence: number;
  algorithm_used: 'exponential_smoothing' | 'site_average' | 'locality_median' | 'state_median' | 'hub_median';
  visit_count: number;
  last_calculated: string;
  history?: { date: string; cost: number }[];
  provenance?: PredictionProvenance;
}

export interface CollectorWithDistance {
  id: string;
  full_name: string;
  email?: string;
  locality_id?: string;
  locality_name?: string;
  state_id?: string;
  state_name?: string;
  hub_id?: string;
  current_latitude?: number;
  current_longitude?: number;
  distance_km: number | null;
  current_workload: number;
  is_same_locality: boolean;
  is_same_state: boolean;
  status: 'available' | 'busy' | 'offline';
  recommendation_score: number;
}

export interface ValidationResult {
  total_records: number;
  matched_sites: number;
  matched_with_gps: number;
  matched_without_gps: number;
  new_sites: number;
  validated_states: number;
  invalid_states: string[];
  validated_localities: number;
  invalid_localities: string[];
  records: ParsedHistoricalRecord[];
  errors: string[];
}

export interface ParsedHistoricalRecord {
  site_name: string;
  state: string;
  locality: string;
  hub: string;
  visit_date?: string;
  actual_cost?: number;
  transport_mode?: string;
  matched_site_id?: string;
  has_gps: boolean;
  gps_latitude?: number;
  gps_longitude?: number;
  is_new_site: boolean;
  validation_status: 'valid' | 'warning' | 'error';
  validation_message?: string;
}

const SMOOTHING_FACTOR = 0.3;
const VARIANCE_THRESHOLD_WARNING = 0.2; // 20% deviation triggers warning
const VARIANCE_THRESHOLD_CRITICAL = 0.5; // 50% deviation triggers critical alert

export interface VarianceAlert {
  site_id: string;
  site_name: string;
  predicted_cost: number;
  actual_cost: number;
  variance_pct: number;
  variance_amount: number;
  severity: 'warning' | 'critical';
  message: string;
}

export interface PredictionFeedback {
  site_id: string;
  site_name: string;
  state_id: string;
  locality_id: string;
  hub_id?: string;
  predicted_cost: number;
  actual_cost: number;
  variance_pct: number;
  prediction_method: string;
  feedback_date: string;
  mmp_id?: string;
}

export interface AccuracyMetrics {
  total_predictions: number;
  accurate_predictions: number;
  within_10_pct: number;
  within_20_pct: number;
  over_predicted: number;
  under_predicted: number;
  avg_variance_pct: number;
  mean_absolute_error: number;
}

export class CostPredictionService {
  static async predictCostForSite(
    siteId: string,
    stateName?: string,
    localityName?: string,
    hubId?: string
  ): Promise<CostPrediction | null> {
    try {
      const { data: historicalCosts, error } = await supabase
        .from('historical_site_costs')
        .select('*')
        .eq('site_id', siteId)
        .order('visit_date', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching historical costs:', error);
        return null;
      }

      const visitCount = historicalCosts?.length || 0;

      if (visitCount >= 3) {
        return this.exponentialSmoothing(siteId, historicalCosts!);
      } else if (visitCount > 0 && visitCount < 3) {
        const localityStats = await this.getLocalityMedianWithStats(localityName || '', stateName);
        if (localityStats) {
          return {
            site_id: siteId,
            predicted_cost: localityStats.median,
            confidence: 60 + (visitCount * 5),
            algorithm_used: 'locality_median',
            visit_count: visitCount,
            last_calculated: new Date().toISOString(),
            history: historicalCosts?.map(c => ({ date: c.visit_date, cost: c.actual_cost })),
            provenance: {
              method: 'Locality Median',
              description: `Based on ${localityStats.count} visits across ${localityStats.areaName} locality`,
              data_points: localityStats.count,
              source_area: localityStats.areaName,
              avg_cost: localityStats.avg,
              min_cost: localityStats.min,
              max_cost: localityStats.max
            }
          };
        }
      }

      const localityStats = await this.getLocalityMedianWithStats(localityName || '', stateName);
      if (localityStats) {
        return {
          site_id: siteId,
          predicted_cost: localityStats.median,
          confidence: 55,
          algorithm_used: 'locality_median',
          visit_count: 0,
          last_calculated: new Date().toISOString(),
          provenance: {
            method: 'Locality Median',
            description: `New site - using ${localityStats.count} visits from ${localityStats.areaName} locality`,
            data_points: localityStats.count,
            source_area: localityStats.areaName,
            avg_cost: localityStats.avg,
            min_cost: localityStats.min,
            max_cost: localityStats.max
          }
        };
      }

      const stateStats = await this.getStateMedianWithStats(stateName || '');
      if (stateStats) {
        return {
          site_id: siteId,
          predicted_cost: stateStats.median,
          confidence: 45,
          algorithm_used: 'state_median',
          visit_count: 0,
          last_calculated: new Date().toISOString(),
          provenance: {
            method: 'State Median',
            description: `New site - using ${stateStats.count} visits from ${stateStats.areaName} state`,
            data_points: stateStats.count,
            source_area: stateStats.areaName,
            avg_cost: stateStats.avg,
            min_cost: stateStats.min,
            max_cost: stateStats.max
          }
        };
      }

      const hubStats = await this.getHubMedianWithStats(hubId || '');
      if (hubStats) {
        return {
          site_id: siteId,
          predicted_cost: hubStats.median,
          confidence: 35,
          algorithm_used: 'hub_median',
          visit_count: hubStats.count,
          last_calculated: new Date().toISOString(),
          provenance: {
            method: 'Hub Average',
            description: `New site with no locality/state data - using hub-wide average from ${hubStats.count} records`,
            data_points: hubStats.count,
            avg_cost: hubStats.avg,
            min_cost: hubStats.min,
            max_cost: hubStats.max
          }
        };
      }

      return null;
    } catch (err) {
      console.error('Error predicting cost:', err);
      return null;
    }
  }

  private static exponentialSmoothing(
    siteId: string,
    historicalCosts: any[]
  ): CostPrediction {
    const costs = historicalCosts.map(c => c.actual_cost).reverse();
    
    let smoothedValue = costs[0];
    for (let i = 1; i < costs.length; i++) {
      smoothedValue = SMOOTHING_FACTOR * costs[i] + (1 - SMOOTHING_FACTOR) * smoothedValue;
    }

    const variance = this.calculateVariance(costs);
    const confidence = Math.min(95, 75 + Math.floor(costs.length * 2) - Math.min(variance / 100, 15));
    
    const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const variancePct = avgCost > 0 ? (Math.sqrt(variance) / avgCost) * 100 : 0;
    
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (costs.length >= 2) {
      const recentAvg = costs.slice(-Math.ceil(costs.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(costs.length / 2);
      const olderAvg = costs.slice(0, Math.floor(costs.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(costs.length / 2);
      if (recentAvg > olderAvg * 1.1) trend = 'increasing';
      else if (recentAvg < olderAvg * 0.9) trend = 'decreasing';
    }

    return {
      site_id: siteId,
      predicted_cost: Math.round(smoothedValue),
      confidence: Math.max(60, confidence),
      algorithm_used: 'exponential_smoothing',
      visit_count: costs.length,
      last_calculated: new Date().toISOString(),
      history: historicalCosts.map(c => ({ date: c.visit_date, cost: c.actual_cost })),
      provenance: {
        method: 'Exponential Smoothing',
        description: `Based on ${costs.length} previous visits to this exact site`,
        data_points: costs.length,
        avg_cost: Math.round(avgCost),
        min_cost: minCost,
        max_cost: maxCost,
        trend,
        variance_pct: Math.round(variancePct)
      }
    };
  }

  private static calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  private static isCanonicalId(value: string): boolean {
    return /^[a-z0-9-]+$/.test(value) && value.includes('-');
  }

  private static async getLocalityMedianWithStats(localityNameOrId: string, stateNameOrId?: string): Promise<{
    median: number;
    count: number;
    min: number;
    max: number;
    avg: number;
    areaName: string;
  } | null> {
    if (!localityNameOrId || localityNameOrId.trim() === '') return null;
    
    try {
      let lookupIds: string[] = [];
      
      if (this.isCanonicalId(localityNameOrId)) {
        lookupIds.push(localityNameOrId);
      }
      
      if (stateNameOrId) {
        const normalizedStateId = normalizeStateId(stateNameOrId);
        if (normalizedStateId) {
          const normalizedLocalityId = normalizeLocalityId(localityNameOrId, normalizedStateId);
          if (normalizedLocalityId && !lookupIds.includes(normalizedLocalityId)) {
            lookupIds.push(normalizedLocalityId);
          }
        }
      }
      
      const kebabLocality = localityNameOrId.toLowerCase().trim().replace(/\s+/g, '-');
      if (!lookupIds.includes(kebabLocality)) {
        lookupIds.push(kebabLocality);
      }
      
      if (lookupIds.length === 0) {
        console.warn(`[CostPrediction] Could not resolve locality ID for: ${localityNameOrId}`);
        return null;
      }
      
      for (const lookupId of lookupIds) {
        const { data, error } = await supabase
          .from('historical_site_costs')
          .select('actual_cost')
          .eq('locality_id', lookupId);

        if (!error && data && data.length > 0) {
          const costs = data.map(d => d.actual_cost).sort((a, b) => a - b);
          const mid = Math.floor(costs.length / 2);
          const median = costs.length % 2 !== 0 ? costs[mid] : (costs[mid - 1] + costs[mid]) / 2;
          const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
          return {
            median,
            count: costs.length,
            min: costs[0],
            max: costs[costs.length - 1],
            avg: Math.round(avg),
            areaName: localityNameOrId
          };
        }
      }
      
      return null;
    } catch (err) {
      console.error('[CostPrediction] Error in getLocalityMedianWithStats:', err);
      return null;
    }
  }

  private static async getLocalityMedian(localityNameOrId: string, stateNameOrId?: string): Promise<number | null> {
    const stats = await this.getLocalityMedianWithStats(localityNameOrId, stateNameOrId);
    return stats ? stats.median : null;
  }

  private static async getStateMedianWithStats(stateNameOrId: string): Promise<{
    median: number;
    count: number;
    min: number;
    max: number;
    avg: number;
    areaName: string;
  } | null> {
    if (!stateNameOrId || stateNameOrId.trim() === '') return null;
    
    try {
      let lookupIds: string[] = [];
      
      if (this.isCanonicalId(stateNameOrId)) {
        lookupIds.push(stateNameOrId);
      }
      
      const normalizedStateId = normalizeStateId(stateNameOrId);
      if (normalizedStateId && !lookupIds.includes(normalizedStateId)) {
        lookupIds.push(normalizedStateId);
      }
      
      const kebabState = stateNameOrId.toLowerCase().trim().replace(/\s+/g, '-');
      if (!lookupIds.includes(kebabState)) {
        lookupIds.push(kebabState);
      }
      
      if (lookupIds.length === 0) {
        console.warn(`[CostPrediction] Could not resolve state ID for: ${stateNameOrId}`);
        return null;
      }
      
      for (const lookupId of lookupIds) {
        const { data, error } = await supabase
          .from('historical_site_costs')
          .select('actual_cost')
          .eq('state_id', lookupId);

        if (!error && data && data.length > 0) {
          const costs = data.map(d => d.actual_cost).sort((a, b) => a - b);
          const mid = Math.floor(costs.length / 2);
          const median = costs.length % 2 !== 0 ? costs[mid] : (costs[mid - 1] + costs[mid]) / 2;
          const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
          return {
            median,
            count: costs.length,
            min: costs[0],
            max: costs[costs.length - 1],
            avg: Math.round(avg),
            areaName: stateNameOrId
          };
        }
      }
      
      return null;
    } catch (err) {
      console.error('[CostPrediction] Error in getStateMedianWithStats:', err);
      return null;
    }
  }

  private static async getStateMedian(stateNameOrId: string): Promise<number | null> {
    const stats = await this.getStateMedianWithStats(stateNameOrId);
    return stats ? stats.median : null;
  }

  static async batchPredictCosts(sites: Array<{
    id: string;
    site_id?: string;
    state?: string;
    state_name?: string;
    locality?: string;
    locality_name?: string;
    hub_id?: string;
  }>): Promise<Map<string, CostPrediction>> {
    const predictions = new Map<string, CostPrediction>();
    
    if (sites.length === 0) return predictions;
    
    try {
      const siteIds = sites.map(s => s.site_id || s.id);
      
      const { data: historicalData, error } = await supabase
        .from('historical_site_costs')
        .select('site_id, actual_cost, visit_date')
        .in('site_id', siteIds)
        .order('visit_date', { ascending: false });

      if (error) {
        console.error('Error fetching batch historical costs:', error);
        return predictions;
      }

      const costsBySite = new Map<string, number[]>();
      historicalData?.forEach(record => {
        const existing = costsBySite.get(record.site_id) || [];
        existing.push(record.actual_cost);
        costsBySite.set(record.site_id, existing);
      });

      for (const site of sites) {
        const siteId = site.site_id || site.id;
        const costs = costsBySite.get(siteId) || [];
        
        if (costs.length >= 3) {
          const smoothedCosts = costs.slice(0, 10).reverse();
          let smoothedValue = smoothedCosts[0];
          for (let i = 1; i < smoothedCosts.length; i++) {
            smoothedValue = 0.3 * smoothedCosts[i] + 0.7 * smoothedValue;
          }
          
          const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;
          const minCost = Math.min(...costs);
          const maxCost = Math.max(...costs);
          
          let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
          if (costs.length >= 2) {
            const half = Math.ceil(costs.length / 2);
            const recentAvg = costs.slice(0, half).reduce((a, b) => a + b, 0) / half;
            const olderAvg = costs.slice(half).reduce((a, b) => a + b, 0) / (costs.length - half);
            if (recentAvg > olderAvg * 1.1) trend = 'increasing';
            else if (recentAvg < olderAvg * 0.9) trend = 'decreasing';
          }
          
          predictions.set(site.id, {
            site_id: siteId,
            predicted_cost: Math.round(smoothedValue),
            confidence: Math.min(95, 75 + costs.length * 2),
            algorithm_used: 'exponential_smoothing',
            visit_count: costs.length,
            last_calculated: new Date().toISOString(),
            provenance: {
              method: 'Exponential Smoothing',
              description: `Based on ${costs.length} previous visits to this exact site`,
              data_points: costs.length,
              avg_cost: Math.round(avgCost),
              min_cost: minCost,
              max_cost: maxCost,
              trend
            }
          });
        } else if (costs.length > 0) {
          const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
          const minCostVal = Math.min(...costs);
          const maxCostVal = Math.max(...costs);
          predictions.set(site.id, {
            site_id: siteId,
            predicted_cost: Math.round(avg),
            confidence: 50 + costs.length * 10,
            algorithm_used: 'site_average',
            visit_count: costs.length,
            last_calculated: new Date().toISOString(),
            provenance: {
              method: 'Site Average',
              description: `Based on ${costs.length} previous visit(s) to this site`,
              data_points: costs.length,
              avg_cost: Math.round(avg),
              min_cost: minCostVal,
              max_cost: maxCostVal
            }
          });
        } else {
          const localityName = site.locality || site.locality_name || '';
          const stateName = site.state || site.state_name || '';
          
          const localityStats = await this.getLocalityMedianWithStats(localityName, stateName);
          if (localityStats) {
            predictions.set(site.id, {
              site_id: siteId,
              predicted_cost: localityStats.median,
              confidence: 55,
              algorithm_used: 'locality_median',
              visit_count: 0,
              last_calculated: new Date().toISOString(),
              provenance: {
                method: 'Locality Median',
                description: `New site - using ${localityStats.count} visits from ${localityStats.areaName} locality`,
                data_points: localityStats.count,
                source_area: localityStats.areaName,
                avg_cost: localityStats.avg,
                min_cost: localityStats.min,
                max_cost: localityStats.max
              }
            });
          } else {
            const stateStats = await this.getStateMedianWithStats(stateName);
            if (stateStats) {
              predictions.set(site.id, {
                site_id: siteId,
                predicted_cost: stateStats.median,
                confidence: 45,
                algorithm_used: 'state_median',
                visit_count: 0,
                last_calculated: new Date().toISOString(),
                provenance: {
                  method: 'State Median',
                  description: `New site - using ${stateStats.count} visits from ${stateStats.areaName} state`,
                  data_points: stateStats.count,
                  source_area: stateStats.areaName,
                  avg_cost: stateStats.avg,
                  min_cost: stateStats.min,
                  max_cost: stateStats.max
                }
              });
            } else if (site.hub_id) {
              const hubStats = await this.getHubMedianWithStats(site.hub_id);
              if (hubStats) {
                predictions.set(site.id, {
                  site_id: siteId,
                  predicted_cost: hubStats.median,
                  confidence: 35,
                  algorithm_used: 'hub_median',
                  visit_count: hubStats.count,
                  last_calculated: new Date().toISOString(),
                  provenance: {
                    method: 'Hub Average',
                    description: `New site with no locality/state data - using hub-wide average from ${hubStats.count} records`,
                    data_points: hubStats.count,
                    avg_cost: hubStats.avg,
                    min_cost: hubStats.min,
                    max_cost: hubStats.max
                  }
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Error in batch prediction:', err);
    }
    
    return predictions;
  }

  private static async getHubMedianWithStats(hubId: string): Promise<{
    median: number;
    count: number;
    min: number;
    max: number;
    avg: number;
  } | null> {
    try {
      const { data, error } = await supabase
        .from('historical_site_costs')
        .select('actual_cost')
        .eq('hub_id', hubId);

      if (error || !data || data.length === 0) return null;

      const costs = data.map(d => d.actual_cost).sort((a, b) => a - b);
      const mid = Math.floor(costs.length / 2);
      const median = costs.length % 2 !== 0 ? costs[mid] : (costs[mid - 1] + costs[mid]) / 2;
      const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
      
      return {
        median,
        count: costs.length,
        min: costs[0],
        max: costs[costs.length - 1],
        avg: Math.round(avg)
      };
    } catch {
      return null;
    }
  }

  private static async getHubMedian(hubId: string): Promise<number | null> {
    const stats = await this.getHubMedianWithStats(hubId);
    return stats?.median || null;
  }

  static checkVariance(
    siteName: string,
    siteId: string,
    predictedCost: number,
    actualCost: number
  ): VarianceAlert | null {
    if (predictedCost <= 0) return null;
    
    const varianceAmount = actualCost - predictedCost;
    const variancePct = varianceAmount / predictedCost;
    
    if (variancePct >= VARIANCE_THRESHOLD_CRITICAL) {
      return {
        site_id: siteId,
        site_name: siteName,
        predicted_cost: predictedCost,
        actual_cost: actualCost,
        variance_pct: Math.round(variancePct * 100),
        variance_amount: varianceAmount,
        severity: 'critical',
        message: `Actual cost (${actualCost.toLocaleString()} SDG) is ${Math.round(variancePct * 100)}% higher than predicted (${predictedCost.toLocaleString()} SDG)`
      };
    } else if (variancePct >= VARIANCE_THRESHOLD_WARNING) {
      return {
        site_id: siteId,
        site_name: siteName,
        predicted_cost: predictedCost,
        actual_cost: actualCost,
        variance_pct: Math.round(variancePct * 100),
        variance_amount: varianceAmount,
        severity: 'warning',
        message: `Actual cost (${actualCost.toLocaleString()} SDG) is ${Math.round(variancePct * 100)}% higher than predicted (${predictedCost.toLocaleString()} SDG)`
      };
    }
    
    return null;
  }

  static async checkBatchVariance(
    sites: Array<{
      id: string;
      site_id?: string;
      site_name: string;
      actual_cost: number;
      state?: string;
      locality?: string;
      hub_id?: string;
    }>
  ): Promise<VarianceAlert[]> {
    const alerts: VarianceAlert[] = [];
    
    const predictions = await this.batchPredictCosts(
      sites.map(s => ({
        id: s.id,
        site_id: s.site_id,
        state: s.state,
        locality: s.locality,
        hub_id: s.hub_id
      }))
    );
    
    for (const site of sites) {
      const prediction = predictions.get(site.id);
      if (prediction && site.actual_cost > 0) {
        const alert = this.checkVariance(
          site.site_name,
          site.id,
          prediction.predicted_cost,
          site.actual_cost
        );
        if (alert) {
          alerts.push(alert);
        }
      }
    }
    
    return alerts.sort((a, b) => {
      if (a.severity === 'critical' && b.severity !== 'critical') return -1;
      if (b.severity === 'critical' && a.severity !== 'critical') return 1;
      return b.variance_pct - a.variance_pct;
    });
  }

  static async recordPredictionFeedback(feedback: PredictionFeedback): Promise<boolean> {
    try {
      const record: HistoricalSiteCost = {
        site_id: feedback.site_id,
        site_name: feedback.site_name,
        state_id: feedback.state_id,
        locality_id: feedback.locality_id,
        hub_id: feedback.hub_id,
        visit_date: feedback.feedback_date,
        actual_cost: feedback.actual_cost,
        mmp_id: feedback.mmp_id,
        source: 'live'
      };

      const { error } = await supabase
        .from('historical_site_costs')
        .insert(record);

      if (error) {
        console.error('Error recording prediction feedback:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error in recordPredictionFeedback:', err);
      return false;
    }
  }

  static async calculateAccuracyMetrics(
    startDate?: string,
    endDate?: string,
    hubId?: string
  ): Promise<AccuracyMetrics> {
    const metrics: AccuracyMetrics = {
      total_predictions: 0,
      accurate_predictions: 0,
      within_10_pct: 0,
      within_20_pct: 0,
      over_predicted: 0,
      under_predicted: 0,
      avg_variance_pct: 0,
      mean_absolute_error: 0
    };

    try {
      let query = supabase
        .from('historical_site_costs')
        .select('site_id, actual_cost, visit_date, state_id, locality_id')
        .eq('source', 'live')
        .order('visit_date', { ascending: false });

      if (startDate) {
        query = query.gte('visit_date', startDate);
      }
      if (endDate) {
        query = query.lte('visit_date', endDate);
      }
      if (hubId) {
        query = query.eq('hub_id', hubId);
      }

      const { data: historicalRecords, error } = await query.limit(100);

      if (error || !historicalRecords || historicalRecords.length === 0) {
        return metrics;
      }

      let totalVariance = 0;
      let totalAbsoluteError = 0;

      for (const record of historicalRecords) {
        const prediction = await this.predictCostForSite(
          record.site_id,
          record.state_id,
          record.locality_id
        );

        if (prediction) {
          metrics.total_predictions++;
          const variance = (record.actual_cost - prediction.predicted_cost) / prediction.predicted_cost;
          const absVariance = Math.abs(variance);
          const absError = Math.abs(record.actual_cost - prediction.predicted_cost);

          totalVariance += variance * 100;
          totalAbsoluteError += absError;

          if (absVariance <= 0.1) {
            metrics.within_10_pct++;
            metrics.accurate_predictions++;
          } else if (absVariance <= 0.2) {
            metrics.within_20_pct++;
          }

          if (variance > 0) {
            metrics.under_predicted++;
          } else if (variance < 0) {
            metrics.over_predicted++;
          }
        }
      }

      if (metrics.total_predictions > 0) {
        metrics.avg_variance_pct = Math.round(totalVariance / metrics.total_predictions);
        metrics.mean_absolute_error = Math.round(totalAbsoluteError / metrics.total_predictions);
      }

      return metrics;
    } catch (err) {
      console.error('Error calculating accuracy metrics:', err);
      return metrics;
    }
  }

  static async getAccuracyByMethod(): Promise<Map<string, AccuracyMetrics>> {
    const methodMetrics = new Map<string, AccuracyMetrics>();
    
    const methods = ['exponential_smoothing', 'locality_median', 'state_median', 'hub_median'];
    
    for (const method of methods) {
      methodMetrics.set(method, {
        total_predictions: 0,
        accurate_predictions: 0,
        within_10_pct: 0,
        within_20_pct: 0,
        over_predicted: 0,
        under_predicted: 0,
        avg_variance_pct: 0,
        mean_absolute_error: 0
      });
    }

    return methodMetrics;
  }

  static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  private static toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  static adjustPredictionForDistance(
    basePrediction: number,
    distanceKm: number,
    baseDistanceKm: number = 50
  ): { adjustedCost: number; adjustmentFactor: number; adjustmentNote: string } {
    if (distanceKm <= 0 || baseDistanceKm <= 0) {
      return {
        adjustedCost: basePrediction,
        adjustmentFactor: 1,
        adjustmentNote: 'No distance adjustment applied'
      };
    }

    const distanceRatio = distanceKm / baseDistanceKm;
    let adjustmentFactor = 1;
    let adjustmentNote = '';

    if (distanceRatio > 2) {
      adjustmentFactor = 1 + ((distanceRatio - 1) * 0.15);
      adjustmentNote = `Long distance (+${Math.round((adjustmentFactor - 1) * 100)}% for ${distanceKm.toFixed(1)}km)`;
    } else if (distanceRatio > 1.5) {
      adjustmentFactor = 1 + ((distanceRatio - 1) * 0.1);
      adjustmentNote = `Medium distance (+${Math.round((adjustmentFactor - 1) * 100)}% for ${distanceKm.toFixed(1)}km)`;
    } else if (distanceRatio < 0.5) {
      adjustmentFactor = 0.9 + (distanceRatio * 0.2);
      adjustmentNote = `Short distance (${Math.round((1 - adjustmentFactor) * 100)}% reduction for ${distanceKm.toFixed(1)}km)`;
    } else {
      adjustmentNote = `Standard distance (${distanceKm.toFixed(1)}km)`;
    }

    const adjustedCost = Math.round(basePrediction * adjustmentFactor);

    return {
      adjustedCost,
      adjustmentFactor,
      adjustmentNote
    };
  }

  static async predictCostWithDistance(
    siteId: string,
    siteLat: number | null,
    siteLon: number | null,
    hubLat: number | null,
    hubLon: number | null,
    stateName?: string,
    localityName?: string,
    hubId?: string
  ): Promise<CostPrediction | null> {
    const basePrediction = await this.predictCostForSite(siteId, stateName, localityName, hubId);
    
    if (!basePrediction) return null;

    if (siteLat && siteLon && hubLat && hubLon) {
      const distanceKm = this.calculateDistance(hubLat, hubLon, siteLat, siteLon);
      const { adjustedCost, adjustmentNote } = this.adjustPredictionForDistance(
        basePrediction.predicted_cost,
        distanceKm
      );

      return {
        ...basePrediction,
        predicted_cost: adjustedCost,
        provenance: {
          ...basePrediction.provenance,
          method: basePrediction.provenance?.method || basePrediction.algorithm_used,
          description: `${basePrediction.provenance?.description || ''} | ${adjustmentNote}`,
          data_points: basePrediction.provenance?.data_points || basePrediction.visit_count
        }
      };
    }

    return basePrediction;
  }

  static async findNearestCollectors(
    siteLat: number | null,
    siteLon: number | null,
    siteState: string,
    siteLocality: string,
    siteHubId?: string
  ): Promise<CollectorWithDistance[]> {
    try {
      const { data: collectors, error } = await supabase
        .from('profiles')
        .select(`
          id, 
          full_name, 
          email, 
          locality_id, 
          state_id, 
          hub_id,
          current_latitude,
          current_longitude,
          status,
          availability
        `)
        .in('role', ['dataCollector', 'datacollector', 'DataCollector'])
        .eq('status', 'active');

      if (error || !collectors) {
        console.error('Error fetching collectors:', error);
        return [];
      }

      const { data: siteVisits } = await supabase
        .from('site_visits')
        .select('assigned_to, status')
        .in('status', ['assigned', 'confirmed', 'in_progress', 'ongoing']);

      const workloadMap: Record<string, number> = {};
      siteVisits?.forEach(sv => {
        if (sv.assigned_to) {
          workloadMap[sv.assigned_to] = (workloadMap[sv.assigned_to] || 0) + 1;
        }
      });

      const collectorsWithDistance: CollectorWithDistance[] = collectors.map(collector => {
        let distance: number | null = null;
        
        if (siteLat && siteLon && collector.current_latitude && collector.current_longitude) {
          distance = this.calculateDistance(
            siteLat,
            siteLon,
            collector.current_latitude,
            collector.current_longitude
          );
        }

        const isSameLocality = collector.locality_id?.toLowerCase() === siteLocality?.toLowerCase();
        const isSameState = collector.state_id?.toLowerCase() === siteState?.toLowerCase();
        const currentWorkload = workloadMap[collector.id] || 0;

        const distanceScore = distance !== null ? distance : 1000;
        const workloadScore = currentWorkload * 2;
        const localityBonus = isSameLocality ? -15 : 0;
        const stateBonus = isSameState && !isSameLocality ? -5 : 0;
        
        const recommendationScore = distanceScore + workloadScore + localityBonus + stateBonus;

        return {
          id: collector.id,
          full_name: collector.full_name || 'Unknown',
          email: collector.email,
          locality_id: collector.locality_id,
          state_id: collector.state_id,
          hub_id: collector.hub_id,
          current_latitude: collector.current_latitude,
          current_longitude: collector.current_longitude,
          distance_km: distance,
          current_workload: currentWorkload,
          is_same_locality: isSameLocality,
          is_same_state: isSameState,
          status: collector.availability === 'offline' ? 'offline' : 'available',
          recommendation_score: recommendationScore
        };
      });

      return collectorsWithDistance
        .filter(c => c.is_same_locality || c.is_same_state || (siteHubId && c.hub_id === siteHubId))
        .sort((a, b) => a.recommendation_score - b.recommendation_score);
    } catch (err) {
      console.error('Error finding nearest collectors:', err);
      return [];
    }
  }

  static async bulkAutoAssign(
    sites: Array<{
      id: string;
      site_id: string;
      site_name: string;
      state: string;
      locality: string;
      hub_id?: string;
      gps_latitude?: number;
      gps_longitude?: number;
    }>,
    strategy: 'balance_workload' | 'minimize_distance' | 'minimize_cost' = 'balance_workload'
  ): Promise<Map<string, { collector_id: string; collector_name: string; predicted_cost: number; distance_km: number | null }>> {
    const assignments = new Map();

    const allCollectors = await this.findNearestCollectors(null, null, '', '', undefined);
    const workloadTracker: Record<string, number> = {};
    allCollectors.forEach(c => {
      workloadTracker[c.id] = c.current_workload;
    });

    for (const site of sites) {
      const collectors = await this.findNearestCollectors(
        site.gps_latitude || null,
        site.gps_longitude || null,
        site.state,
        site.locality,
        site.hub_id
      );

      if (collectors.length === 0) continue;

      let selectedCollector: CollectorWithDistance | null = null;

      if (strategy === 'minimize_distance') {
        selectedCollector = collectors
          .filter(c => c.distance_km !== null)
          .sort((a, b) => (a.distance_km || 999) - (b.distance_km || 999))[0] || collectors[0];
      } else if (strategy === 'minimize_cost') {
        selectedCollector = collectors
          .filter(c => c.distance_km !== null)
          .sort((a, b) => (a.distance_km || 999) - (b.distance_km || 999))[0] || collectors[0];
      } else {
        selectedCollector = collectors
          .map(c => ({
            ...c,
            current_workload: workloadTracker[c.id] || 0
          }))
          .sort((a, b) => a.current_workload - b.current_workload)[0];
      }

      if (selectedCollector) {
        workloadTracker[selectedCollector.id] = (workloadTracker[selectedCollector.id] || 0) + 1;

        const prediction = await this.predictCostForSite(
          site.site_id,
          site.state,
          site.locality,
          site.hub_id
        );

        assignments.set(site.id, {
          collector_id: selectedCollector.id,
          collector_name: selectedCollector.full_name,
          predicted_cost: prediction?.predicted_cost || 0,
          distance_km: selectedCollector.distance_km
        });
      }
    }

    return assignments;
  }

  static async saveHistoricalCosts(records: HistoricalSiteCost[]): Promise<{ success: boolean; inserted: number; errors: string[] }> {
    const errors: string[] = [];
    let inserted = 0;

    // Batch insert in chunks of 100 for better performance
    const BATCH_SIZE = 100;
    const batches = [];
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      batches.push(records.slice(i, i + BATCH_SIZE));
    }

    console.log(`[CostPrediction] Inserting ${records.length} records in ${batches.length} batches`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`[CostPrediction] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} records)`);
      
      try {
        const recordsToInsert = batch.map(record => ({
          site_id: record.site_id,
          site_name: record.site_name,
          state_id: record.state_id,
          locality_id: record.locality_id,
          hub_id: record.hub_id,
          visit_date: record.visit_date,
          actual_cost: record.actual_cost,
          transport_mode: record.transport_mode,
          gps_latitude: record.gps_latitude,
          gps_longitude: record.gps_longitude,
          gps_source: record.gps_source,
          data_collector_id: record.data_collector_id,
          collector_distance_km: record.collector_distance_km,
          mmp_id: record.mmp_id,
          source: record.source,
          uploaded_at: new Date().toISOString()
        }));

        const { error, data } = await supabase
          .from('historical_site_costs')
          .insert(recordsToInsert)
          .select('id');

        if (error) {
          console.error(`[CostPrediction] Batch ${batchIndex + 1} error:`, error);
          errors.push(`Batch ${batchIndex + 1} failed: ${error.message}`);
        } else {
          inserted += data?.length || batch.length;
          console.log(`[CostPrediction] Batch ${batchIndex + 1} inserted ${data?.length || batch.length} records`);
        }
      } catch (err: any) {
        console.error(`[CostPrediction] Batch ${batchIndex + 1} exception:`, err);
        errors.push(`Batch ${batchIndex + 1} error: ${err.message}`);
      }
    }

    console.log(`[CostPrediction] Import complete: ${inserted} inserted, ${errors.length} errors`);
    return { success: errors.length === 0, inserted, errors };
  }
}

export default CostPredictionService;
