import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import MMPSiteEntriesTable from '@/components/mmp/MMPSiteEntriesTable';
import MonitoringPlanSummary from '@/components/mmp/MonitoringPlanSummary';
import { useMMP } from '@/context/mmp/MMPContext';

const MonitoringPlanPage: React.FC = () => {
  const { mmpFiles, loading, error } = useMMP();

  const allSiteEntries = React.useMemo(() => {
    const list = (mmpFiles || []).flatMap((m) => {
      const entries = Array.isArray(m.siteEntries) ? m.siteEntries : [];
      return entries.map((e: any, idx: number) => ({
        ...e,
        id: e?.id || `${m.id}-${idx}`,
        mmpId: m.id,
        projectName: m.projectName || m.name || '',
      }));
    });
    return list;
  }, [mmpFiles]);

  const pickMostFrequent = (vals: string[]) => {
    const counts = new Map<string, number>();
    vals.forEach((v) => {
      const s = (v || '').toString().trim();
      if (!s) return;
      counts.set(s, (counts.get(s) || 0) + 1);
    });
    let best = '';
    let max = 0;
    for (const [k, v] of counts) {
      if (v > max) { max = v; best = k; }
    }
    return best || '—';
  };

  const summaryData = React.useMemo(() => {
    const total = allSiteEntries.length;
    const localities = allSiteEntries.map((e: any) => e.locality || e.locality_name || '');
    const states = allSiteEntries.map((e: any) => e.state || e.state_name || '');
    const hubs = allSiteEntries.map((e: any) => e.hubOffice || e.hub_office || '');
    const modalities = allSiteEntries.map((e: any) => e.siteActivity || e.activity_at_site || e.activity || '');
    const monitoringEntities = allSiteEntries.map((e: any) => e.monitoringBy || e.monitoring_by || '');
    const surveyTools = allSiteEntries.map((e: any) => e.surveyTool || e.survey_tool || '');
    const projects = (mmpFiles || []).map((m: any) => m.projectName || m.name || '');

    const kulbusSites = localities.filter((l) => (l || '').toString().toLowerCase() === 'kulbus').length;
    const geneinaSites = localities.filter((l) => (l || '').toString().toLowerCase() === 'geneina').length;

    return {
      totalSites: total,
      kulbusSites,
      geneinaSites,
      hubOffice: pickMostFrequent(hubs),
      state: pickMostFrequent(states),
      project: pickMostFrequent(projects) || '—',
      modality: pickMostFrequent(modalities) || '—',
      monitoringEntity: pickMostFrequent(monitoringEntities) || 'PACT',
      surveyTool: pickMostFrequent(surveyTools) || 'PDM',
    };
  }, [allSiteEntries, mmpFiles]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Monitoring Plan</h1>
              <p className="text-muted-foreground">
                Revised October-2025 monitoring plan for {summaryData.hubOffice} {summaryData.monitoringEntity}
              </p>
            </div>
          </div>

          {/* Summary Cards */}
          {error ? (
            <div className="text-sm text-red-600">Failed to load monitoring plan data.</div>
          ) : (
            <MonitoringPlanSummary data={summaryData} />
          )}

          {/* Site Entries Table */}
          <Card>
            <CardHeader>
              <CardTitle>Site Entries</CardTitle>
              <p className="text-sm text-muted-foreground">
                All monitoring sites for the {summaryData.project} project with CBT-Value Voucher modality
              </p>
            </CardHeader>
            <CardContent>
              <MMPSiteEntriesTable 
                siteEntries={allSiteEntries} 
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
                  <strong>Note:</strong> Those locations are for {summaryData.project} project and the GFA modality used was (CBT-Value Voucher)
                </p>
              </div>
            </CardContent>
          </Card>
    </div>
  );
};

export default MonitoringPlanPage;
