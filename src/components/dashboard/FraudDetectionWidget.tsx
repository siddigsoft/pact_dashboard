
import React, { useMemo } from "react";
import { FraudDetection } from "@/components/FraudDetection";
import { cn } from "@/lib/utils";
import { useAppContext } from "@/context/AppContext";

interface FraudDetectionWidgetProps {
  className?: string;
}

const FraudDetectionWidget = ({ className }: FraudDetectionWidgetProps) => {
  const { transactions } = useAppContext();

  const { recentCount, hasUnusualPatterns, hasHighValue } = useMemo(() => {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const recent = (transactions || []).filter(t => {
      const ts = new Date(t.createdAt).getTime();
      return !Number.isNaN(ts) && ts >= dayAgo;
    });

    // High-value heuristic: amount >= 1000 SDG
    const highValue = recent.some(t => (t.amount || 0) >= 1000);

    // Unusual patterns heuristic:
    // - burst activity: any user has >= 3 tx in 10 minutes
    // - or disputed/failed rate above small threshold in last 24h
    const byUser: Record<string, number[]> = {};
    recent.forEach(t => {
      const ts = new Date(t.createdAt).getTime();
      if (!byUser[t.userId]) byUser[t.userId] = [];
      byUser[t.userId].push(ts);
    });
    const burst = Object.values(byUser).some(list => {
      list.sort((a, b) => a - b);
      for (let i = 0; i + 2 < list.length; i++) {
        if (list[i + 2] - list[i] <= 10 * 60 * 1000) return true;
      }
      return false;
    });
    const disputeFailRate = recent.length > 0
      ? recent.filter(t => t.status === 'disputed' || t.status === 'failed').length / recent.length
      : 0;

    return {
      recentCount: recent.length,
      hasUnusualPatterns: burst || disputeFailRate >= 0.1,
      hasHighValue: highValue,
    };
  }, [transactions]);

  return (
    <div className={cn("w-full", className)}>
      <FraudDetection 
        recentTransactions={recentCount} 
        unusualPatterns={hasUnusualPatterns} 
        highValueTransactions={hasHighValue} 
      />
    </div>
  );
};

export default FraudDetectionWidget;
