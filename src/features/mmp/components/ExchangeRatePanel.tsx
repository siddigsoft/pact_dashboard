import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, Building2, TrendingUp, Clock, Info, DollarSign } from 'lucide-react';
import { ExchangeRateService, type ExchangeRateSummary } from '@/services/exchangeRate.service';

interface ExchangeRatePanelProps {
  variant?: 'full' | 'compact' | 'banner';
  showRefresh?: boolean;
  onRateChange?: (rate: number) => void;
}

export function ExchangeRatePanel({ 
  variant = 'full', 
  showRefresh = true,
  onRateChange 
}: ExchangeRatePanelProps) {
  const [rates, setRates] = useState<ExchangeRateSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRates = async () => {
    try {
      const data = await ExchangeRateService.getLatestRates();
      setRates(data);
      if (onRateChange) {
        onRateChange(data.weighted_average);
      }
    } catch (err) {
      console.error('Error fetching exchange rates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await ExchangeRateService.updateRatesFromSources();
      await fetchRates();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse bg-muted rounded-md h-16" />
    );
  }

  if (!rates) {
    return null;
  }

  if (variant === 'banner') {
    return (
      <div className="flex items-center justify-between gap-4 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-md">
        <div className="flex items-center gap-3">
          <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div>
            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
              USD to SDG Rate:
            </span>
            <span className="ml-2 text-lg font-bold text-blue-900 dark:text-blue-100">
              {ExchangeRateService.formatRate(rates.weighted_average)}
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-xs cursor-help">
                <Clock className="h-3 w-3 mr-1" />
                {ExchangeRateService.formatTimeSince(rates.last_updated)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Weighted average from {rates.sources_available} Sudan banks</p>
            </TooltipContent>
          </Tooltip>
        </div>
        {showRefresh && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
            data-testid="button-refresh-rate-banner"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Rate:</span>
        <span className="font-semibold">{ExchangeRateService.formatRate(rates.weighted_average)} SDG/USD</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs space-y-1">
              {rates.bank_of_sudan?.mid && (
                <p>Bank of Sudan: {ExchangeRateService.formatRate(rates.bank_of_sudan.mid)}</p>
              )}
              {rates.bank_of_khartoum?.mid && (
                <p>Bank of Khartoum: {ExchangeRateService.formatRate(rates.bank_of_khartoum.mid)}</p>
              )}
              {rates.faisal_islamic?.mid && (
                <p>Faisal Islamic: {ExchangeRateService.formatRate(rates.faisal_islamic.mid)}</p>
              )}
              <p className="pt-1 border-t text-muted-foreground">
                Updated {ExchangeRateService.formatTimeSince(rates.last_updated)}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <Card className="border-2 border-dashed border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
            <DollarSign className="h-5 w-5" />
            USD to SDG Exchange Rate
          </CardTitle>
          {showRefresh && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={refreshing}
              data-testid="button-refresh-rate-full"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {rates.bank_of_sudan && (
            <div className="p-2 bg-white dark:bg-background rounded-md border">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <Building2 className="h-3 w-3" />
                Bank of Sudan
              </div>
              <div className="text-lg font-bold">
                {ExchangeRateService.formatRate(rates.bank_of_sudan.mid || 0)}
              </div>
              <div className="text-xs text-muted-foreground">Official Rate</div>
            </div>
          )}
          {rates.bank_of_khartoum && (
            <div className="p-2 bg-white dark:bg-background rounded-md border">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <Building2 className="h-3 w-3" />
                Bank of Khartoum
              </div>
              <div className="text-lg font-bold">
                {ExchangeRateService.formatRate(rates.bank_of_khartoum.mid || 0)}
              </div>
              <div className="text-xs text-muted-foreground">
                Buy: {ExchangeRateService.formatRate(rates.bank_of_khartoum.buy || 0)} | 
                Sell: {ExchangeRateService.formatRate(rates.bank_of_khartoum.sell || 0)}
              </div>
            </div>
          )}
          {rates.faisal_islamic && (
            <div className="p-2 bg-white dark:bg-background rounded-md border">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <Building2 className="h-3 w-3" />
                Faisal Islamic
              </div>
              <div className="text-lg font-bold">
                {ExchangeRateService.formatRate(rates.faisal_islamic.mid || 0)}
              </div>
              <div className="text-xs text-muted-foreground">
                Buy: {ExchangeRateService.formatRate(rates.faisal_islamic.buy || 0)} | 
                Sell: {ExchangeRateService.formatRate(rates.faisal_islamic.sell || 0)}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-3 bg-blue-100 dark:bg-blue-900/30 rounded-md">
          <div>
            <div className="text-sm text-muted-foreground">Weighted Average</div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {ExchangeRateService.formatRate(rates.weighted_average)} SDG
            </div>
            <div className="text-xs text-muted-foreground">per 1 USD</div>
          </div>
          <div className="text-right">
            <Badge variant="secondary">
              <Clock className="h-3 w-3 mr-1" />
              {ExchangeRateService.formatTimeSince(rates.last_updated)}
            </Badge>
            <div className="text-xs text-muted-foreground mt-1">
              {rates.sources_available} sources
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
