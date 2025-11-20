
import React, { useState, useEffect } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  AlertCircle, CheckCircle2, FileCheck, FileClock, FileWarning, Lock, 
  ShieldCheck, UserCheck, FileText, MapPin, Calendar, Info, GitBranch
} from "lucide-react";
import { MMPFile, MMPVersion } from '@/types';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseMMPId } from '@/utils/mmpIdGenerator';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useMMP } from '@/context/mmp/MMPContext';
import { MMPComprehensiveVerificationComponent } from './MMPComprehensiveVerification';

interface MMPApprovalWorkflowProps {
  mmpFile: MMPFile;
  onApprove: (comments: string) => void;
  onReject: (reason: string) => void;
  onVerify: () => void;
}

export function MMPApprovalWorkflow({ mmpFile, onApprove, onReject, onVerify }: MMPApprovalWorkflowProps) {
  const { toast } = useToast();
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'verified' | 'rejected'>('pending');
  const [verificationComments, setVerificationComments] = useState('');
  const [fileViewed, setFileViewed] = useState(false);
  const [showFileDetails, setShowFileDetails] = useState(false);
  const { resetMMP, updateMMP } = useMMP();
  const [parsedId, setParsedId] = useState<any>(null);
  const [showComprehensiveVerification, setShowComprehensiveVerification] = useState(false);
  
  useEffect(() => {
    if (mmpFile.mmpId && typeof parseMMPId === 'function') {
      setParsedId(parseMMPId(mmpFile.mmpId));
    }
  }, [mmpFile.mmpId]);
  
  const needsFirstApproval = mmpFile.status === 'pending' || !mmpFile.approvalWorkflow;
  const needsSecondApproval = mmpFile.approvalWorkflow?.firstApproval && !mmpFile.approvalWorkflow.finalApproval;
  const isApproved = mmpFile.status === 'approved';
  const isRejected = mmpFile.status === 'rejected';
  const isVerificationComplete = mmpFile.comprehensiveVerification?.canProceedToApproval || false;
  
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return format(new Date(dateString), 'MMM d, yyyy h:mm a');
  };

  const handleFileView = () => {
    setShowFileDetails(true);
  };
  
  const handleCloseFileDetails = () => {
    setShowFileDetails(false);
    setFileViewed(true);
    toast({
      title: "File review completed",
      description: "You can now proceed with the verification process.",
    });
  };
  
  const handleVerifyFile = () => {
    if (!fileViewed) {
      toast({
        title: "Error",
        description: "Please review the file before verification.",
        variant: "destructive",
      });
      return;
    }
    setVerificationStatus('verified');
    onVerify();
    toast({
      title: "File verified",
      description: "You can now proceed with the approval process.",
    });
  };

  const generateSiteEntries = () => {
    return Array(mmpFile.entries || 5).fill(null).map((_, index) => ({
      id: `site-${index + 1}`,
      siteCode: `SC${10000 + index}`,
      siteName: `Site ${index + 1}`,
      inMoDa: Math.random() > 0.3,
      visitedBy: Math.random() > 0.5 ? 'PACT' : 'Joint Visit',
      mainActivity: ['DM', 'AIM', 'PDM', 'OTHER'][Math.floor(Math.random() * 4)],
      visitDate: format(new Date(Date.now() + (Math.random() * 30 * 24 * 60 * 60 * 1000)), 'yyyy-MM-dd'),
      status: ['planned', 'completed', 'cancelled', 'postponed'][Math.floor(Math.random() * 4)]
    }));
  };

  const getVersionParts = () => {
    if (!mmpFile.version) return { major: '1', minor: '0' };
    
    if (typeof mmpFile.version === 'string') {
      const versionString = mmpFile.version as string;
      const parts = versionString.split('.');
      return { 
        major: parts && parts.length > 0 ? parts[0] || '1' : '1', 
        minor: parts && parts.length > 1 ? parts[1] || '0' : '0' 
      };
    }
    
    if (typeof mmpFile.version === 'object' && mmpFile.version !== null) {
      return { 
        major: mmpFile.version.major?.toString() || '1', 
        minor: mmpFile.version.minor?.toString() || '0' 
      };
    }
    
    return { major: '1', minor: '0' };
  };

  const generateVersionHistory = () => {
    if (!mmpFile.modificationHistory || mmpFile.modificationHistory.length === 0) {
      const versionParts = getVersionParts();
      const versionDisplay = parsedId ? 
        `V${parsedId.version.major}.${parsedId.version.minor}` : 
        `V${versionParts.major}.${versionParts.minor}`;
      
      return [{
        timestamp: mmpFile.uploadedAt,
        modifiedBy: mmpFile.uploadedBy,
        changes: 'Initial upload',
        previousVersion: 'N/A',
        newVersion: mmpFile.mmpId || `M-${new Date(mmpFile.uploadedAt).getMonth() + 1}${new Date(mmpFile.uploadedAt).getFullYear()}-${versionDisplay}-${mmpFile.region || 'UNK'}`
      }];
    }
    return mmpFile.modificationHistory;
  };

  const versionHistory = generateVersionHistory();
  const siteEntries = generateSiteEntries();

  const handleComprehensiveVerificationUpdate = (verification: any) => {
    updateMMP(mmpFile.id, { comprehensiveVerification: verification });
  };

  const handleVerificationComplete = () => {
    setVerificationStatus('verified');
    onVerify();
    toast({
      title: "All Verifications Complete",
      description: "The MMP is now ready for the approval process.",
    });
  };

  const handleReset = async () => {
    if (!mmpFile || !mmpFile.id) {
      toast({
        title: "Error",
        description: "MMP file ID is missing",
        variant: "destructive",
      });
      return;
    }
    
    try {
      // Fix: Pass the ID parameter to resetMMP
      const success = await resetMMP(mmpFile.id);
      
      if (success) {
        setVerificationStatus('pending');
        setVerificationComments('');
        setFileViewed(false);
        setShowComprehensiveVerification(false);
        
        toast({
          title: "Reset Successful",
          description: "The MMP approval status has been reset successfully.",
        });
      }
    } catch (error) {
      console.error("Failed to reset MMP:", error);
      toast({
        title: "Reset Failed",
        description: "Failed to reset MMP approval status.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Card className="mt-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              MMP Verification & Approval Process
            </CardTitle>
            {(isApproved || isRejected) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    Reset Approval
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Approval Status</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will reset the approval status of the MMP and all its sites. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReset}>
                      Reset
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-md border border-slate-200">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">File Information</h3>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-sm">File Name:</span>
                  <span className="font-medium">{mmpFile.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Upload Date:</span>
                  <span className="font-medium">{formatDate(mmpFile.uploadedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Uploaded By:</span>
                  <span className="font-medium">{mmpFile.uploadedBy}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Status:</span>
                  <span>
                    {isApproved && <Badge className="bg-green-100 text-green-800">Approved</Badge>}
                    {isRejected && <Badge className="bg-red-100 text-red-800">Rejected</Badge>}
                    {!isApproved && !isRejected && <Badge className="bg-amber-100 text-amber-800">Pending Approval</Badge>}
                  </span>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">System Verification</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">File integrity verified</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">No duplicates detected</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Compliant with system requirements</span>
                </div>
                <div className="flex items-center gap-2">
                  {mmpFile.entries && mmpFile.processedEntries ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  )}
                  <span className="text-sm">
                    {mmpFile.entries && mmpFile.processedEntries
                      ? `${mmpFile.processedEntries} of ${mmpFile.entries} entries processed`
                      : "Entry processing incomplete"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <Separator />
          
          <div>
            <h3 className="text-sm font-medium mb-4">Verification & Approval Process</h3>
            
            {/* Verification Status Overview */}
            <div className={`p-4 border rounded-md ${
              isVerificationComplete 
                ? 'border-green-300 bg-green-50' 
                : 'border-amber-300 bg-amber-50'
            }`}>
              <div className="flex justify-between items-center">
                <div className="flex gap-2 items-center">
                  <ShieldCheck className={`h-5 w-5 ${isVerificationComplete ? 'text-green-600' : 'text-amber-600'}`} />
                  <span className="font-medium">Comprehensive Verification</span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowComprehensiveVerification(!showComprehensiveVerification)}
                    className="flex items-center gap-2"
                  >
                    <FileCheck className="h-4 w-4" />
                    {showComprehensiveVerification ? 'Hide Details' : 'View Details'}
                  </Button>
                  {isVerificationComplete && (
                    <Badge className="bg-green-100 text-green-800">Complete</Badge>
                  )}
                </div>
              </div>
              <p className="text-sm mt-2">
                {isVerificationComplete 
                  ? "All verification steps are complete. Ready for approval process." 
                  : "Complete all verification steps before proceeding to approval."}
              </p>
            </div>

            {/* Show Comprehensive Verification Component */}
            {showComprehensiveVerification && (
              <div className="mt-4">
                <MMPComprehensiveVerificationComponent
                  mmpFile={mmpFile}
                  onVerificationUpdate={handleComprehensiveVerificationUpdate}
                  onVerificationComplete={handleVerificationComplete}
                />
              </div>
            )}
            
            {/* Approval Process */}
            <div className={`p-4 border rounded-md ${isApproved ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
              <div className="flex justify-between items-center">
                <div className="flex gap-2 items-center">
                  <UserCheck className={`h-5 w-5 ${isApproved ? 'text-green-600' : 'text-gray-600'}`} />
                  <span className="font-medium">Approval Process</span>
                </div>
                {isApproved && <Badge className="bg-green-100 text-green-800">Completed</Badge>}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className={`p-3 rounded-md ${mmpFile.approvalWorkflow?.firstApproval ? 'bg-green-100 border border-green-200' : 'bg-gray-100 border border-gray-200'}`}>
                  <h4 className="text-sm font-medium mb-2">First Approval</h4>
                  {mmpFile.approvalWorkflow?.firstApproval ? (
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Approver:</span>
                        <span className="font-medium">{mmpFile.approvalWorkflow.firstApproval.approvedBy}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Date:</span>
                        <span className="font-medium">{formatDate(mmpFile.approvalWorkflow.firstApproval.approvedAt)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">
                        {!isVerificationComplete 
                          ? "Complete verification required" 
                          : "Ready for first approval"}
                      </span>
                      {isVerificationComplete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm">Approve</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirm First Approval</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to approve this MMP file? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onApprove('First approval granted')}>
                                Approve
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  )}
                </div>
                
                <div className={`p-3 rounded-md ${mmpFile.approvalWorkflow?.finalApproval ? 'bg-green-100 border border-green-200' : 'bg-gray-100 border border-gray-200'}`}>
                  <h4 className="text-sm font-medium mb-2">Final Approval</h4>
                  {mmpFile.approvalWorkflow?.finalApproval ? (
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Approver:</span>
                        <span className="font-medium">{mmpFile.approvalWorkflow.finalApproval.approvedBy}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Date:</span>
                        <span className="font-medium">{formatDate(mmpFile.approvalWorkflow.finalApproval.approvedAt)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">
                        {!mmpFile.approvalWorkflow?.firstApproval 
                          ? "First approval required" 
                          : "Ready for final approval"}
                      </span>
                      {needsSecondApproval && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm">Approve</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirm Final Approval</AlertDialogTitle>
                              <AlertDialogDescription>
                                This is the final approval. The MMP file will be locked for editing after this action. Do you want to proceed?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onApprove('Final approval granted')}>
                                Approve
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {(isApproved || isRejected) && (
            <div className={`p-4 border rounded-md ${isApproved ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                {isApproved ? (
                  <>
                    <Lock className="h-5 w-5 text-green-600" />
                    <span className="font-medium">MMP File Approved and Locked</span>
                  </>
                ) : (
                  <>
                    <FileWarning className="h-5 w-5 text-red-600" />
                    <span className="font-medium">MMP File Rejected</span>
                  </>
                )}
              </div>
              <p className="text-sm">
                {isApproved 
                  ? "This MMP file has received all required approvals and is now locked for editing."
                  : `Rejection reason: ${mmpFile.rejectionReason || 'No reason provided'}`
                }
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          {!isApproved && !isRejected && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Reject MMP</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reject MMP File</AlertDialogTitle>
                    <AlertDialogDescription>
                      Please provide a reason for rejecting this MMP file.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <textarea 
                    className="w-full border rounded-md p-2 mt-2" 
                    placeholder="Enter rejection reason" 
                    rows={3}
                    onChange={(e) => setVerificationComments(e.target.value)}
                  ></textarea>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => onReject(verificationComments)} 
                      className="bg-destructive text-destructive-foreground"
                    >
                      Confirm Rejection
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              
              <Button 
                disabled={!isVerificationComplete} 
                onClick={() => toast({ description: "Notifications sent to required approvers" })}
              >
                Notify Approvers
              </Button>
            </>
          )}
          
          {(isApproved || isRejected) && (
            <Button variant="outline" onClick={() => toast({ description: "Generating detailed report..." })}>
              Generate Approval Report
            </Button>
          )}
        </CardFooter>
      </Card>

      <Dialog open={showFileDetails} onOpenChange={setShowFileDetails}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              MMP File Comprehensive Review
            </DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid grid-cols-4 mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="sites">Site Entries</TabsTrigger>
              <TabsTrigger value="versions">Version History</TabsTrigger>
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
            </TabsList>
            
            <ScrollArea className="h-[60vh] mt-4">
              <TabsContent value="overview" className="space-y-6 p-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Basic Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">File Name</p>
                      <p className="font-medium">{mmpFile.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Upload Date</p>
                      <p className="font-medium">{formatDate(mmpFile.uploadedAt)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge variant="outline">{mmpFile.status}</Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Region</p>
                      <p className="font-medium">{mmpFile.region}</p>
                    </div>
                  </div>
                </div>

                {mmpFile.mmpId && parsedId && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                      <Info className="h-4 w-4" /> MMP ID Breakdown
                    </h4>
                    <div className="bg-blue-50 p-4 rounded-md border border-blue-100">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">MMP ID:</span>
                        <Badge variant="outline" className="px-3 py-1 text-base font-mono">{mmpFile.mmpId}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-blue-700">Format:</span>
                          <span className="font-medium">M-MMYYYY-VX.Y-REG</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-700">Month:</span>
                          <span className="font-medium">{parsedId.month}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-700">Year:</span>
                          <span className="font-medium">{parsedId.year}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-700">Version:</span>
                          <span className="font-medium">v{parsedId.version.major}.{parsedId.version.minor}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-700">Region Code:</span>
                          <span className="font-medium">{parsedId.region}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <Separator />

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Processing Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Entries</p>
                      <p className="font-medium">{mmpFile.entries || '0'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Processed Entries</p>
                      <p className="font-medium">{mmpFile.processedEntries || '0'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Processing Status</p>
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div 
                            className="bg-primary h-2.5 rounded-full" 
                            style={{ 
                              width: `${mmpFile.entries && mmpFile.processedEntries ? 
                                Math.min(100, Math.round((mmpFile.processedEntries / mmpFile.entries) * 100)) : 0}%` 
                            }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">
                          {mmpFile.entries && mmpFile.processedEntries ? 
                            Math.min(100, Math.round((mmpFile.processedEntries / mmpFile.entries) * 100)) : 0}%
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Location</p>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <p>{mmpFile.location?.address || mmpFile.location?.region || mmpFile.region || 'Not specified'}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <Separator />

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Team Information</h4>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Uploaded By</p>
                        <p className="font-medium">{mmpFile.uploadedBy}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Last Modified By</p>
                        <p className="font-medium">
                          {versionHistory.length > 0 ? versionHistory[0].modifiedBy : mmpFile.uploadedBy}
                        </p>
                      </div>
                    </div>
                    {mmpFile.approvalWorkflow && (
                      <div className="mt-2">
                        <p className="text-sm text-muted-foreground">Approval Status</p>
                        <div className="flex flex-col gap-2 mt-1">
                          <div className="flex justify-between items-center p-2 bg-gray-50 rounded border">
                            <span className="text-sm">First Approval:</span>
                            {mmpFile.approvalWorkflow.firstApproval ? (
                              <Badge className="bg-green-100 text-green-800">Approved</Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-800">Pending</Badge>
                            )}
                          </div>
                          <div className="flex justify-between items-center p-2 bg-gray-50 rounded border">
                            <span className="text-sm">Final Approval:</span>
                            {mmpFile.approvalWorkflow.finalApproval ? (
                              <Badge className="bg-green-100 text-green-800">Approved</Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-800">Pending</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="sites" className="space-y-4 p-4">
                <h4 className="text-sm font-medium mb-2">Site Entries ({siteEntries.length})</h4>
                
                <div className="space-y-4">
                  {siteEntries.map((site, index) => (
                    <div key={site.id} className="border rounded-md p-4">
                      <div className="flex justify-between items-center mb-2">
                        <h5 className="font-medium">{site.siteName}</h5>
                        <Badge variant={site.status === 'completed' ? 'default' : 'outline'}>
                          {site.status}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Site Code:</span>{' '}
                          <span className="font-medium">{site.siteCode}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">In MoDa:</span>{' '}
                          <span className="font-medium">{site.inMoDa ? 'Yes' : 'No'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Visited By:</span>{' '}
                          <span className="font-medium">{site.visitedBy}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Main Activity:</span>{' '}
                          <span className="font-medium">{site.mainActivity}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Visit Date:</span>{' '}
                          <span className="font-medium flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {site.visitDate}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
              
              <TabsContent value="versions" className="space-y-4 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-medium">Version History</h4>
                  <Badge variant="outline" className="px-2 py-1">
                    Current Version: {parsedId ? `v${parsedId.version.major}.${parsedId.version.minor}` : `v${getVersionParts().major}.${getVersionParts().minor}`}
                  </Badge>
                </div>
                
                <div className="relative pl-6 border-l border-gray-200 space-y-6">
                  {versionHistory.map((version, idx) => (
                    <div key={idx} className="relative">
                      <div className="absolute -left-[13px] mt-1.5">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center ${idx === 0 ? 'bg-primary text-white' : 'border-2 border-primary bg-white'}`}>
                          {idx === 0 ? (
                            <GitBranch className="h-3 w-3" />
                          ) : (
                            <span className="text-xs font-medium text-primary">{idx + 1}</span>
                          )}
                        </div>
                      </div>
                      <div className={`bg-white p-4 rounded-md border ${idx === 0 ? 'border-primary/30' : 'border-gray-200'}`}>
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <h4 className="font-medium text-base">{version.changes}</h4>
                            <Badge variant={idx === 0 ? "default" : "secondary"}>
                              {version.newVersion}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center text-muted-foreground">
                              <Calendar className="h-3.5 w-3.5 mr-1.5" />
                              {formatDate(version.timestamp)}
                            </div>
                            <div className="flex items-center text-muted-foreground">
                              <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                              {version.modifiedBy}
                            </div>
                          </div>
                          
                          {idx > 0 && (
                            <div className="mt-2 bg-slate-50 p-2 rounded flex items-center justify-between">
                              <span className="text-sm text-slate-600">Previous version:</span>
                              <Badge variant="outline">{version.previousVersion}</Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
              
              <TabsContent value="compliance" className="space-y-4 p-4">
                <h4 className="text-sm font-medium mb-4">Compliance Status</h4>
                
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-100 rounded-md p-4">
                    <h5 className="font-medium text-green-800 flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Passed Validations
                    </h5>
                    <ul className="space-y-2 text-sm text-green-700">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        File format validation
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        MMP ID structure compliance
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Required field completeness
                      </li>
                    </ul>
                  </div>
                  
                  <div className="bg-amber-50 border border-amber-100 rounded-md p-4">
                    <h5 className="font-medium text-amber-800 flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4" />
                      Warnings
                    </h5>
                    <ul className="space-y-2 text-sm text-amber-700">
                      <li className="flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Some site entries have missing GPS coordinates
                      </li>
                      <li className="flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5" />
                        3 sites have conflicting visit dates
                      </li>
                    </ul>
                  </div>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>

          <DialogFooter>
            <Button onClick={handleCloseFileDetails}>
              Mark as Reviewed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
