
import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Eye } from 'lucide-react';

interface MMPSiteEntriesTableProps {
  siteEntries: any[];
  onViewSiteDetail?: (site: any) => void;
}

const MMPSiteEntriesTable = ({ siteEntries, onViewSiteDetail }: MMPSiteEntriesTableProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<any | null>(null);

  // Normalize a row from either MMP siteEntries (camelCase) or site_visits (snake_case)
  const normalizeSite = (site: any) => {
    // visit_data may be stored as JSON or stringified JSON
    const vd = site?.visit_data
      ? (typeof site.visit_data === 'string' ? (() => { try { return JSON.parse(site.visit_data); } catch { return undefined; } })() : site.visit_data)
      : undefined;

    // additionalData may contain the actual uploaded data
    const ad = site?.additionalData || {};

    // Monitoring Plan Structure Fields - check multiple sources including additionalData
    const hubOffice = site.hubOffice || site.hub_office || vd?.hubOffice || ad['Hub Office'] || ad['Hub Office:'] || '—';
    const state = site.state || site.state_name || vd?.state || ad['State'] || ad['State:'] || '—';
    const locality = site.locality || site.locality_name || vd?.locality || ad['Locality'] || ad['Locality:'] || '—';
    const siteName = site.siteName || site.site_name || vd?.siteName || ad['Site Name'] || ad['Site Name:'] || '—';
    const cpName = site.cpName || site.cp_name || vd?.cpName || ad['CP Name'] || ad['CP name'] || ad['CP Name:'] || '—';
    const siteActivity = site.siteActivity || site.activity_at_site || site.activity || vd?.siteActivity || ad['Activity at the site'] || ad['Activity at Site'] || ad['Activity at the site:'] || '—';
    const monitoringBy = site.monitoringBy || site.monitoring_by || vd?.monitoringBy || ad['monitoring by'] || ad['monitoring by:'] || ad['Monitoring By'] || '—';
    const surveyTool = site.surveyTool || site.survey_tool || vd?.surveyTool || ad['Survey under Master tool'] || ad['Survey under Master tool:'] || ad['Survey Tool'] || '—';
    const useMarketDiversion = site.useMarketDiversion || site.use_market_diversion || vd?.useMarketDiversion || 
      (ad['Use Market Diversion Monitoring'] === 'Yes' || ad['Use Market Diversion Monitoring'] === 'true' || ad['Use Market Diversion Monitoring'] === '1') || false;
    const useWarehouseMonitoring = site.useWarehouseMonitoring || site.use_warehouse_monitoring || vd?.useWarehouseMonitoring || 
      (ad['Use Warehouse Monitoring'] === 'Yes' || ad['Use Warehouse Monitoring'] === 'true' || ad['Use Warehouse Monitoring'] === '1') || false;

    // Additional fields
    const mainActivity = site.main_activity || site.mainActivity || vd?.mainActivity || '—';
    const visitType = site.visitType || vd?.visitType || '—';

    const rawDate = site.due_date || site.visitDate || '';
    let visitDate = '—';
    if (rawDate) {
      const d = new Date(rawDate);
      visitDate = isNaN(d.getTime()) ? String(rawDate) : d.toISOString().split('T')[0];
    }

    const comments = site.comments || site.notes || '—';

    return { 
      hubOffice, state, locality, siteName, cpName, siteActivity, 
      monitoringBy, surveyTool, useMarketDiversion, useWarehouseMonitoring,
      mainActivity, visitType, visitDate, comments 
    };
  };

  const handleView = (site: any) => {
    if (onViewSiteDetail) {
      onViewSiteDetail(site);
      return;
    }
    setSelectedSite(site);
    setDetailOpen(true);
  };

  const filteredSites = searchQuery.trim() === ""
    ? siteEntries
    : siteEntries.filter(site => {
        const s = normalizeSite(site);
        const q = searchQuery.toLowerCase();
        return [s.hubOffice, s.state, s.locality, s.siteName, s.cpName, s.siteActivity, s.monitoringBy, s.surveyTool, s.visitDate, s.comments]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>MMP Site Entries</CardTitle>
            <CardDescription>
              Total: {siteEntries.length} sites | 
              Visited: {siteEntries.filter(site => site.siteVisited).length} | 
              Pending: {siteEntries.filter(site => !site.siteVisited).length}
            </CardDescription>
          </div>
          <div className="w-full sm:w-auto">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search sites..."
                className="pl-8 w-full sm:w-[300px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Hub Office</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Locality</TableHead>
                <TableHead>Site Name</TableHead>
                <TableHead>CP Name</TableHead>
                <TableHead>Activity at Site</TableHead>
                <TableHead>Monitoring By</TableHead>
                <TableHead>Survey Tool</TableHead>
                <TableHead>Market Diversion</TableHead>
                <TableHead>Warehouse Monitoring</TableHead>
                <TableHead>Visit Date</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSites.length > 0 ? (
                filteredSites.map((site) => {
                  const row = normalizeSite(site);
                  return (
                    <TableRow key={site.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs">{row.hubOffice}</TableCell>
                      <TableCell>{row.state}</TableCell>
                      <TableCell>{row.locality}</TableCell>
                      <TableCell>{row.siteName}</TableCell>
                      <TableCell>{row.cpName}</TableCell>
                      <TableCell>{row.siteActivity}</TableCell>
                      <TableCell>{row.monitoringBy}</TableCell>
                      <TableCell>{row.surveyTool}</TableCell>
                      <TableCell>{row.useMarketDiversion ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{row.useWarehouseMonitoring ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{row.visitDate}</TableCell>
                      <TableCell>{row.comments}</TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleView(site)}
                          className="hover:bg-muted inline-flex items-center gap-1">
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={13} className="h-24 text-center">
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Local fallback dialog for site detail view */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{(selectedSite && normalizeSite(selectedSite).siteName) || 'Site Details'}</DialogTitle>
          </DialogHeader>
          {selectedSite && (() => {
            const row = normalizeSite(selectedSite);
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Hub Office</p>
                  <p className="font-medium">{row.hubOffice || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">State</p>
                  <p className="font-medium">{row.state || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Locality</p>
                  <p className="font-medium">{row.locality || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Site Name</p>
                  <p className="font-medium">{row.siteName || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">CP Name</p>
                  <p className="font-medium">{row.cpName || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Activity at Site</p>
                  <p className="font-medium">{row.siteActivity || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monitoring By</p>
                  <p className="font-medium">{row.monitoringBy || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Survey Tool</p>
                  <p className="font-medium">{row.surveyTool || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Market Diversion</p>
                  <p className="font-medium">{row.useMarketDiversion ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Warehouse Monitoring</p>
                  <p className="font-medium">{row.useWarehouseMonitoring ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Visit Date</p>
                  <p className="font-medium">{row.visitDate || '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-sm text-muted-foreground">Comments</p>
                  <p className="font-medium">{row.comments || '—'}</p>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default MMPSiteEntriesTable;

