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
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Modern Tech Header */}
      <div className="relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-r from-red-500/5 via-orange-500/5 to-background p-4 shadow-sm">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-red-500/10 border border-red-500/20 flex-shrink-0">
              <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Compliance & Risk</h2>
              <p className="text-xs sm:text-sm text-muted-foreground uppercase tracking-wide">Fraud detection and compliance monitoring</p>
            </div>
          </div>
          <Badge 
            variant={complianceRate >= 80 ? "default" : "destructive"}
            className="gap-2 h-8 px-3 text-xs self-start"
          >
            <FileCheck className="h-3 w-3" />
            {complianceRate}% Compliance
          </Badge>
        </div>
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Approved MMPs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {approvedMMPs}
            </div>
            <Progress value={complianceRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {pendingMMPs}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Awaiting approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total MMPs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalMMPs}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              All monitoring plans
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto h-auto p-1 bg-muted/30">
          <TabsTrigger value="detection" className="gap-2 min-h-[44px] sm:min-h-[40px] px-3 py-2 sm:py-1.5">
            <AlertTriangle className="h-4 w-4" />
            Detection
          </TabsTrigger>
          <TabsTrigger value="prevention" className="gap-2 min-h-[44px] sm:min-h-[40px] px-3 py-2 sm:py-1.5">
            <ShieldAlert className="h-4 w-4" />
            Prevention
          </TabsTrigger>
        </TabsList>

        <TabsContent value="detection" className="mt-4">
          <FraudDetectionWidget />
        </TabsContent>

        <TabsContent value="prevention" className="mt-4">
          <FraudPreventionDashboardWidget />
        </TabsContent>
      </Tabs>
    </div>
  );
};
