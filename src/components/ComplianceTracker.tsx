
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { 
  Shield, Download, CheckCircle, XCircle, AlertTriangle, 
  Info, Clock, FileText, ChartBar, ListChecks, ArrowUpRight
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useMMP } from "@/context/mmp/MMPContext";
import { MMPFile, MMPSiteEntry } from "@/types";

type ComplianceStatus = 'passed' | 'warning' | 'failed' | 'pending';
interface ComplianceCheckRow {
  id: string;
  rule: string;
  description: string;
  status: ComplianceStatus;
  details: string;
  critical: boolean;
  lastChecked: string;
}
interface PolicyRow { id: string; name: string; status: string; lastUpdated: string }

interface ComplianceTrackerProps {
  mmpId?: string; // Optional: for a specific MMP
  standalone?: boolean; // Whether this is a standalone view or embedded
}

const ComplianceTracker: React.FC<ComplianceTrackerProps> = ({ mmpId, standalone = false }) => {
  const [activeTab, setActiveTab] = useState<string>("compliance-checks");
  const { toast } = useToast();
  const { mmpFiles, getMmpById } = useMMP();
  const currentMMP: MMPFile | undefined = mmpId ? getMmpById(mmpId) : undefined;

  const targetSites: MMPSiteEntry[] = useMemo(() => {
    if (currentMMP?.siteEntries && Array.isArray(currentMMP.siteEntries)) return currentMMP.siteEntries;
    if (standalone) {
      return (mmpFiles || []).flatMap((f) => f.siteEntries || []);
    }
    return [];
  }, [currentMMP, mmpFiles, standalone]);

  const complianceChecks: ComplianceCheckRow[] = useMemo(() => {
    const nowISO = new Date().toISOString();
    const total = targetSites.length;

    const requiredMissing = targetSites.filter(s => !s.siteCode || !s.siteName || !s.visitDate);
    const invalidDates = targetSites.filter(s => !s.visitDate || isNaN(Date.parse(String(s.visitDate))));
    const notInMoDa = targetSites.filter(s => s.inMoDa === false);
    const visitedByMissing = targetSites.filter(s => !s.visitedBy);
    const mainActivityMissing = targetSites.filter(s => !s.mainActivity);

    const approvalsStatus: ComplianceStatus = currentMMP
      ? (currentMMP.status === 'approved' ? 'passed' : (currentMMP.status === 'rejected' ? 'failed' : 'pending'))
      : (standalone ? 'pending' : 'pending');

    const checks: ComplianceCheckRow[] = [
      {
        id: 'c1',
        rule: 'Complete Site Information',
        description: 'Required fields present: siteCode, siteName, visitDate',
        status: requiredMissing.length === 0 ? 'passed' : (requiredMissing.length / (total || 1) > 0.1 ? 'failed' : 'warning'),
        details: `${total - requiredMissing.length}/${total} entries have required fields` + (requiredMissing.length ? `; Missing in ${Math.min(5, requiredMissing.length)}+ entries` : ''),
        critical: true,
        lastChecked: nowISO,
      },
      {
        id: 'c2',
        rule: 'Valid Date Formats',
        description: 'visitDate must be a valid date',
        status: invalidDates.length === 0 ? 'passed' : (invalidDates.length / (total || 1) > 0.05 ? 'failed' : 'warning'),
        details: invalidDates.length ? `${invalidDates.length} entries with invalid dates` : 'All dates valid',
        critical: true,
        lastChecked: nowISO,
      },
      {
        id: 'c3',
        rule: 'MoDa Integration',
        description: 'Sites verified in MoDa',
        status: notInMoDa.length === 0 ? 'passed' : (notInMoDa.length / (total || 1) > 0.2 ? 'failed' : 'warning'),
        details: notInMoDa.length ? `${notInMoDa.length} site(s) not found/marked in MoDa` : 'All sites verified in MoDa',
        critical: false,
        lastChecked: nowISO,
      },
      {
        id: 'c4',
        rule: 'Required Approvals',
        description: 'MMP approval workflow completion',
        status: approvalsStatus,
        details: currentMMP ? `Current status: ${currentMMP.status}` : 'Multiple MMPs selected',
        critical: true,
        lastChecked: nowISO,
      },
      {
        id: 'c5',
        rule: 'Data Volume Consistency',
        description: 'Entries count matches uploaded data',
        status: currentMMP ? ((currentMMP.entries ?? 0) === (currentMMP.siteEntries?.length ?? 0) ? 'passed' : 'warning') : 'pending',
        details: currentMMP ? `${currentMMP.siteEntries?.length ?? 0}/${currentMMP.entries ?? 0} entries present` : 'Not applicable in aggregate view',
        critical: false,
        lastChecked: nowISO,
      }
    ];

    return checks;
  }, [targetSites, currentMMP, standalone]);

  const policies: PolicyRow[] = useMemo(() => {
    const baseDate = currentMMP?.modifiedAt || currentMMP?.uploadedAt || new Date().toISOString();
    return [
      { id: 'p1', name: 'Required Fields Policy', status: 'active', lastUpdated: baseDate },
      { id: 'p2', name: 'Approval Workflow Policy', status: 'active', lastUpdated: baseDate },
    ];
  }, [currentMMP]);

  const totalChecks = complianceChecks.length;
  const passedChecks = complianceChecks.filter(check => check.status === 'passed').length;
  const warningChecks = complianceChecks.filter(check => check.status === 'warning').length;
  const failedChecks = complianceChecks.filter(check => check.status === 'failed').length;
  const pendingChecks = complianceChecks.filter(check => check.status === 'pending').length;

  const complianceScore = Math.round((passedChecks / totalChecks) * 100);
  
  const getComplianceStatus = () => {
    const criticalFails = complianceChecks
      .filter(check => check.critical && check.status === 'failed')
      .length;
      
    if (criticalFails > 0) return { label: 'Non-Compliant', color: 'bg-red-100 text-red-800' };
    if (failedChecks > 0 || warningChecks > 0) return { label: 'Needs Attention', color: 'bg-amber-100 text-amber-800' };
    if (pendingChecks > 0) return { label: 'Pending Verification', color: 'bg-blue-100 text-blue-800' };
    return { label: 'Fully Compliant', color: 'bg-green-100 text-green-800' };
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'passed':
        return <Badge className="bg-green-100 text-green-800">Passed</Badge>;
      case 'warning':
        return <Badge className="bg-amber-100 text-amber-800">Warning</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      case 'pending':
        return <Badge className="bg-blue-100 text-blue-800">Pending</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const handleRunCompliance = () => {
    toast({
      description: "Compliance check started. This may take a few moments."
    });
    
    // Simulate compliance check completion
    setTimeout(() => {
      toast({
        title: "Compliance Check Complete",
        description: "All compliance rules have been verified."
      });
    }, 2000);
  };

  const handleDownloadReport = () => {
    // Generate report data
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm');
    const fileName = `compliance_report_${timestamp}.csv`;
    
    // Create CSV content with headers
    let csvContent = "Rule,Description,Status,Critical,Last Verified,Details\n";
    
    // Add each compliance check as a row
    complianceChecks.forEach(check => {
      // Format the data and escape any commas in text fields
      const row = [
        `"${check.rule}"`,
        `"${check.description}"`,
        `"${check.status}"`,
        `"${check.critical ? 'Yes' : 'No'}"`,
        `"${format(new Date(check.lastChecked), 'MMM d, yyyy h:mm a')}"`,
        `"${check.details.replace(/"/g, '""')}"`
      ];
      csvContent += row.join(",") + "\n";
    });
    
    // Create a downloadable blob
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Create download link and trigger it
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Report Downloaded",
      description: `Compliance report has been downloaded as ${fileName}`
    });
  };

  // Handle policy report download
  const handlePolicyReportDownload = () => {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm');
    const fileName = `policy_report_${timestamp}.csv`;
    
    // Create CSV content with headers
    let csvContent = "Policy Name,Status,Last Updated\n";
    
    // Add each policy as a row
    policies.forEach(policy => {
      const row = [
        `"${policy.name}"`,
        `"${policy.status}"`,
        `"${format(new Date(policy.lastUpdated), 'MMM d, yyyy')}"`
      ];
      csvContent += row.join(",") + "\n";
    });
    
    // Create a downloadable blob
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Create download link and trigger it
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Policy Report Downloaded",
      description: `Policy report has been downloaded as ${fileName}`
    });
  };

  // Handle summary report download
  const handleSummaryReportDownload = () => {
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm');
    const fileName = `compliance_summary_${timestamp}.pdf`;
    
    // In a real app, this would generate a PDF
    // For now, we'll just show a toast notification
    
    toast({
      title: "Summary Report Generated",
      description: "The PDF report would be downloaded in a real application."
    });
  };

  const complianceStatus = getComplianceStatus();
  const lastCheckedAt = useMemo(() => {
    const times = complianceChecks.map(c => new Date(c.lastChecked).getTime());
    return times.length ? new Date(Math.max(...times)) : null;
  }, [complianceChecks]);

  return (
    <Card className={standalone ? "" : "mt-6"}>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Compliance Tracking
            </CardTitle>
            <CardDescription>
              Verification of regulatory compliance and policy adherence
            </CardDescription>
          </div>
          
          <Badge className={complianceStatus.color}>
            {complianceStatus.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="compliance-checks">Compliance Checks</TabsTrigger>
            <TabsTrigger value="policies">Policies</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
          </TabsList>
          
          <TabsContent value="compliance-checks">
            {/* Compliance Checks Table */}
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Critical</TableHead>
                    <TableHead>Last Verified</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {complianceChecks.map((check) => (
                    <TableRow key={check.id}>
                      <TableCell className="font-medium">{check.rule}</TableCell>
                      <TableCell>{check.description}</TableCell>
                      <TableCell>{getStatusBadge(check.status)}</TableCell>
                      <TableCell>
                        {check.critical ? 
                          <span className="flex items-center text-red-600">
                            <AlertTriangle className="h-4 w-4 mr-1" /> Yes
                          </span> : 
                          <span className="text-muted-foreground">No</span>
                        }
                      </TableCell>
                      <TableCell>
                        {format(new Date(check.lastChecked), 'MMM d, h:mm a')}
                      </TableCell>
                      <TableCell className="max-w-[250px] break-words">{check.details}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            <div className="mt-4 flex justify-between">
              <Button variant="outline" onClick={() => handleRunCompliance()}>
                Re-Run Compliance Checks
              </Button>
              <Button variant="outline" onClick={handleDownloadReport}>
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="policies">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Policy Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policies.map((policy) => (
                    <TableRow key={policy.id}>
                      <TableCell className="font-medium">{policy.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-green-50 text-green-800">
                          {policy.status.charAt(0).toUpperCase() + policy.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(policy.lastUpdated), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">View Details</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={handlePolicyReportDownload}>
                <Download className="h-4 w-4 mr-2" />
                Export Policy Report
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="summary">
            <div className="space-y-6">
              {/* Compliance Score Card */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Compliance Score</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col items-center space-y-2">
                      <div className="text-4xl font-bold">{complianceScore}%</div>
                      <Progress value={complianceScore} className="w-full h-2" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Check Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <div className="flex items-center">
                          <CheckCircle className="h-4 w-4 text-green-500 mr-1" /> Passed
                        </div>
                        <span>{passedChecks}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <div className="flex items-center">
                          <AlertTriangle className="h-4 w-4 text-amber-500 mr-1" /> Warnings
                        </div>
                        <span>{warningChecks}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <div className="flex items-center">
                          <XCircle className="h-4 w-4 text-red-500 mr-1" /> Failed
                        </div>
                        <span>{failedChecks}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 text-blue-500 mr-1" /> Pending
                        </div>
                        <span>{pendingChecks}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Last Verified</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col">
                      <span className="text-lg">
                        {lastCheckedAt ? format(lastCheckedAt, 'MMM d, yyyy') : 'N/A'}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {lastCheckedAt ? format(lastCheckedAt, 'h:mm a') : ''}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">
                        By: System Automation
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Critical Issues Summary */}
              {(failedChecks > 0 || warningChecks > 0) && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-amber-800 flex items-center">
                      <AlertTriangle className="h-5 w-5 mr-2" />
                      Issues Requiring Attention
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {complianceChecks
                        .filter(check => check.status === 'failed' || check.status === 'warning')
                        .map(check => (
                          <li key={check.id} className="flex items-start gap-2">
                            {check.status === 'failed' ? 
                              <XCircle className="h-4 w-4 text-red-500 mt-0.5" /> : 
                              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                            }
                            <div>
                              <div className="font-medium">{check.rule}</div>
                              <div className="text-sm text-muted-foreground">{check.details}</div>
                            </div>
                          </li>
                        ))
                      }
                    </ul>
                  </CardContent>
                  <CardFooter className="border-t border-amber-200 bg-amber-50/50 flex justify-end">
                    <Button size="sm" variant="outline" className="text-amber-800 border-amber-300">
                      Fix Issues
                    </Button>
                  </CardFooter>
                </Card>
              )}
              
              <div className="flex justify-end">
                <Button onClick={handleSummaryReportDownload} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Download Summary Report
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ComplianceTracker;
