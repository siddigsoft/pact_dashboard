import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Search, ArrowLeft, CheckCircle, Download, 
  FileSpreadsheet as FileSpreadsheetIcon, Upload, Calendar, Wrench, AlertTriangle,
  Archive, Trash2, History, Shield, Eye, RefreshCw, FileCheck, Edit, Send,
  MapPin, Users, Clock, BarChart3, FileText, RotateCcw
} from "lucide-react";
import { format } from "date-fns";
import { useAppContext } from "@/context/AppContext";
import { useMMP } from "@/context/mmp/MMPContext";
import { MMPFile } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import AuditLogViewer from "@/components/AuditLogViewer";
import ComplianceTracker from "@/components/ComplianceTracker";
import { MMPStageIndicator } from "@/components/MMPStageIndicator";
import MMPVersionHistory from "@/components/MMPVersionHistory";
import { MMPInfoCard } from "@/components/site-visit/MMPInfoCard";
import MMPSiteInformation from "@/components/MMPSiteInformation";
import { MMPStatusBadge } from "@/components/mmp/MMPStatusBadge";
import { CycleProgressBar } from "@/components/mmp/CycleProgressBar";

// New components
import MMPOverviewCard from "@/components/mmp/MMPOverviewCard";
import MMPSiteEntriesTable from "@/components/mmp/MMPSiteEntriesTable";
import MMPFileManagement from "@/components/mmp/MMPFileManagement";
import RecallHistory from "@/components/mmp/RecallHistory";
import { useAuthorization } from "@/hooks/use-authorization";
import ForwardToFOMDialog from "@/components/mmp/ForwardToFOMDialog";
import { ReclaimFromCoordinatorDialog } from "@/components/mmp/ReclaimFromCoordinatorDialog";
import ForwardToCoordinatorsDialog from "@/components/mmp/ForwardToCoordinatorsDialog";
import CoordinatorSummaryCard from "@/components/mmp/CoordinatorSummaryCard";
import WorkflowTrackerTab from "@/components/mmp/WorkflowTrackerTab";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LinkedProjectsBadge } from "@/components/project/LinkedProjectsBadge";

