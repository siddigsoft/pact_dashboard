import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { format } from 'date-fns';

interface SiteVisit {
  id: string;
  siteName: string;
  locality: string;
  state: string;
  dueDate?: string;
  status: string;
  assignedTo?: string;
  completedAt?: string;
  rating?: number;
  siteCode?: string;
  activity?: string;
  mainActivity?: string;
  priority?: string;
  fees?: { total?: number };
  hub?: string;
  cpName?: string;
  visitType?: string;
  visitTypeRaw?: string;
  // optional region (some records may include this or place it under location)
  region?: string;
  location?: { region?: string };
}

export const SiteVisitsSummaryCard: React.FC<{ showOngoingBreakdown?: boolean }> = ({ showOngoingBreakdown }) => {
  const { siteVisits } = useSiteVisitContext();
  const [hub, setHub] = useState('');
  const [region, setRegion] = useState('');
  const [date, setDate] = useState('');

  let filtered = (siteVisits || []) as SiteVisit[];

  if (hub) filtered = filtered.filter(v => String(v.hub || '').toLowerCase() === hub.toLowerCase());
  if (region) filtered = filtered.filter(v => String(v.region || v.location?.region || '').toLowerCase() === region.toLowerCase());
  if (date) filtered = filtered.filter(v => (v.dueDate || '').startsWith(date));

  const now = new Date();
  const completed = filtered.filter(v => v.status === 'completed');
  const ongoing = filtered.filter(v => ['assigned', 'inProgress'].includes(v.status));
  // scheduled = future dueDate and not completed
  const scheduled = filtered.filter(v => {
    if (!v.dueDate) return false;
    const d = new Date(v.dueDate);
    return !isNaN(d.getTime()) && d.getTime() > now.getTime() && v.status !== 'completed';
  });

  const unassigned = filtered.filter(v => !v.assignedTo && ['pending', 'permitVerified', 'assigned'].includes(v.status));
  const assigned = filtered.filter(v => !!v.assignedTo && ['assigned', 'inProgress'].includes(v.status));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Site Visits Summary</CardTitle>
      </CardHeader>

      <CardContent>
        <div className="flex gap-2 mb-2">
          <Select value={hub} onValueChange={setHub}>
            <SelectTrigger className="w-32">Hub</SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="KRT">KRT</SelectItem>
              <SelectItem value="ELF">ELF</SelectItem>
            </SelectContent>
          </Select>

          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger className="w-40">Region</SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="Central">Central</SelectItem>
              <SelectItem value="East">East</SelectItem>
              <SelectItem value="Khartoum">Khartoum</SelectItem>
            </SelectContent>
          </Select>

          <Select value={date} onValueChange={setDate}>
            <SelectTrigger className="w-40">Month</SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {[0,1,2].map(i => {
                const d = new Date(); d.setMonth(d.getMonth() - i);
                return <SelectItem key={i} value={format(d, 'yyyy-MM')}>{format(d, 'MMMM yyyy')}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-6 mt-2">
          <div>
            <div className="font-bold text-lg">{filtered.length}</div>
            <div className="text-xs text-muted-foreground">Total Visits</div>
          </div>

          <div>
            <div className="font-bold text-green-700">{completed.length}</div>
            <div className="text-xs text-green-700">Completed</div>
          </div>

          <div>
            <div className="font-bold text-blue-700">{ongoing.length}</div>
            <div className="text-xs text-blue-700">Ongoing</div>
          </div>

          <div>
            <div className="font-bold text-amber-700">{scheduled.length}</div>
            <div className="text-xs text-amber-700">Scheduled</div>
          </div>

          {showOngoingBreakdown && (
            <>
              <div>
                <div className="font-bold">{assigned.length}</div>
                <div className="text-xs">Assigned</div>
              </div>
              <div>
                <div className="font-bold">{unassigned.length}</div>
                <div className="text-xs">Unassigned</div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
