import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, Clock, DollarSign, BarChart2, UserCheck, Shield, AlertTriangle, Calendar, ClipboardList, FileSpreadsheet } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { MMPApprovalWorkflow } from "@/components/MMPApprovalWorkflow";
import AuditLogViewer from "@/components/AuditLogViewer";
import MMPVersionHistory from "@/components/MMPVersionHistory";
import { MMPFile } from "@/types";
import { useMMP } from "@/context/mmp/MMPContext";
import MMPOverallInformation from "@/components/MMPOverallInformation";
import MMPSiteInformation from "@/components/MMPSiteInformation";

const MMPDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { mmpFiles, loading: contextLoading, getMmpById, updateMMP } = useMMP();
  const [activeTab, setActiveTab] = useState("core");
  const [mmpItem, setMmpItem] = useState<MMPFile | null>(null);
  
  useEffect(() => {
    if (id && !contextLoading) {
      const foundMmp = getMmpById(id);
      if (foundMmp) {
        setMmpItem(foundMmp);
      } else {
        toast({
          variant: "destructive",
          title: "MMP Not Found",
          description: "The requested MMP file could not be found."
        });
        navigate("/mmp");
      }
    }
  }, [id, contextLoading, getMmpById, toast, navigate]);

  const handleBack = () => {
    navigate("/mmp");
  };

  const getComplexityColor = (complexity: string) => {
    switch(complexity) {
      case "Basic": return "bg-green-100 text-green-800";
      case "Intermediate": return "bg-amber-100 text-amber-800";
      case "Advanced": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case "Completed": return "bg-green-100 text-green-800";
      case "In Progress": return "bg-blue-100 text-blue-800";
      case "Pending": return "bg-amber-100 text-amber-800";
      case "Flagged for Review": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const handleApprove = (comments: string) => {
    if (!mmpItem) return;
    
    const isFirstApproval = !mmpItem.approvalWorkflow?.firstApproval;
    
    const newApprovalWorkflow = {
      ...mmpItem.approvalWorkflow || {},
    };
    
    if (isFirstApproval) {
      newApprovalWorkflow.firstApproval = {
        approvedBy: "Current User",
        approvedAt: new Date().toISOString(),
        comments
      };
      toast({
        title: "First Approval Completed",
        description: "MMP file has received first approval. Final approval still required."
      });
    } else {
      newApprovalWorkflow.finalApproval = {
        approvedBy: "Current User",
        approvedAt: new Date().toISOString(),
        comments
      };
      toast({
        title: "Final Approval Completed",
        description: "MMP file has been fully approved and is now locked for editing."
      });
    }
    
    const updatedMMP: Partial<MMPFile> = {
      ...mmpItem,
      status: isFirstApproval ? "pending" : "approved",
      approvedBy: isFirstApproval ? undefined : "Current User",
      approvedAt: isFirstApproval ? undefined : new Date().toISOString(),
      approvalWorkflow: newApprovalWorkflow as any
    };
    
    setMmpItem({ ...mmpItem, ...updatedMMP });
    updateMMP(mmpItem.id, updatedMMP);
  };
  
  const handleReject = (reason: string) => {
    if (!mmpItem) return;
    
    const updatedMMP: Partial<MMPFile> = {
      ...mmpItem,
      status: "rejected" as any,
      rejectionReason: reason,
    };
    
    setMmpItem({ ...mmpItem, ...updatedMMP });
    updateMMP(mmpItem.id, updatedMMP);
    
    toast({
      variant: "destructive",
      title: "MMP File Rejected",
      description: "The file has been rejected and returned for corrections."
    });
  };
  
  const handleVerify = () => {
    toast({
      title: "Verification Complete",
      description: "MMP file has been verified and is ready for approval."
    });
  };
  
  if (contextLoading || !mmpItem) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading MMP item details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">MMP Details</h1>
          <p className="text-muted-foreground">
            {mmpItem.mmpId || `MMP-${mmpItem.id}`} • Created on {mmpItem.uploadedAt ? new Date(mmpItem.uploadedAt).toLocaleDateString() : 'Unknown'}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 mb-4">
          <TabsTrigger value="core">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Core Information
          </TabsTrigger>
          <TabsTrigger value="siteVisit">
            <MapPin className="h-4 w-4 mr-2" />
            Site Visit Data
          </TabsTrigger>
          <TabsTrigger value="financial">
            <DollarSign className="h-4 w-4 mr-2" />
            Financial
          </TabsTrigger>
          <TabsTrigger value="performance">
            <BarChart2 className="h-4 w-4 mr-2" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="approvals">
            <UserCheck className="h-4 w-4 mr-2" />
            Verification & Approvals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="core">
          <Card>
            <CardHeader>
              <CardTitle>Core Information</CardTitle>
              <CardDescription>Essential details about this monitoring plan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <MMPOverallInformation mmpFile={mmpItem} />
              <Separator />
              <MMPSiteInformation mmpFile={mmpItem as any} showVerificationButton={false} />
            </CardContent>
            <CardFooter>
              <Button variant="outline" onClick={() => toast({ title: "Action triggered", description: "This would update the MMP item in a real app" })}>
                Update Information
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="siteVisit">
          <Card>
            <CardHeader>
              <CardTitle>Site Visit Data</CardTitle>
              <CardDescription>Expanded details about the site visit requirements</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Task Complexity</h4>
                    <Badge className={getComplexityColor(mmpItem.siteVisit?.complexity || 'Basic')}>
                      {mmpItem.siteVisit?.complexity || 'Basic'}
                    </Badge>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Estimated Duration</h4>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <p>{mmpItem.siteVisit?.estimatedDuration || 'Not specified'}</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Resource Requirements</h4>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {(mmpItem.siteVisit?.resources || []).map((resource: string, index: number) => (
                        <Badge key={index} variant="outline">{resource}</Badge>
                      ))}
                      {(!mmpItem.siteVisit?.resources || mmpItem.siteVisit.resources.length === 0) && (
                        <p className="text-sm text-muted-foreground">No resources specified</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Risk & Escalation Notes</h4>
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-3 mt-1">
                      <div className="flex gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">{mmpItem.siteVisit?.risks || 'No risks identified'}</p>
                      </div>
                      <Separator className="my-2 bg-amber-200" />
                      <div className="mt-2">
                        <p className="text-sm font-medium text-amber-800">Escalation Protocol:</p>
                        <p className="text-sm text-amber-800">{mmpItem.siteVisit?.escalation || 'No escalation protocol defined'}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-muted-foreground">Schedule Indicators</h4>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div className="flex flex-col border rounded-md p-3 items-center justify-center">
                        <Calendar className="h-5 w-5 text-muted-foreground mb-1" />
                        <p className="text-xs text-muted-foreground">Start Date</p>
                        <p className="font-medium">{mmpItem.performance?.startDate || 'Not set'}</p>
                      </div>
                      
                      <div className="flex flex-col border rounded-md p-3 items-center justify-center">
                        <Calendar className="h-5 w-5 text-muted-foreground mb-1" />
                        <p className="text-xs text-muted-foreground">Est. End Date</p>
                        <p className="font-medium">{mmpItem.performance?.estimatedEndDate || 'Not set'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" onClick={() => toast({ title: "Action triggered", description: "This would update the site visit data in a real app" })}>
                Update Site Visit Data
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="financial">
          <Card>
            <CardHeader>
              <CardTitle>Financial Tracking</CardTitle>
              <CardDescription>Budget allocation and fee breakdown details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col md:flex-row gap-6 items-center">
                <div className="flex flex-col items-center justify-center border rounded-xl p-6 w-full md:w-1/3">
                  <DollarSign className="h-8 w-8 text-primary" />
                  <p className="text-sm text-muted-foreground mt-2">Budget Allocation</p>
                  <p className="text-3xl font-bold">{mmpItem.financial?.budgetAllocation || 0} {mmpItem.financial?.currency || 'SDG'}</p>
                  <Badge className={(mmpItem.financial?.approvalStatus === "Approved" ? "bg-green-100 text-green-800 mt-2" : "bg-amber-100 text-amber-800 mt-2")}>
                    {mmpItem.financial?.approvalStatus || 'Pending'}
                  </Badge>
                </div>
                
                <div className="w-full md:w-2/3">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Fee Breakdown</h4>
                  <div className="space-y-2">
                    {mmpItem.financial?.feeBreakdown ? (
                      <>
                        <div className="flex justify-between">
                          <span>Base Fee</span>
                          <span className="font-medium">{mmpItem.financial.feeBreakdown.baseFee || 0} {mmpItem.financial.currency || 'SDG'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Distance Surcharge</span>
                          <span className="font-medium">{mmpItem.financial.feeBreakdown.distanceSurcharge || 0} {mmpItem.financial.currency || 'SDG'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Complexity Surcharge</span>
                          <span className="font-medium">{mmpItem.financial.feeBreakdown.complexitySurcharge || 0} {mmpItem.financial.currency || 'SDG'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Urgency Surcharge</span>
                          <span className="font-medium">{mmpItem.financial.feeBreakdown.urgencySurcharge || 0} {mmpItem.financial.currency || 'SDG'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Transportation Allowance</span>
                          <span className="font-medium">{mmpItem.financial.feeBreakdown.transportationAllowance || 0} {mmpItem.financial.currency || 'SDG'}</span>
                        </div>
                        <Separator className="my-2" />
                        <div className="flex justify-between font-bold">
                          <span>Total</span>
                          <span>{mmpItem.financial.budgetAllocation || 0} {mmpItem.financial.currency || 'SDG'}</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">No fee breakdown available</p>
                    )}
                  </div>
                </div>
              </div>
              
              <Separator />
              
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Per-Site Budget Allocation</h4>
                {mmpItem.financial?.perSiteAllocation && mmpItem.financial.perSiteAllocation.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-4">Site ID</th>
                          <th className="text-left py-2 px-4">Allocation</th>
                          <th className="text-left py-2 px-4">Transportation Fee</th>
                          <th className="text-right py-2 px-4">% of Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mmpItem.financial.perSiteAllocation.map((site, index) => {
                          const percentage = Math.round((site.allocation / (mmpItem.financial?.budgetAllocation || 1)) * 100);
                          return (
                            <tr key={index} className={index % 2 === 0 ? 'bg-muted/50' : ''}>
                              <td className="py-2 px-4">{site.siteId}</td>
                              <td className="py-2 px-4">{site.allocation} {mmpItem.financial?.currency || 'SDG'}</td>
                              <td className="py-2 px-4">{site.transportationFee} {mmpItem.financial?.currency || 'SDG'}</td>
                              <td className="text-right py-2 px-4">{percentage}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t font-medium">
                        <tr>
                          <td className="py-2 px-4">Total</td>
                          <td className="py-2 px-4">{mmpItem.financial?.budgetAllocation || 0} {mmpItem.financial?.currency || 'SDG'}</td>
                          <td className="py-2 px-4">
                            {mmpItem.financial.perSiteAllocation.reduce((sum, site) => sum + site.transportationFee, 0)} {mmpItem.financial?.currency || 'SDG'}
                          </td>
                          <td className="text-right py-2 px-4">100%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No per-site allocation data available</p>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Approval Information</h4>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-sm">Status:</span>
                      <span className="font-medium">{mmpItem.financial?.approvalStatus || 'Pending'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Approved By:</span>
                      <span className="font-medium">{mmpItem.financial?.approvedBy || mmpItem.approvedBy || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Approval Date:</span>
                      <span className="font-medium">{mmpItem.financial?.approvedDate || mmpItem.approvedAt || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Payment Processing</h4>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-sm">Payment Method:</span>
                      <span className="font-medium">{mmpItem.financial?.paymentMethod || 'Not specified'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Processing Timeline:</span>
                      <span className="font-medium">{mmpItem.financial?.processingTime || 'Not specified'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => toast({ title: "Download", description: "Downloading financial report..." })}>
                Export Financial Report
              </Button>
              <Button onClick={() => toast({ title: "Action triggered", description: "This would update the payment status in a real app" })}>
                Process Payment
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics & Reporting</CardTitle>
              <CardDescription>Tracking, metrics, and incident reports</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <h4 className="text-sm font-medium">Completion Status</h4>
                  <Badge className={getStatusColor(mmpItem.performance?.completionStatus || 'Pending')}>
                    {mmpItem.performance?.completionStatus || 'Pending'}
                  </Badge>
                </div>
                <Progress value={mmpItem.performance?.progress || 0} className="h-2" />
                <p className="text-xs text-right text-muted-foreground">{mmpItem.performance?.progress || 0}% complete</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Supervisor Rating & Feedback</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center">
                        {[...Array(5)].map((_, i) => (
                          <svg 
                            key={i} 
                            className={`w-4 h-4 ${i < Math.floor(mmpItem.performance?.supervisorRating || 0) ? 'text-yellow-400' : 'text-gray-300'}`} 
                            fill="currentColor" 
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                        <span className="ml-2 text-sm font-medium">{(mmpItem.performance?.supervisorRating || 0).toFixed(1)}</span>
                      </div>
                    </div>
                    <p className="text-sm mt-2">{mmpItem.performance?.supervisorFeedback || 'No feedback available'}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Incidents & Compliance Issues</h4>
                    {mmpItem.performance?.incidents && mmpItem.performance.incidents.length > 0 ? (
                      <div className="space-y-2">
                        {mmpItem.performance.incidents.map((incident: any, index: number) => (
                          <div key={index} className="rounded-md bg-amber-50 border border-amber-200 p-2">
                            <div className="flex justify-between">
                              <span className="text-sm font-medium">{incident.type}</span>
                              <Badge variant="outline" className={incident.resolved ? "text-green-600" : "text-amber-600"}>
                                {incident.resolved ? "Resolved" : "Pending"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{incident.description}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No incidents reported</p>
                    )}
                    
                    {(!mmpItem.performance?.complianceIssues || mmpItem.performance.complianceIssues.length === 0) && (
                      <div className="flex items-center gap-2 mt-3">
                        <UserCheck className="h-4 w-4 text-green-600" />
                        <p className="text-sm text-green-600">All compliance requirements met</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Real-Time Tracking Logs</h4>
                  <div className="border rounded-md overflow-hidden">
                    <div className="bg-muted py-2 px-3 text-xs font-medium grid grid-cols-3">
                      <div>Timestamp</div>
                      <div>Action</div>
                      <div>Location</div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {mmpItem.performance?.trackingLogs && mmpItem.performance.trackingLogs.length > 0 ? (
                        mmpItem.performance.trackingLogs.map((log: any, index: number) => (
                          <div key={index} className={`py-2 px-3 text-sm grid grid-cols-3 ${index % 2 === 0 ? 'bg-muted/50' : ''}`}>
                            <div className="text-xs">{format(new Date(log.timestamp), 'MMM d, h:mm a')}</div>
                            <div>{log.action}</div>
                            <div>{log.location}</div>
                          </div>
                        ))
                      ) : (
                        <div className="py-4 px-3 text-sm text-muted-foreground text-center">
                          No tracking logs available
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => toast({ description: "Downloading tracking logs..." })}>
                      <ClipboardList className="h-4 w-4 mr-2" />
                      Export Log Data
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => toast({ title: "Action triggered", description: "This would generate a full report in a real app" })}>
                Generate Full Report
              </Button>
              <Button onClick={() => toast({ title: "Action triggered", description: "This would mark the MMP as completed in a real app" })}>
                Update Status
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="approvals">
          <MMPApprovalWorkflow
            mmpFile={mmpItem as MMPFile}
            onApprove={handleApprove}
            onReject={handleReject}
            onVerify={handleVerify}
          />
          
          <Separator className="my-6" />
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Version History & Modifications</CardTitle>
              <CardDescription>Track changes made to this MMP file</CardDescription>
            </CardHeader>
            <CardContent>
              <MMPVersionHistory mmpFile={mmpItem as MMPFile} />
            </CardContent>
          </Card>
          
          <AuditLogViewer 
            mmpId={mmpItem.mmpId} 
            standalone={false}
            actionFilter="all"
            timeFilter="all"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MMPDetail;