const MMPDetailView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser, archiveMMP, deleteMMPFile, approveMMP } = useAppContext();
  const { resetMMP, getMmpById, updateMMP, loading: mmpContextLoading } = useMMP();
  const { checkPermission, hasAnyRole } = useAuthorization();
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedSite, setSelectedSite] = useState<any>(null);
  const [siteDetailOpen, setSiteDetailOpen] = useState(false);
  const [siteEntriesDB, setSiteEntriesDB] = useState<any[]>([]);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [reclaimDialogOpen, setReclaimDialogOpen] = useState(false);
  const [forwardedLocal, setForwardedLocal] = useState(false);
  const [forwardedCount, setForwardedCount] = useState<number | null>(null);
  const [forwardToCoordinatorsOpen, setForwardToCoordinatorsOpen] = useState(false);
  
  const mmpFile = id ? getMmpById(id) : undefined;
  
  useEffect(() => {
    // If mmpFile is found, immediately stop loading
    if (mmpFile) {
      setLoading(false);
      setNotFound(false);
      return;
    }

    // If the MMP context is still fetching data from the server, wait — don't
    // declare "not found" while the list hasn't arrived yet (auth-timing lag).
    if (mmpContextLoading) {
      setLoading(true);
      return;
    }
    
    // Context is done loading and we still have no MMP — give a short grace
    // period for any in-flight state updates, then show the error.
    const timer = setTimeout(() => {
      if (!mmpFile && id) {
        setNotFound(true);
        toast({
          title: "MMP File Not Found",
          description: (
            <div className="space-y-2">
              <p>No MMP found with ID: {id}</p>
              <p>Try accessing another MMP from the <Link to="/mmp" className="text-blue-500 underline">MMP List</Link></p>
            </div>
          ),
          variant: "destructive",
        });
      }
      setLoading(false);
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [id, mmpFile, mmpContextLoading, toast]);

  const isAdmin = hasAnyRole(['admin', 'superAdmin', 'superadmin', 'super_admin']);
  const isFOM = hasAnyRole(['fom']);
  const isCoordinator = hasAnyRole(['coordinator']);
  const isSupervisor = hasAnyRole(['supervisor', 'hubsupervisor']);
  const isDataTeam = hasAnyRole(['DataTeam', 'dataTeam', 'data_team', 'Data Team']);
  const canRead = checkPermission('mmp', 'read') || isAdmin || isFOM || isCoordinator || isSupervisor || isDataTeam;
  const canEdit = (checkPermission('mmp', 'update') || isAdmin || isCoordinator || isSupervisor) ? true : false;
  const canDelete = (checkPermission('mmp', 'delete') || isAdmin) ? true : false;
  const canArchive = (checkPermission('mmp', 'archive') || isAdmin) ? true : false;
  const canApprove = (checkPermission('mmp', 'approve') || isAdmin) && mmpFile?.status === 'pending';
  const canForward = hasAnyRole(['admin', 'ict', 'superAdmin', 'superadmin', 'super_admin']);

  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  // Move useMemo hooks here to ensure consistent hook order
  const isForwarded = useMemo(() => {
    if (forwardedLocal) return true;
    const workflow = (mmpFile as any)?.workflow || {};
    const ids = workflow.forwardedToFomIds;
    const hasForwardedIds = Array.isArray(ids) && ids.length > 0;
    return hasForwardedIds;
  }, [forwardedLocal, mmpFile]);
  
  const wasRecalled = useMemo(() => {
    const workflow = (mmpFile as any)?.workflow || {};
    return !!workflow.recalledAt;
  }, [mmpFile]);

  // Prefer entries from context; if missing, fetch from mmp_site_entries
  const siteEntries = (mmpFile?.siteEntries && Array.isArray(mmpFile.siteEntries) && mmpFile.siteEntries.length > 0)
    ? mmpFile.siteEntries
    : siteEntriesDB;

  const mmpFileWithEntries = useMemo(() => {
    if (!mmpFile) return null;
    return { ...mmpFile, siteEntries };
  }, [mmpFile, siteEntries]);

  // State distribution useMemo - must be before early returns
  const stateDistribution = useMemo(() => {
    const groups: Record<string, number> = {};
    siteEntries.forEach(site => {
      const state = site.state || site.state_name || 'Unknown';
      groups[state] = (groups[state] || 0) + 1;
    });
    return Object.entries(groups).sort((a, b) => b[1] - a[1]);
  }, [siteEntries]);

  const returnedSitesInfo = useMemo(() => {
    const returnedSites = siteEntries.filter((s: any) => {
      const st = (s.status || '').toLowerCase();
      return st === 'returned_to_fom' || st === 'returned' || st === 'rejected';
    });
    return returnedSites;
  }, [siteEntries]);

  const coveredSitesCount = useMemo(() => {
    return siteEntries.filter((s: any) => {
      const st = (s.status || '').toLowerCase();
      return st === 'completed' || st === 'visited' || st === 'verified' || st === 'approved';
    }).length;
  }, [siteEntries]);

  const daysToDeadline = useMemo(() => {
    const deadline = (mmpFile as any)?.cycle_close_deadline || (mmpFile as any)?.cycleCloseDeadline;
    if (!deadline) return null;
    const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff;
  }, [mmpFile]);

  const recallInfo = useMemo(() => {
    const workflow = (mmpFile as any)?.workflow || {};
    const history = (workflow.recallHistory as any[]) || [];
    const lastRecall = history.length > 0 ? history[history.length - 1] : null;
    return {
      wasRecalled,
      recalledAt: workflow.recalledAt,
      recalledBy: workflow.recalledBy,
      reason: lastRecall?.reason || lastRecall?.comments || workflow.recallReason || '',
      history
    };
  }, [mmpFile, wasRecalled]);

  useEffect(() => {
    const loadSiteEntries = async () => {
      if (!id) return;
      if (mmpFile?.siteEntries && mmpFile.siteEntries.length > 0) {
        setSiteEntriesDB([]);
        return;
      }
      const { data, error } = await supabase
        .from('mmp_site_entries')
        .select('*')
        .eq('mmp_file_id', id);
      if (error) {
        console.error('Failed to load mmp_site_entries:', error);
        return;
      }
      setSiteEntriesDB(data || []);
    };
    loadSiteEntries();
  }, [id, mmpFile?.siteEntries?.length]);

  // EARLY RETURNS - After all hooks
  if (!canRead) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to view this MMP.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate('/mmp')} className="w-full">
              Back to MMP List
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleArchive = async () => {
    if (id) {
      try {
        await archiveMMP(id, currentUser?.username || 'Unknown User');
        toast({ 
          title: "MMP File Archived",
          description: "The MMP file has been archived successfully.",
        });
        navigate("/mmp");
      } catch (error) {
        console.error("Failed to archive MMP:", error);
        toast({
          title: "Archive Failed",
          description: "There was a problem archiving the MMP file.",
          variant: "destructive"
        });
      }
    }
  };
  
  const handleDelete = async () => {
    if (id) {
      try {
        const ok = await deleteMMPFile(id);
        if (ok) {
          toast({ 
            title: "MMP File Deleted",
            description: "The MMP file has been permanently deleted.",
          });
          navigate("/mmp");
        } else {
          toast({
            title: "Deletion Failed",
            description: "Could not delete from database. Please check permissions/RLS and try again.",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error("Failed to delete MMP:", error);
        toast({
          title: "Deletion Failed",
          description: "Unexpected error deleting the MMP file.",
          variant: "destructive"
        });
      }
    }
  };
  
  const exportToExcel = () => {
    try {
      const exportData = siteEntries.map((site: any) => {
        const ad = site.additional_data || {};
        return {
          'Site Code': site.site_code || site.siteCode || '',
          'Site Name': site.site_name || site.siteName || '',
          'State': site.state || '',
          'Locality': site.locality || '',
          'Hub Office': site.hub_office || site.hubOffice || '',
          'Status': (site.status || '').replace(/_/g, ' '),
          'Visit Type': site.visit_type || site.visitType || '',
          'Main Activity': site.main_activity || site.mainActivity || '',
          'Coordinator': ad.assigned_to_name || site.coordinator_name || '',
          'Verified By': site.verified_by || '',
          'Verified At': site.verified_at ? format(new Date(site.verified_at), 'MMM d, yyyy HH:mm') : '',
          'Verification Notes': site.verification_notes || '',
          'Rejected By': site.rejected_by || ad.rejected_by || '',
          'Rejected At': site.rejected_at || ad.rejected_at ? format(new Date(site.rejected_at || ad.rejected_at), 'MMM d, yyyy HH:mm') : '',
          'Rejection Comments': ad.rejection_comments || site.rejection_comments || '',
          'Return Reason': ad.return_reason || ad.rejection_reason || '',
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      const colWidths = Object.keys(exportData[0] || {}).map(key => ({ wch: Math.max(key.length, 15) }));
      ws['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(wb, ws, 'Sites');

      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blobData = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `${mmpFile?.name || 'MMP'}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      saveAs(blobData, fileName);
      toast({ description: "Excel file downloaded successfully" });
    } catch (error) {
      console.error('Excel export error:', error);
      toast({ description: "Failed to export Excel file", variant: "destructive" });
    }
  };

  const exportToPdf = () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(16);
      doc.text(mmpFile?.name || 'MMP Report', 14, 15);
      doc.setFontSize(10);
      doc.text(`MMP ID: ${mmpFile?.mmpId || id}`, 14, 22);
      doc.text(`Status: ${(mmpFile?.status || '').replace(/_/g, ' ')}`, 14, 28);
      doc.text(`Total Sites: ${siteEntries.length}`, 14, 34);
      doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`, 14, 40);

      const tableData = siteEntries.map((site: any) => {
        const ad = site.additional_data || {};
        return [
          site.site_code || site.siteCode || '',
          site.site_name || site.siteName || '',
          site.state || '',
          site.locality || '',
          (site.status || '').replace(/_/g, ' '),
          ad.assigned_to_name || site.coordinator_name || '',
          site.verified_by || '',
          site.verified_at ? format(new Date(site.verified_at), 'MMM d') : '',
          site.verification_notes || ad.rejection_comments || ad.return_reason || '',
        ];
      });

      autoTable(doc, {
        startY: 46,
        head: [['Code', 'Site Name', 'State', 'Locality', 'Status', 'Coordinator', 'Verified By', 'Date', 'Notes']],
        body: tableData,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [59, 130, 246], fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });

      const fileName = `${mmpFile?.name || 'MMP'}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      doc.save(fileName);
      toast({ description: "PDF file downloaded successfully" });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({ description: "Failed to export PDF file", variant: "destructive" });
    }
  };

  const handleReset = async () => {
    if (id) {
      const success = await resetMMP(id);
      if (success) {
        setRefreshKey(prev => prev + 1);
        toast({
          title: "Reset Successful",
          description: "The MMP approval status has been reset successfully.",
        });
      } else {
        toast({
          title: "Reset Failed",
          description: "Failed to reset MMP approval status",
          variant: "destructive",
        });
      }
    }
  };

  const handleApprove = async () => {
    if (id && currentUser) {
      try {
        await approveMMP(id, currentUser.username || 'Unknown User');
        setRefreshKey(prev => prev + 1);
        toast({
          title: "MMP Approved",
          description: "The MMP file has been approved successfully.",
        });
      } catch (error) {
        console.error("Failed to approve MMP:", error);
        toast({
          title: "Approval Failed",
          description: "There was a problem approving the MMP file.",
          variant: "destructive"
        });
      }
    }
  };

  const handleProceedToVerification = () => {
    if (mmpFile) {
      navigate(`/mmp/${mmpFile.id}/verification`);
    } else {
      toast({
        title: "Cannot Proceed",
        description: "MMP file not found or access denied.",
        variant: "destructive"
      });
    }
  };

  const handleEditMMP = () => {
    if (mmpFile) {
      navigate(`/mmp/${mmpFile.id}/edit`);
    } else {
      toast({
        title: "Cannot Edit",
        description: "MMP file not found or access denied.",
        variant: "destructive"
      });
    }
  };

  const handleViewSiteDetail = (site: any) => {
    setSelectedSite(site);
    setSiteDetailOpen(true);
  };

  const handleForwardToCoordinators = () => {
    setForwardToCoordinatorsOpen(true);
  };

  const handleMarkAsVerified = async () => {
    if (!mmpFile || !currentUser) return;
    
    try {
      // Update MMP workflow to indicate coordinator verification is complete
      await updateMMP(mmpFile.id, { 
        workflow: { 
          ...mmpFile.workflow, 
          coordinatorVerified: true,
          coordinatorVerifiedAt: new Date().toISOString(),
          coordinatorVerifiedBy: currentUser.username || currentUser.fullName || currentUser.email || 'Unknown'
        } 
      });
      
      toast({
        title: "MMP Verified",
        description: "MMP has been marked as verified by coordinator.",
      });
      
      // Navigate back to MMP list
      navigate('/mmp');
    } catch (error) {
      console.error("Failed to mark as verified:", error);
      toast({
        title: "Verification Failed",
        description: "There was a problem marking the MMP as verified.",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <div className="relative w-16 h-16 mx-auto">
          <div className="absolute inset-0 rounded-full border-4 border-blue-200 animate-[spin_3s_linear_infinite]"></div>
          <div className="absolute inset-[6px] rounded-full border-4 border-t-blue-500 animate-[spin_2s_linear_infinite]"></div>
        </div>
        <p className="mt-4 text-muted-foreground">Loading MMP file...</p>
      </div>
    );
  }

  if (!mmpFile || notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <FileSpreadsheet className="h-16 w-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-semibold mb-2">MMP File Not Found</h2>
        <p className="text-muted-foreground mb-4">The requested MMP file could not be found. ID: {id}</p>
        <Button asChild>
          <Link to="/mmp">Back to MMP List</Link>
        </Button>
      </div>
    );
  }

  const displayDate = mmpFile?.approvedAt || mmpFile?.uploadedAt;

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6 animate-fade-in" key={refreshKey}>
      {/* Professional Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/mmp')} className="shrink-0" data-testid="button-back-to-mmp">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
            <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">{mmpFile?.name || mmpFile?.projectName || 'MMP Details'}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              MMP ID: {mmpFile?.mmpId || mmpFile?.id?.substring(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge 
            variant={mmpFile?.status === 'approved' ? 'default' : mmpFile?.status === 'pending' ? 'secondary' : 'outline'}
            className={mmpFile?.status === 'approved' ? 'bg-green-600' : ''}
          >
            {mmpFile?.status || 'Unknown'}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-export-mmp">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportToExcel} data-testid="menu-export-excel">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportToPdf} data-testid="menu-export-pdf">
                <FileText className="h-4 w-4 mr-2" />
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => setShowAuditTrail(true)} data-testid="button-audit-trail">
            <History className="h-4 w-4 mr-2" />
            Audit
          </Button>
        </div>
      </div>

      {/* Linked Projects badge strip */}
      <LinkedProjectsBadge entityId={id} type="mmp" />

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Total Sites</p>
                <p className="text-2xl sm:text-3xl font-bold text-blue-700 dark:text-blue-400">{siteEntries.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-200/50 dark:bg-blue-800/50 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">States</p>
                <p className="text-2xl sm:text-3xl font-bold text-green-700 dark:text-green-400">{stateDistribution.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-green-200/50 dark:bg-green-800/50 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Status</p>
                <p className="text-lg sm:text-xl font-bold text-purple-700 dark:text-purple-400 capitalize">{mmpFile?.status?.replace(/_/g, ' ') || 'N/A'}</p>
                {returnedSitesInfo.length > 0 && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 font-medium mt-0.5">
                    {returnedSitesInfo.length} site{returnedSitesInfo.length > 1 ? 's' : ''} returned
                  </p>
                )}
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-200/50 dark:bg-purple-800/50 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/20 border-orange-200 dark:border-orange-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Last Updated</p>
                <p className="text-sm sm:text-base font-bold text-orange-700 dark:text-orange-400">
                  {displayDate ? format(new Date(displayDate), 'MMM d, yyyy') : 'N/A'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-orange-200/50 dark:bg-orange-800/50 flex items-center justify-center">
                <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cycle Coverage Progress Bar */}
      {siteEntries.length > 0 && (
        <Card className="shadow-sm border" data-testid="card-cycle-coverage">
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-2 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-600" />
              Cycle Coverage
            </p>
            <CycleProgressBar covered={coveredSitesCount} total={siteEntries.length} />
          </CardContent>
        </Card>
      )}

      {/* Deadline Warning Banner */}
      {daysToDeadline !== null && daysToDeadline <= 3 && (
        <Card className="shadow-md bg-gradient-to-r from-red-50/80 to-rose-50/50 dark:from-red-900/20 dark:to-rose-900/10 border-red-200 dark:border-red-800" data-testid="card-deadline-warning">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-red-200/50 dark:bg-red-800/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                  {daysToDeadline <= 0
                    ? 'Cycle Close Deadline Passed'
                    : daysToDeadline === 1
                      ? 'Cycle Close Deadline Tomorrow'
                      : `Cycle Close Deadline in ${daysToDeadline} Days`}
                </p>
                <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">
                  {siteEntries.length - coveredSitesCount} site{siteEntries.length - coveredSitesCount !== 1 ? 's' : ''} still uncovered — urgent action required.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recall Information Banner */}
      {recallInfo.wasRecalled && (
        <Card className="shadow-md bg-gradient-to-r from-orange-50/80 to-amber-50/50 dark:from-orange-900/20 dark:to-amber-900/10 border-orange-200 dark:border-orange-800" data-testid="card-return-recall-info">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-200/50 dark:bg-orange-800/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">MMP Recalled</p>
                {recallInfo.reason && (
                  <p className="text-sm text-orange-700 dark:text-orange-400 mt-0.5">
                    Reason: {recallInfo.reason}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {recallInfo.recalledBy && <>By: {recallInfo.recalledBy}</>}
                  {recallInfo.recalledAt && <> on {format(new Date(recallInfo.recalledAt), 'MMM d, yyyy HH:mm')}</>}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approval Workflow & Comments */}
      {(mmpFile?.approvalWorkflow || mmpFile?.workflow?.comments || mmpFile?.comprehensiveVerification?.cpVerification?.finalVerification?.comments) && (
        <Card className="shadow-md bg-gradient-to-r from-blue-50/50 to-white dark:from-blue-900/10 dark:to-background" data-testid="card-approval-comments">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Approval Workflow & Comments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Workflow Comments */}
            {mmpFile?.workflow?.comments && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800" data-testid="text-workflow-comment">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">Workflow Comment</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{mmpFile.workflow.comments}</p>
              </div>
            )}

            {/* CP Verification Comments */}
            {mmpFile?.comprehensiveVerification?.cpVerification?.finalVerification?.comments && (
              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800" data-testid="text-cp-verification-comment">
                <p className="text-sm font-medium text-purple-700 dark:text-purple-400 mb-1">
                  CP Verification Comment
                  {mmpFile.comprehensiveVerification.cpVerification.finalVerification.completedBy && (
                    <span className="font-normal text-muted-foreground ml-2">
                      by {mmpFile.comprehensiveVerification.cpVerification.finalVerification.completedBy}
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {mmpFile.comprehensiveVerification.cpVerification.finalVerification.comments}
                </p>
              </div>
            )}

            {/* First Approval */}
            {mmpFile?.approvalWorkflow?.firstApproval && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800" data-testid="text-first-approval-comment">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">First Approval</p>
                  {mmpFile.approvalWorkflow.firstApproval.approvedBy && (
                    <span className="text-xs text-muted-foreground">
                      by {mmpFile.approvalWorkflow.firstApproval.approvedBy}
                      {mmpFile.approvalWorkflow.firstApproval.approvedAt && (
                        <> on {format(new Date(mmpFile.approvalWorkflow.firstApproval.approvedAt), 'MMM d, yyyy')}</>
                      )}
                    </span>
                  )}
                </div>
                {mmpFile.approvalWorkflow.firstApproval.comments && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                    {mmpFile.approvalWorkflow.firstApproval.comments}
                  </p>
                )}
              </div>
            )}

            {/* Final Approval */}
            {mmpFile?.approvalWorkflow?.finalApproval && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800" data-testid="text-final-approval-comment">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Final Approval</p>
                  {mmpFile.approvalWorkflow.finalApproval.approvedBy && (
                    <span className="text-xs text-muted-foreground">
                      by {mmpFile.approvalWorkflow.finalApproval.approvedBy}
                      {mmpFile.approvalWorkflow.finalApproval.approvedAt && (
                        <> on {format(new Date(mmpFile.approvalWorkflow.finalApproval.approvedAt), 'MMM d, yyyy')}</>
                      )}
                    </span>
                  )}
                </div>
                {mmpFile.approvalWorkflow.finalApproval.comments && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                    {mmpFile.approvalWorkflow.finalApproval.comments}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Coordinator Summary */}
      <CoordinatorSummaryCard siteEntries={siteEntries} mmpId={mmpFile?.id} />

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        {canForward && (
          <>
            <Button 
              onClick={() => setForwardOpen(true)} 
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-80 disabled:cursor-not-allowed"
              disabled={isForwarded}
              data-testid="button-forward-to-foms"
            >
              <Send className="mr-2 h-4 w-4" />
              {isForwarded ? 'Forwarded' : (wasRecalled ? 'Re-Forward to FOMs' : 'Forward to FOMs')}
            </Button>
            {isForwarded && forwardedCount !== null && (
              <span className="text-sm text-muted-foreground">to {forwardedCount} FOM(s)</span>
            )}
            {!isForwarded && wasRecalled && (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                Previously Recalled
              </Badge>
            )}
          </>
        )}
        
        {(isFOM || isAdmin) && isForwarded && (
          <>
            <Button 
              onClick={() => navigate(`/mmp/${mmpFile.id}/review-assign-coordinators`)}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-review-assign-coordinators"
            >
              <Users className="mr-2 h-4 w-4" />
              Review & Assign Coordinators
            </Button>
            <Button
              variant="outline"
              onClick={() => setReclaimDialogOpen(true)}
              className="border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950"
              data-testid="button-reclaim-mmp"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reclaim from Coordinators
            </Button>
          </>
        )}

        {(isCoordinator || isSupervisor || isAdmin) && (mmpFile as any)?.workflow?.forwardedToCoordinators && (
          <Button 
            onClick={handleMarkAsVerified}
            className="bg-purple-600 hover:bg-purple-700"
            data-testid="button-mark-verified"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Mark as Verified
          </Button>
        )}
        
        {canEdit && (
          <Button variant="outline" onClick={handleEditMMP} data-testid="button-edit-mmp">
            <Edit className="mr-2 h-4 w-4" />
            Edit MMP
          </Button>
        )}
      </div>

      {/* Dialogs */}
      <ForwardToFOMDialog 
        open={forwardOpen} 
        onOpenChange={setForwardOpen} 
        mmpId={mmpFile.id} 
        mmpName={mmpFile.name}
        onForwarded={(ids) => { setForwardedLocal(true); setForwardedCount(ids.length); }}
      />
      
      <ForwardToCoordinatorsDialog 
        open={forwardToCoordinatorsOpen} 
        onOpenChange={setForwardToCoordinatorsOpen} 
        mmpId={mmpFile.id} 
        mmpName={mmpFile.name}
        onForwarded={(ids) => { setForwardedLocal(true); setForwardedCount(ids.length); }}
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Column - Site Distribution */}
        <div className="xl:col-span-5 space-y-6">
          <MMPOverviewCard 
            mmpFile={mmpFileWithEntries} 
            siteEntries={siteEntries}
            onProceedToVerification={handleProceedToVerification}
            onEditMMP={handleEditMMP}
          />
        </div>
        
        {/* Right Column - Site Information */}
        <div className="xl:col-span-7 space-y-6">
          <MMPSiteInformation 
            mmpFile={mmpFileWithEntries} 
            showVerificationButton={false} 
          />
        </div>
      </div>

      {/* Data & Analysis Section */}
      <Card className="shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-semibold">Site Data & Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="list" className="w-full">
            <TabsList className="grid grid-cols-3 md:grid-cols-7 w-full bg-muted/50">
              <TabsTrigger 
                value="list" 
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white dark:data-[state=active]:bg-blue-700 transition-all"
                data-testid="tab-site-entries"
              >
                <span className="hidden sm:inline">Site Entries</span>
                <span className="sm:hidden">List</span>
                <Badge variant="secondary" className="ml-2 bg-white/20">{siteEntries.length}</Badge>
              </TabsTrigger>
              <TabsTrigger 
                value="tracker" 
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white dark:data-[state=active]:bg-blue-700 transition-all"
                data-testid="tab-mmp-tracker"
              >
                <span className="hidden sm:inline">MMP Tracker</span>
                <span className="sm:hidden">Tracker</span>
              </TabsTrigger>
              <TabsTrigger 
                value="detail" 
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white dark:data-[state=active]:bg-blue-700 transition-all"
                data-testid="tab-details"
              >
                Details
              </TabsTrigger>
              <TabsTrigger 
                value="validation" 
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white dark:data-[state=active]:bg-blue-700 transition-all"
                data-testid="tab-validation"
              >
                Validation
              </TabsTrigger>
              <TabsTrigger 
                value="audit" 
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white dark:data-[state=active]:bg-blue-700 transition-all"
                data-testid="tab-audit"
              >
                Audit
              </TabsTrigger>
              <TabsTrigger 
                value="compliance" 
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white dark:data-[state=active]:bg-blue-700 transition-all"
                data-testid="tab-compliance"
              >
                Compliance
              </TabsTrigger>
              <TabsTrigger 
                value="version-history" 
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white dark:data-[state=active]:bg-blue-700 transition-all"
                data-testid="tab-version-history"
              >
                <span className="hidden sm:inline">Version History</span>
                <span className="sm:hidden">Versions</span>
              </TabsTrigger>
            </TabsList>
        
            <TabsContent value="list" className="mt-6">
              <MMPSiteEntriesTable 
                siteEntries={siteEntries}
                onViewSiteDetail={handleViewSiteDetail}
              />
            </TabsContent>
        
            <TabsContent value="tracker" className="mt-6">
              {mmpFile && (
                <WorkflowTrackerTab 
                  mmpFiles={[mmpFile]}
                  coordinators={(() => {
                    const coordMap = new Map<string, string>();
                    siteEntries.forEach((entry: any) => {
                      const coordId = entry.additional_data?.assigned_to || entry.forwarded_to_user_id;
                      const coordName = entry.additional_data?.assigned_to_name || entry.coordinator_name;
                      if (coordId && coordName) coordMap.set(coordId, coordName);
                    });
                    return Array.from(coordMap.entries()).map(([id, name]) => ({ id, name }));
                  })()}
                />
              )}
            </TabsContent>

            <TabsContent value="detail" className="mt-6">
              <div className="space-y-4">
                {siteEntries.map((site) => (
                  <Card key={site.id} className="overflow-hidden hover:shadow-md transition-shadow">
                    <CardContent className="p-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Site Code</p>
                        <p>{site.siteCode}</p>
                      </div>
                      
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Site Name</p>
                        <p>{site.siteName}</p>
                      </div>
                      
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">In MoDa</p>
                        <p>{site.inMoDa ? 'Yes' : 'No'}</p>
                      </div>
                      
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Visited By</p>
                        <p>{site.visitedBy}</p>
                      </div>
                      
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Main Activity</p>
                        <p>{site.mainActivity}</p>
                      </div>
                      
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Visit Date</p>
                        <p>{site.visitDate}</p>
                      </div>
                      
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Distribution by CP</p>
                        <p>{site.distributionByCP ? 'Yes' : 'No'}</p>
                      </div>
                      
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Submitted to MoDa</p>
                        <p>{site.submittedToMoDa ? 'Yes' : 'No'}</p>
                      </div>
                      
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Questions Submitted</p>
                        <p>{site.questionsSubmitted}</p>
                      </div>
                      
                      {site.findings && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Findings</p>
                          <p>{site.findings}</p>
                        </div>
                      )}
                      
                      {site.flaggedIssues && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Flagged Issues</p>
                          <p>{site.flaggedIssues}</p>
                        </div>
                      )}
                      
                      {site.additionalComments && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Additional Comments</p>
                          <p>{site.additionalComments}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
        
            <TabsContent value="validation" className="mt-6">
              <div className="space-y-6">
                {(() => {
                  // Compute validation metrics and issues from real data
                  const total = siteEntries.length;
                  const siteByCode: Record<string, number> = {};
                  siteEntries.forEach(s => { if (s.siteCode) siteByCode[s.siteCode] = (siteByCode[s.siteCode] || 0) + 1 });
                  const duplicateCodes = Object.entries(siteByCode).filter(([_, c]) => c > 1).map(([code]) => code);

                  const issues: { site: string; issueType: string; description: string; severity: 'Warning' | 'Error' }[] = [];
                  const siteHasIssue = new Set<string>();

                  siteEntries.forEach((s) => {
                    const idOrCode = (s as any).id || s.siteCode || '';
                    const missingRequired = !s.siteCode || !s.siteName || !s.visitDate;
                    if (missingRequired) {
                      issues.push({ site: s.siteCode || s.siteName || idOrCode, issueType: 'Missing Data', description: 'siteCode, siteName and visitDate are required', severity: 'Error' });
                      siteHasIssue.add(idOrCode);
                    }
                    const invalidDate = !s.visitDate || isNaN(Date.parse(String(s.visitDate)));
                    if (!missingRequired && invalidDate) {
                      issues.push({ site: s.siteCode || s.siteName || idOrCode, issueType: 'Format Error', description: 'Invalid visitDate format', severity: 'Error' });
                      siteHasIssue.add(idOrCode);
                    }
                    if (duplicateCodes.includes(s.siteCode)) {
                      issues.push({ site: s.siteCode || idOrCode, issueType: 'Duplicate', description: 'Duplicate siteCode in this MMP', severity: 'Error' });
                      siteHasIssue.add(idOrCode);
                    }
                    if (!s.visitedBy || !s.mainActivity) {
                      issues.push({ site: s.siteCode || s.siteName || idOrCode, issueType: 'Missing Optional', description: 'visitedBy or mainActivity missing', severity: 'Warning' });
                      siteHasIssue.add(idOrCode);
                    }
                  });

                  const errorsCount = issues.filter(i => i.severity === 'Error').length;
                  const warningsCount = issues.filter(i => i.severity === 'Warning').length;
                  const validEntries = total - siteHasIssue.size;

                  return (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">
                                {validEntries}
                              </div>
                              <p className="text-muted-foreground text-sm">Valid Entries</p>
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-amber-600">
                                {warningsCount}
                              </div>
                              <p className="text-muted-foreground text-sm">Warnings</p>
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-red-600">
                                {errorsCount}
                              </div>
                              <p className="text-muted-foreground text-sm">Errors</p>
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-center">
                              <div className="text-2xl font-bold">
                                {total}
                              </div>
                              <p className="text-muted-foreground text-sm">Total Entries</p>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      <div className="rounded-md border mt-6">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Site</TableHead>
                              <TableHead>Issue Type</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Severity</TableHead>
                              <TableHead>Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {issues.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground">No issues detected</TableCell>
                              </TableRow>
                            )}
                            {issues.slice(0, 50).map((issue, idx) => (
                              <TableRow key={`${issue.site}-${issue.issueType}-${idx}`}>
                                <TableCell>{issue.site}</TableCell>
                                <TableCell>{issue.issueType}</TableCell>
                                <TableCell>{issue.description}</TableCell>
                                <TableCell>
                                  {issue.severity === 'Error' ? (
                                    <Badge className="bg-red-100 text-red-800">Error</Badge>
                                  ) : (
                                    <Badge className="bg-amber-100 text-amber-800">Warning</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Button size="sm" variant="outline" onClick={() => toast({ description: 'Open site for fixing (coming soon)' })}>Fix</Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="flex justify-between items-center mt-4">
                        <div>
                          <Button variant="outline" onClick={() => toast({ description: "This would attempt to auto-fix validation issues" })}>
                            Auto-Fix Issues
                          </Button>
                        </div>
                        <div className="space-x-2">
                          <Button variant="outline" onClick={() => toast({ description: "Retrying upload process" })}>
                            Re-Upload File
                          </Button>
                          <Button onClick={() => toast({ description: "This would re-run validation checks" })}>
                            Re-Run Validation
                          </Button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </TabsContent>

            <TabsContent value="audit" className="mt-6">
              <AuditLogViewer mmpId={id} />
            </TabsContent>

            <TabsContent value="compliance" className="mt-6">
              <ComplianceTracker mmpId={id} />
            </TabsContent>

            <TabsContent value="version-history" className="mt-6">
              <MMPVersionHistory mmpFile={mmpFile} mmpId={mmpFile.mmpId || `MMP-${mmpFile.id}`} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      

      {/* Move file management to the top of the page */}
      {(canArchive || canDelete || canApprove || canForward) && (
        <div className="mb-6">
          <MMPFileManagement
            mmpFile={mmpFile}
            canArchive={canArchive}
            canDelete={canDelete}
            canApprove={canApprove}
            canForward={canForward}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onResetApproval={handleReset}
            onApprove={handleApprove}
            onForward={() => setForwardOpen(true)}
          />
        </div>
      )}

      {/* Recall History - shows if any recalls have occurred */}
      <div className="mb-6">
        <RecallHistory mmpFile={mmpFile} />
      </div>
      
      <Dialog open={showAuditTrail} onOpenChange={setShowAuditTrail}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Activity Log</DialogTitle>
          </DialogHeader>
          
          <AuditLogViewer mmpId={id} />
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAuditTrail(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Site Detail Dialog */}
      <Dialog open={siteDetailOpen} onOpenChange={setSiteDetailOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedSite?.siteName || 'Site Details'}</DialogTitle>
          </DialogHeader>
          
          {selectedSite && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Site Code</h3>
                  <p className="font-mono">{selectedSite.siteCode}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Visit Date</h3>
                  <p>{selectedSite.visitDate}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Main Activity</h3>
                  <p>{selectedSite.mainActivity}</p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Visited By</h3>
                  <p>{selectedSite.visitedBy}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Site Visited</h3>
                  <p>{selectedSite.siteVisited ? 'Yes' : 'No'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">In MoDa</h3>
                  <p>{selectedSite.inMoDa ? 'Yes' : 'No'}</p>
                </div>
              </div>

              {selectedSite.findings && (
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Findings</h3>
                  <p>{selectedSite.findings}</p>
                </div>
              )}

              {selectedSite.flaggedIssues && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 p-3 rounded-lg">
                  <h3 className="text-sm font-medium text-amber-800 dark:text-amber-400">Flagged Issues</h3>
                  <p className="text-amber-700 dark:text-amber-300">{selectedSite.flaggedIssues}</p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setSiteDetailOpen(false)}>Close</Button>
            <Button onClick={() => {
              setSiteDetailOpen(false);
              toast({ description: "Site visit details would open in full view" });
            }}>
              View Full Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {mmpFile && (
        <ReclaimFromCoordinatorDialog
          open={reclaimDialogOpen}
          onOpenChange={setReclaimDialogOpen}
          mmpId={mmpFile.id}
          mmpName={mmpFile.name || 'Unknown MMP'}
          siteCount={mmpFile.siteEntries?.length || 0}
          onReclaimComplete={() => {
            navigate('/mmp');
          }}
        />
      )}
    </div>
  );
};

export default MMPDetailView;
