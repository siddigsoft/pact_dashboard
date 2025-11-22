import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from 'date-fns';
import { Clock, CheckCircle, UserCheck, DollarSign } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';

interface SiteVisit {
  id: string;
  siteName: string;
  locality: string;
  state: string;
  dueDate: string;
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
  projectName?: string;
  mmpDetails?: {
    mmpId: string;
    projectName: string;
  };
}

interface SiteVisitsOverviewProps {
  currentUserId?: string;
  isAdmin?: boolean;
}

const SiteVisitsOverview: React.FC<SiteVisitsOverviewProps> = ({ currentUserId, isAdmin = false }) => {
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fetchVisits = async () => {
      const { data, error } = await supabase
        .from('site_visits')
        .select('*')
        .order('due_date', { ascending: true });

      if (error) {
        setLoading(false);
        return;
      }

      const mappedVisits: SiteVisit[] = (data || []).map((visit: any) => ({
        id: visit.id,
        siteName: visit.site_name,
        locality: visit.locality || visit.location?.locality || '',
        state: visit.state || visit.location?.state || '',
        dueDate: visit.due_date,
        status: visit.status,
        assignedTo: visit.assigned_to,
        completedAt: visit.visit_data?.completedAt,
        rating: visit.visit_data?.rating,
        siteCode: visit.visit_data?.siteCode,
        activity: visit.visit_data?.activity,
        mainActivity: visit.visit_data?.mainActivity,
        priority: visit.visit_data?.priority || 'medium',
        fees: visit.visit_data?.fees || {},
        hub: visit.visit_data?.hub || visit.hub || '',
        cpName: visit.visit_data?.cpName || '',
        visitType: visit.visit_data?.visitType || '',
        visitTypeRaw: visit.visit_data?.visitTypeRaw || '',
      }));

      setSiteVisits(mappedVisits);
      setLoading(false);
    };

    fetchVisits();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="py-6 text-center">Loading...</CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const filteredVisits = isAdmin ? siteVisits : siteVisits.filter(visit => visit.assignedTo === currentUserId);
  
  const pendingVisits = filteredVisits.filter(visit => ['pending', 'permitVerified'].includes(visit.status));
  const assignedVisits = filteredVisits.filter(visit => ['assigned', 'inProgress'].includes(visit.status));
  const completedVisits = filteredVisits.filter(visit => visit.status === 'completed');
  const totalCount = filteredVisits.length;
  const completionRate = totalCount > 0 ? Math.round((completedVisits.length / totalCount) * 100) : 0;
  
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Visits</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingVisits.length}</div>
            <p className="text-xs text-muted-foreground">
              Visits awaiting assignment
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assigned Visits</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assignedVisits.length}</div>
            <p className="text-xs text-muted-foreground">
              Visits currently assigned
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Visits</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedVisits.length}</div>
            <p className="text-xs text-muted-foreground">
              Successfully completed visits
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionRate}%</div>
            <Progress value={completionRate} className="h-2" />
          </CardContent>
        </Card>
      </div>
      <div className="space-y-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4">Pending Visits</h2>
          {pendingVisits.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>MMP Name</TableHead>
                      <TableHead>Site Name</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingVisits.map((visit) => (
                      <TableRow key={visit.id}>
                        <TableCell>
                          <div className="text-xs font-medium text-primary">
                            {visit.mmpDetails?.mmpId || visit.projectName || 'N/A'}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="font-medium">{visit.siteName}</div>
                          <div className="text-xs text-muted-foreground">
                            Hub: {visit.hub || 'N/A'} • Type: {visit.visitTypeRaw || visit.visitType || 'N/A'}
                          </div>
                          {visit.cpName && (
                            <div className="text-xs text-muted-foreground">CP: {visit.cpName}</div>
                          )}
                        </TableCell>
                        <TableCell>{visit.locality}, {visit.state}</TableCell>
                        <TableCell>{format(new Date(visit.dueDate), 'MMM d, yyyy')}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {visit.status === 'pending' ? 'Pending' : 'Permit Verified'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/site-visits/${visit.id}`}>View</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter className="flex justify-end p-4">
                <Button asChild variant="ghost" size="sm">
                  <Link to="/site-visits?status=pending">View All</Link>
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No pending visits found</p>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4">Assigned Visits</h2>
          {assignedVisits.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>MMP Name</TableHead>
                      <TableHead>Site Name</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignedVisits.map((visit) => (
                      <TableRow key={visit.id}>
                        <TableCell>
                          <div className="text-xs font-medium text-primary">
                            {visit.mmpDetails?.mmpId || visit.projectName || 'N/A'}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="font-medium">{visit.siteName}</div>
                          <div className="text-xs text-muted-foreground">
                            Hub: {visit.hub || 'N/A'} • Type: {visit.visitTypeRaw || visit.visitType || 'N/A'}
                          </div>
                          {visit.cpName && (
                            <div className="text-xs text-muted-foreground">CP: {visit.cpName}</div>
                          )}
                        </TableCell>
                        <TableCell>{visit.locality}, {visit.state}</TableCell>
                        <TableCell>{format(new Date(visit.dueDate), 'MMM d, yyyy')}</TableCell>
                        <TableCell>
                          <Badge variant={visit.status === 'inProgress' ? 'default' : 'outline'}>
                            {visit.status === 'inProgress' ? 'In Progress' : 'Assigned'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm">
                            <Link to={`/site-visits/${visit.id}`}>
                              {visit.status === 'assigned' ? 'Start Visit' : 'Continue Visit'}
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter className="flex justify-end p-4">
                <Button asChild variant="ghost" size="sm">
                  <Link to="/site-visits?status=assigned">View All</Link>
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No assigned visits found</p>
              </CardContent>
            </Card>
          )}
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-4">Completed Visits</h2>
          {completedVisits.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>MMP Name</TableHead>
                      <TableHead>Site Name</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Completed Date</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedVisits.map((visit) => (
                      <TableRow key={visit.id}>
                        <TableCell>
                          <div className="text-xs font-medium text-primary">
                            {visit.mmpDetails?.mmpId || visit.projectName || 'N/A'}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="font-medium">{visit.siteName}</div>
                          <div className="text-xs text-muted-foreground">
                            Hub: {visit.hub || 'N/A'} • Type: {visit.visitTypeRaw || visit.visitType || 'N/A'}
                          </div>
                          {visit.cpName && (
                            <div className="text-xs text-muted-foreground">CP: {visit.cpName}</div>
                          )}
                        </TableCell>
                        <TableCell>{visit.locality}, {visit.state}</TableCell>
                        <TableCell>{visit.completedAt ? format(new Date(visit.completedAt), 'MMM d, yyyy') : 'N/A'}</TableCell>
                        <TableCell>
                          {visit.rating ? `${visit.rating}/5` : 'Not rated'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/site-visits/${visit.id}`}>
                              {isAdmin && !visit.rating ? 'Rate Visit' : 'View Details'}
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter className="flex justify-end p-4">
                <Button asChild variant="ghost" size="sm">
                  <Link to="/site-visits?status=completed">View All</Link>
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No completed visits found</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default SiteVisitsOverview;
