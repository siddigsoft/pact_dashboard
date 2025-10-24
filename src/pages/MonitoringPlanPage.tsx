import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import MMPSiteEntriesTable from '@/components/mmp/MMPSiteEntriesTable';
import MonitoringPlanSummary from '@/components/mmp/MonitoringPlanSummary';
import { monitoringPlanSites, monitoringPlanSummary } from '@/data/monitoringPlanData';

const MonitoringPlanPage: React.FC = () => {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monitoring Plan</h1>
          <p className="text-muted-foreground">
            Revised October-2025 monitoring plan for Farchana Hub TPM-PACT
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <MonitoringPlanSummary data={monitoringPlanSummary} />

      {/* Site Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle>Site Entries</CardTitle>
          <p className="text-sm text-muted-foreground">
            All monitoring sites for the SANAD project with CBT-Value Voucher modality
          </p>
        </CardHeader>
        <CardContent>
          <MMPSiteEntriesTable 
            siteEntries={monitoringPlanSites} 
          />
        </CardContent>
      </Card>

      {/* Project Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Project Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-medium">
              <strong>Note:</strong> Those locations are for SANAD project and the GFA modality used was (CBT-Value Voucher)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MonitoringPlanPage;
