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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Compliance & Risk
          </h2>
          <p className="text-sm text-muted-foreground">Fraud detection and compliance monitoring</p>
        </div>
        <Badge 
          variant={complianceRate >= 80 ? "default" : "destructive"}
          className="gap-2"
        >
          <FileCheck className="h-3 w-3" />
          {complianceRate}% Compliance
        </Badge>
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="detection" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Detection
          </TabsTrigger>
          <TabsTrigger value="prevention" className="gap-2">
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
