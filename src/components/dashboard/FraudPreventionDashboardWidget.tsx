
import React from "react";
import { FraudPreventionDashboard } from "@/components/FraudPreventionDashboard";
import { cn } from "@/lib/utils";

interface FraudPreventionDashboardWidgetProps {
  className?: string;
}

const FraudPreventionDashboardWidget = ({ className }: FraudPreventionDashboardWidgetProps) => {
  return (
    <div className={cn("w-full", className)}>
      <FraudPreventionDashboard 
        suspiciousTransactionsCount={8} 
        blockedTransactionsCount={3} 
        highRiskAccountsCount={2} 
      />
    </div>
  );
};

export default FraudPreventionDashboardWidget;
