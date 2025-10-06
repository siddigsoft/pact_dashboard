
import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Search } from 'lucide-react';

interface MMPSiteEntriesTableProps {
  siteEntries: any[];
  onViewSiteDetail: (site: any) => void;
}

const MMPSiteEntriesTable = ({ siteEntries, onViewSiteDetail }: MMPSiteEntriesTableProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  // Normalize a row from either MMP siteEntries (camelCase) or site_visits (snake_case)
  const normalizeSite = (site: any) => {
    // visit_data may be stored as JSON or stringified JSON
    const vd = site?.visit_data
      ? (typeof site.visit_data === 'string' ? (() => { try { return JSON.parse(site.visit_data); } catch { return undefined; } })() : site.visit_data)
      : undefined;

    const hubOffice = site.hubOffice || site.site_code || site.siteCode || vd?.hub || '';
    const state = site.state || site.site_name || site.stateName || site.siteName || '';
    const locality = site.locality || site.locality_name || site.localityName || '';

    // Site name may be in siteName (camel), or sometimes notes/name
    const siteName = site.siteName || site.notes || site.name || '';

    // CP name may have been stored in mainActivity previously
    const cpName = site.cpName || vd?.cpName || site.activity || site.cp || site.mainActivity || '';

    // Main activity may be in main_activity, mainActivity, or siteActivity
    const mainActivity = site.main_activity || site.mainActivity || site.siteActivity || '';

    // Activity at site sometimes came in DB 'activity', status or siteActivity
    const siteActivity = site.siteActivity || site.activity_at_site || site.activity || site.status || '';

    const visitType = site.visitType || vd?.visitType || '';

    const rawDate = site.due_date || site.visitDate || '';
    let visitDate = '';
    if (rawDate) {
      const d = new Date(rawDate);
      visitDate = isNaN(d.getTime()) ? String(rawDate) : d.toISOString().split('T')[0];
    }

    const comments = site.comments || site.notes || '';

    return { hubOffice, state, locality, siteName, cpName, mainActivity, siteActivity, visitType, visitDate, comments };
  };

  const filteredSites = searchQuery.trim() === ""
    ? siteEntries
    : siteEntries.filter(site => {
        const s = normalizeSite(site);
        const q = searchQuery.toLowerCase();
        return [s.hubOffice, s.state, s.locality, s.siteName, s.cpName, s.mainActivity, s.siteActivity, s.visitType, s.visitDate, s.comments]
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
                <TableHead>Main Activity</TableHead>
                <TableHead>Activity at Site</TableHead>
                <TableHead>Visit Type</TableHead>
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
                      <TableCell>{row.mainActivity}</TableCell>
                      <TableCell>{row.siteActivity}</TableCell>
                      <TableCell>{row.visitType}</TableCell>
                      <TableCell>{row.visitDate}</TableCell>
                      <TableCell>{row.comments}</TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => onViewSiteDetail(site)}
                          className="hover:bg-muted">
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={11} className="h-24 text-center">
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default MMPSiteEntriesTable;
