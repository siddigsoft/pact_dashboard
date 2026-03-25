import { LineChart, Line, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface CostSparklineProps {
  history: Array<{ date: string; cost: number }>;
  currentPrediction?: number;
  width?: number;
  height?: number;
  showTooltip?: boolean;
  showTrend?: boolean;
}

export function CostSparkline({ 
  history, 
  currentPrediction,
  width = 80, 
  height = 24,
  showTooltip = true,
  showTrend = true
}: CostSparklineProps) {
  if (!history || history.length === 0) return null;

  const sortedHistory = [...history].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const data = sortedHistory.map((h, i) => ({
    index: i,
    cost: h.cost,
    date: h.date
  }));

  const costs = data.map(d => d.cost);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  
  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (data.length >= 2) {
    const half = Math.ceil(data.length / 2);
    const recentAvg = data.slice(-half).reduce((sum, d) => sum + d.cost, 0) / half;
    const olderAvg = data.slice(0, half).reduce((sum, d) => sum + d.cost, 0) / half;
    if (recentAvg > olderAvg * 1.1) trend = 'up';
    else if (recentAvg < olderAvg * 0.9) trend = 'down';
  }

  const lineColor = trend === 'up' ? '#ef4444' : trend === 'down' ? '#22c55e' : '#6b7280';

  return (
    <div className="flex items-center gap-1">
      <div style={{ width, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            {showTooltip && (
              <Tooltip
                contentStyle={{ 
                  fontSize: '10px', 
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)'
                }}
                formatter={(value: number) => [`${value.toLocaleString()} SDG`, 'Cost']}
                labelFormatter={(index: number) => {
                  const item = data[index];
                  return item?.date ? new Date(item.date).toLocaleDateString() : '';
                }}
              />
            )}
            {currentPrediction && (
              <ReferenceLine 
                y={currentPrediction} 
                stroke="#f59e0b" 
                strokeDasharray="2 2" 
                strokeWidth={1}
              />
            )}
            <Line 
              type="monotone" 
              dataKey="cost" 
              stroke={lineColor}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 2, fill: lineColor }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {showTrend && (
        <div className="flex-shrink-0">
          {trend === 'up' && (
            <TrendingUp className="h-3 w-3 text-red-500" />
          )}
          {trend === 'down' && (
            <TrendingDown className="h-3 w-3 text-green-500" />
          )}
          {trend === 'stable' && (
            <Minus className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      )}
    </div>
  );
}

interface CostTrendSummaryProps {
  history: Array<{ date: string; cost: number }>;
  prediction?: number;
}

export function CostTrendSummary({ history, prediction }: CostTrendSummaryProps) {
  if (!history || history.length === 0) return null;

  const costs = history.map(h => h.cost);
  const avg = Math.round(costs.reduce((a, b) => a + b, 0) / costs.length);
  const min = Math.min(...costs);
  const max = Math.max(...costs);

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <CostSparkline history={history} currentPrediction={prediction} />
      <span>Avg: {avg.toLocaleString()}</span>
      <span className="text-green-600 dark:text-green-400">Min: {min.toLocaleString()}</span>
      <span className="text-red-600 dark:text-red-400">Max: {max.toLocaleString()}</span>
    </div>
  );
}
