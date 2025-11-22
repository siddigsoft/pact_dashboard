import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, AlertTriangle, FileCheck, ShieldAlert } from 'lucide-react';
import FraudDetectionWidget from '../FraudDetectionWidget';
import FraudPreventionDashboardWidget from '../FraudPreventionDashboardWidget';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMMP } from '@/context/mmp/MMPContext';
import { Progress } from '@/components/ui/progress';

export const ComplianceZone: React.FC = () => {
  const [activeTab, setActiveTab] = useState('detection');
  const { mmpFiles } = useMMP();

  const totalMMPs = mmpFiles?.length || 0;
  const approvedMMPs = mmpFiles?.filter(m => m.status === 'approved').length || 0;
  const pendingMMPs = mmpFiles?.filter(m => m.status === 'pending').length || 0;
  const complianceRate = totalMMPs > 0 ? Math.round((approvedMMPs / totalMMPs) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Professional Tech Header */}
      <div className="relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-r from-red-500/5 via-orange-500/5 to-background p-3 shadow-sm">
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/30 shadow-sm">
              <Shield className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Compliance & Risk</h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Fraud Detection & Monitoring</p>
            </div>
          </div>
          <Badge 
            variant={complianceRate >= 80 ? "default" : "destructive"}
            className="gap-2 h-7 text-xs px-3 tabular-nums"
          >
            <FileCheck className="h-3 w-3" />
            {complianceRate}% Compliance
          </Badge>
        </div>
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-red-500/10 to-transparent rounded-full blur-2xl" />
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-green-500/20 bg-gradient-to-br from-green-500/10 via-green-500/5 to-background">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded bg-green-500/20 flex items-center justify-center">
                <FileCheck className="h-3 w-3 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                Approved
              </span>
            </div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400 tabular-nums">
              {approvedMMPs}
            </div>
            <Progress value={complianceRate} className="h-1 mt-2" />
          </CardContent>
        </Card>

        <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-background">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded bg-orange-500/20 flex items-center justify-center">
                <AlertTriangle className="h-3 w-3 text-orange-600 dark:text-orange-400" />
              </div>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                Pending
              </span>
            </div>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 tabular-nums">
              {pendingMMPs}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Awaiting approval
            </p>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-background">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center">
                <Shield className="h-3 w-3 text-primary" />
              </div>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                Total
              </span>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {totalMMPs}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              All monitoring plans
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Modern Tab System */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto p-0.5 bg-gradient-to-r from-muted/30 via-background to-muted/30 border border-border/30">
          <TabsTrigger 
            value="detection" 
            className="gap-1.5 px-3 py-2 data-[state=active]:bg-red-500/10 data-[state=active]:border-red-500/20 data-[state=active]:shadow-sm border border-transparent"
            data-testid="tab-detection"
          >
            <div className="w-5 h-5 rounded bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-3 w-3 text-red-600 dark:text-red-400" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide">Detection</span>
          </TabsTrigger>
          <TabsTrigger 
            value="prevention" 
            className="gap-1.5 px-3 py-2 data-[state=active]:bg-orange-500/10 data-[state=active]:border-orange-500/20 data-[state=active]:shadow-sm border border-transparent"
            data-testid="tab-prevention"
          >
            <div className="w-5 h-5 rounded bg-orange-500/10 flex items-center justify-center">
              <ShieldAlert className="h-3 w-3 text-orange-600 dark:text-orange-400" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide">Prevention</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="detection" className="mt-3">
          <FraudDetectionWidget />
        </TabsContent>

        <TabsContent value="prevention" className="mt-3">
          <FraudPreventionDashboardWidget />
        </TabsContent>
      </Tabs>
    </div>
  );
};
