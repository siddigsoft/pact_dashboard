import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, AlertTriangle, FileCheck, ShieldAlert } from 'lucide-react';
import FraudDetectionWidget from '../FraudDetectionWidget';
import FraudPreventionDashboardWidget from '../FraudPreventionDashboardWidget';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMMP } from '@/context/mmp/MMPContext';
import { Progress } from '@/components/ui/progress';
import { ZoneHeader } from '../ZoneHeader';

export const ComplianceZone: React.FC = () => {
  const [activeTab, setActiveTab] = useState('detection');
  const { mmpFiles } = useMMP();

  const totalMMPs = mmpFiles?.length || 0;
  const approvedMMPs = mmpFiles?.filter(m => m.status === 'approved').length || 0;
  const pendingMMPs = mmpFiles?.filter(m => m.status === 'pending').length || 0;
  const complianceRate = totalMMPs > 0 ? Math.round((approvedMMPs / totalMMPs) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Enterprise Header */}
      <ZoneHeader
        title="Compliance & Risk"
        subtitle="Fraud detection and monitoring"
        color="red"
      >
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Compliance Rate</p>
          <p className={`text-2xl font-bold tabular-nums ${complianceRate >= 80 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {complianceRate}%
          </p>
        </div>
      </ZoneHeader>

      {/* Quick Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-t-2 border-t-green-500">
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

        <Card className="border-t-2 border-t-orange-500">
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

        <Card className="border-t-2 border-t-blue-500">
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

      {/* Professional Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="detection" data-testid="tab-detection">
            Detection
          </TabsTrigger>
          <TabsTrigger value="prevention" data-testid="tab-prevention">
            Prevention
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
