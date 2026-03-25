import React, { useMemo, useState, useEffect } from 'react';
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
import { Clock, CheckCircle, UserCheck, DollarSign, Loader2 } from "lucide-react";
import { useSiteVisitContext } from '@/features/siteVisit/context/SiteVisitContext';
import { SiteVisit } from '@/types/siteVisit';

interface SiteVisitsOverviewProps {
  currentUserId?: string;
  isAdmin?: boolean;
  siteVisits?: SiteVisit[];
}

const SiteVisitsOverview: React.FC<SiteVisitsOverviewProps> = ({ currentUserId, isAdmin = false, siteVisits: propSiteVisits }) => {
  const { siteVisits: contextSiteVisits, loading } = useSiteVisitContext();
  const siteVisits = propSiteVisits || contextSiteVisits;
  const ITEMS_PER_PAGE = 5;
  const [pendingPage, setPendingPage] = useState(1);
  const [assignedPage, setAssignedPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);

  const { pendingVisits, assignedVisits, completedVisits, totalCount, completionRate } = useMemo(() => {
    // If visits are passed as props, they are already role-filtered by parent zone.
    const hasPreFilteredVisits = !!propSiteVisits;
    const filteredVisits = hasPreFilteredVisits
      ? siteVisits
      : isAdmin
        ? siteVisits
        : siteVisits.filter(visit => visit.assignedTo === currentUserId);

    const pendingStatuses = new Set(['pending', 'permitverified', 'verified', 'dispatched']);
    const assignedStatuses = new Set(['assigned', 'inprogress', 'in progress', 'accepted']);

    const pending = filteredVisits.filter((visit) => pendingStatuses.has((visit.status || '').toLowerCase()));
    const assigned = filteredVisits.filter((visit) => assignedStatuses.has((visit.status || '').toLowerCase()));
    const completed = filteredVisits.filter((visit) => (visit.status || '').toLowerCase() === 'completed');
    const total = filteredVisits.length;
    const rate = total > 0 ? Math.round((completed.length / total) * 100) : 0;

    return {
      pendingVisits: pending,
      assignedVisits: assigned,
      completedVisits: completed,
      totalCount: total,
      completionRate: rate
    };
  }, [siteVisits, isAdmin, currentUserId, propSiteVisits]);

  useEffect(() => {
    setPendingPage(1);
    setAssignedPage(1);
    setCompletedPage(1);
  }, [siteVisits]);

  const pendingTotalPages = Math.max(1, Math.ceil(pendingVisits.length / ITEMS_PER_PAGE));
  const assignedTotalPages = Math.max(1, Math.ceil(assignedVisits.length / ITEMS_PER_PAGE));
  const completedTotalPages = Math.max(1, Math.ceil(completedVisits.length / ITEMS_PER_PAGE));

  const pagedPendingVisits = pendingVisits.slice((pendingPage - 1) * ITEMS_PER_PAGE, pendingPage * ITEMS_PER_PAGE);
  const pagedAssignedVisits = assignedVisits.slice((assignedPage - 1) * ITEMS_PER_PAGE, assignedPage * ITEMS_PER_PAGE);
  const pagedCompletedVisits = completedVisits.slice((completedPage - 1) * ITEMS_PER_PAGE, completedPage * ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading site visits...</span>
        </div>
      </div>
    );
  }
  
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
                    {pagedPendingVisits.map((visit) => (
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
              <CardFooter className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pendingPage === 1}
                    onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {pendingPage} of {pendingTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pendingPage === pendingTotalPages}
                    onClick={() => setPendingPage((p) => Math.min(pendingTotalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
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
                    {pagedAssignedVisits.map((visit) => (
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
              <CardFooter className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={assignedPage === 1}
                    onClick={() => setAssignedPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {assignedPage} of {assignedTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={assignedPage === assignedTotalPages}
                    onClick={() => setAssignedPage((p) => Math.min(assignedTotalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
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
                    {pagedCompletedVisits.map((visit) => (
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
              <CardFooter className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={completedPage === 1}
                    onClick={() => setCompletedPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {completedPage} of {completedTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={completedPage === completedTotalPages}
                    onClick={() => setCompletedPage((p) => Math.min(completedTotalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
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
