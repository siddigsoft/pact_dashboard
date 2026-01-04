import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { MMPFile } from '@/types';
import { format } from 'date-fns';
import { CheckCircle2, AlertCircle, Clock, FileText, Shield, MapPin, Calendar, User, DollarSign, ListChecks, TrendingUp } from 'lucide-react';
import PermitPreviewDialog from '@/components/permits/PermitPreviewDialog';

interface MMPProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mmpFile: MMPFile | null;
}

const MMPProgressDialog: React.FC<MMPProgressDialogProps> = ({ open, onOpenChange, mmpFile }) => {
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewFile, setPreviewFile] = React.useState<{ url?: string; name: string }>({ name: '' });

  if (!mmpFile) return null;

  const handlePreviewPermit = (permit: any) => {
    setPreviewFile({
      url: permit.fileUrl,
      name: `${permit.type} Permit - ${permit.fileName || 'Unnamed'}`
    });
    setPreviewOpen(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-amber-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-red-600" />;
    }
  };

  const calculateProgress = () => {
    let completed = 0;
    let total = 6; // Upload, First Approval, Final Approval, Permits, Site Processing, Verification

    if (mmpFile.status !== 'pending') completed++;
    if (mmpFile.approvalWorkflow?.firstApproval) completed++;
    if (mmpFile.approvalWorkflow?.finalApproval) completed++;
    if (mmpFile.permits?.federal) completed++;
    if (mmpFile.processedEntries && mmpFile.entries && mmpFile.processedEntries >= mmpFile.entries) completed++;
    if (mmpFile.comprehensiveVerification?.overallStatus === 'complete') completed++;

    return Math.round((completed / total) * 100);
  };

  const progress = calculateProgress();

  // Helper to get responsible person names from workflow
  const getResponsiblePersons = (type: 'fom' | 'coordinator') => {
    const workflow = mmpFile.workflow as any;
    if (!workflow) return [];

    if (type === 'fom') {
      return workflow.forwardedToFomIds || [];
    } else if (type === 'coordinator') {
      return workflow.forwardedToCoordinatorIds || [];
    }
    return [];
  };

  const fomIds = getResponsiblePersons('fom');
  const coordinatorIds = getResponsiblePersons('coordinator');

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              MMP Progress: {mmpFile.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Overall Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Overall Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Completion</span>
                    <span className="text-sm font-bold">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-3" />
                  <div className="text-xs text-muted-foreground">
                    Based on upload, approvals, permits, site processing, and verification status.
                  </div>
                  {fomIds.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Responsible FOM(s): {fomIds.join(', ')}
                    </div>
                  )}
                  {coordinatorIds.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Responsible Coordinator(s): {coordinatorIds.join(', ')}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* MMP Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  MMP Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">MMP ID</span>
                    <p className="font-mono font-medium">{mmpFile.mmpId || 'Not assigned'}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Project Name</span>
                    <p>{mmpFile.projectName || mmpFile.name || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Status</span>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(mmpFile.status)}
                      <Badge variant="outline">{mmpFile.status}</Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Hub</span>
                    <p>{mmpFile.hub || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Month</span>
                    <p>{mmpFile.month ? new Date(2024, parseInt(mmpFile.month) - 1).toLocaleDateString('en-US', { month: 'long' }) : 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Uploaded</span>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p>{format(new Date(mmpFile.uploadedAt), 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Uploaded By</span>
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <p>{mmpFile.uploadedBy || 'Unknown'}</p>
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Total Entries</span>
                    <p className="font-medium">{mmpFile.entries || 0}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Processed Entries</span>
                    <p className="font-medium">{mmpFile.processedEntries || 0}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Region</span>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <p>{mmpFile.region || 'N/A'}</p>
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Workflow Stage</span>
                    <p>{(mmpFile.workflow as any)?.currentStage || 'draft'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Site Entries Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ListChecks className="h-5 w-5" />
                  Site Entries Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 border rounded">
                    <div className="text-xl font-bold text-green-600">{mmpFile.entries || 0}</div>
                    <div className="text-sm text-muted-foreground">Total Sites</div>
                  </div>
                  <div className="text-center p-4 border rounded">
                    <div className="text-xl font-bold text-green-600">{mmpFile.processedEntries || 0}</div>
                    <div className="text-sm text-muted-foreground">Processed</div>
                  </div>
                  <div className="text-center p-4 border rounded">
                    <div className="text-xl font-bold text-amber-600">{(mmpFile.entries || 0) - (mmpFile.processedEntries || 0)}</div>
                    <div className="text-sm text-muted-foreground">Remaining</div>
                    {coordinatorIds.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Pending verification by: {coordinatorIds.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
                {mmpFile.siteEntries && mmpFile.siteEntries.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">Recent Sites</h4>
                    <div className="space-y-2">
                      {mmpFile.siteEntries.slice(0, 3).map((site: any, index: number) => (
                        <div key={index} className="flex justify-between text-sm p-2 bg-muted/50 rounded">
                          <span>{site.siteName || site.site_code || `Site ${index + 1}`}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{site.status || 'pending'}</Badge>
                            {site.status === 'pending' && coordinatorIds.length > 0 && (
                              <span className="text-xs text-muted-foreground">Awaiting: {coordinatorIds[0]}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Status Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-2">
                      {mmpFile.status !== 'pending' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-amber-600" />}
                      <div>
                        <span className="text-sm font-medium">MMP Upload</span>
                        <p className="text-xs text-muted-foreground">File uploaded and processed</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={mmpFile.status !== 'pending' ? 'default' : 'secondary'}>
                        {mmpFile.status !== 'pending' ? 'Done' : 'Pending'}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        By: {mmpFile.uploadedBy || 'Unknown'}
                      </p>
                      {mmpFile.uploadedAt && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(mmpFile.uploadedAt), 'MMM d, yyyy \'at\' h:mm a')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-2">
                      {mmpFile.approvalWorkflow?.firstApproval ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-amber-600" />}
                      <div>
                        <span className="text-sm font-medium">First Approval</span>
                        <p className="text-xs text-muted-foreground">Initial review and approval</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={mmpFile.approvalWorkflow?.firstApproval ? 'default' : 'secondary'}>
                        {mmpFile.approvalWorkflow?.firstApproval ? 'Done' : 'Pending'}
                      </Badge>
                      {mmpFile.approvalWorkflow?.firstApproval ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          By: {mmpFile.approvalWorkflow.firstApproval.approvedBy || 'Unknown'}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">
                          Awaiting: Admin/ICT
                        </p>
                      )}
                      {mmpFile.approvalWorkflow?.firstApproval?.approvedAt && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(mmpFile.approvalWorkflow.firstApproval.approvedAt), 'MMM d, yyyy \'at\' h:mm a')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-2">
                      {mmpFile.approvalWorkflow?.finalApproval ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-amber-600" />}
                      <div>
                        <span className="text-sm font-medium">Final Approval</span>
                        <p className="text-xs text-muted-foreground">Final review and approval</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={mmpFile.approvalWorkflow?.finalApproval ? 'default' : 'secondary'}>
                        {mmpFile.approvalWorkflow?.finalApproval ? 'Done' : 'Pending'}
                      </Badge>
                      {mmpFile.approvalWorkflow?.finalApproval ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          By: {mmpFile.approvalWorkflow.finalApproval.approvedBy || 'Unknown'}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">
                          Awaiting: Super Admin
                        </p>
                      )}
                      {mmpFile.approvalWorkflow?.finalApproval?.approvedAt && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(mmpFile.approvalWorkflow.finalApproval.approvedAt), 'MMM d, yyyy \'at\' h:mm a')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-2">
                      {mmpFile.permits?.federal ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}
                      <div>
                        <span className="text-sm font-medium">Federal Permit</span>
                        <p className="text-xs text-muted-foreground">Required federal authorization</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={mmpFile.permits?.federal ? 'default' : 'destructive'}>
                        {mmpFile.permits?.federal ? 'Done' : 'Pending'}
                      </Badge>
                      {mmpFile.permits?.federal ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          Attached by: {fomIds.length > 0 ? fomIds.join(', ') : 'FOM'}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">
                          Awaiting: {fomIds.length > 0 ? fomIds.join(', ') : 'FOM'}
                        </p>
                      )}
                      {mmpFile.permits?.documents?.[0]?.uploadedAt && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(mmpFile.permits.documents[0].uploadedAt), 'MMM d, yyyy \'at\' h:mm a')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-2">
                      {(mmpFile.processedEntries || 0) >= (mmpFile.entries || 0) ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-amber-600" />}
                      <div>
                        <span className="text-sm font-medium">Site Processing</span>
                        <p className="text-xs text-muted-foreground">All site entries processed</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={(mmpFile.processedEntries || 0) >= (mmpFile.entries || 0) ? 'default' : 'secondary'}>
                        {(mmpFile.processedEntries || 0) >= (mmpFile.entries || 0) ? 'Done' : 'Pending'}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        Processed by: {coordinatorIds.length > 0 ? coordinatorIds.join(', ') : 'Coordinator'}
                      </p>
                      {(mmpFile.processedEntries || 0) >= (mmpFile.entries || 0) && mmpFile.updatedAt && (
                        <p className="text-xs text-muted-foreground">
                          Completed: {format(new Date(mmpFile.updatedAt), 'MMM d, yyyy \'at\' h:mm a')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-2">
                      {mmpFile.comprehensiveVerification?.overallStatus === 'complete' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-amber-600" />}
                      <div>
                        <span className="text-sm font-medium">Comprehensive Verification</span>
                        <p className="text-xs text-muted-foreground">All verification steps completed</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={mmpFile.comprehensiveVerification?.overallStatus === 'complete' ? 'default' : 'secondary'}>
                        {mmpFile.comprehensiveVerification?.overallStatus === 'complete' ? 'Done' : 'Pending'}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        Verified by: {coordinatorIds.length > 0 ? coordinatorIds.join(', ') : 'Coordinator'}
                      </p>
                      {mmpFile.comprehensiveVerification?.lastUpdated && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(mmpFile.comprehensiveVerification.lastUpdated), 'MMM d, yyyy \'at\' h:mm a')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Permit Statuses */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Permit Statuses
                </CardTitle>
              </CardHeader>
              <CardContent>
                {mmpFile.permits?.documents && mmpFile.permits.documents.length > 0 ? (
                  <div className="space-y-3">
                    {mmpFile.permits.documents.map((permit: any, index: number) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <Shield className="h-5 w-5 text-blue-600" />
                            <div>
                              <p className="font-medium capitalize">{permit.type} Permit</p>
                              <p className="text-sm text-muted-foreground">{permit.fileName}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={permit.validated ? 'default' : 'secondary'}>
                              {permit.validated ? 'Verified' : 'Pending'}
                            </Badge>
                            <button
                              onClick={() => handlePreviewPermit(permit)}
                              className="text-blue-600 hover:text-blue-800 text-sm underline"
                            >
                              Preview
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Issue Date:</span>
                            <p>{permit.issueDate ? format(new Date(permit.issueDate), 'MMM d, yyyy') : 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Expiry Date:</span>
                            <p>{permit.expiryDate ? format(new Date(permit.expiryDate), 'MMM d, yyyy') : 'N/A'}</p>
                          </div>
                        </div>
                        <div className="mt-2 text-sm">
                          <span className="text-muted-foreground">Attached by:</span>
                          <p>{permit.uploadedBy || fomIds.length > 0 ? fomIds.join(', ') : 'FOM'}</p>
                        </div>
                        {permit.uploadedAt && (
                          <div className="mt-1 text-sm">
                            <span className="text-muted-foreground">Attached on:</span>
                            <p>{format(new Date(permit.uploadedAt), 'MMM d, yyyy \'at\' h:mm a')}</p>
                          </div>
                        )}
                        {permit.comments && (
                          <div className="mt-2">
                            <span className="text-sm text-muted-foreground">Comments:</span>
                            <p className="text-sm">{permit.comments}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    <p className="text-muted-foreground">No permits uploaded yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Awaiting attachment by: {fomIds.length > 0 ? fomIds.join(', ') : 'FOM'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Approval Workflow Timeline */}
            {mmpFile.approvalWorkflow && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Approval Workflow Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {mmpFile.approvalWorkflow.firstApproval && (
                      <div className="flex items-start gap-3 p-3 border-l-4 border-green-500 bg-green-50 rounded">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                        <div>
                          <p className="font-medium">First Approval</p>
                          <p className="text-sm text-muted-foreground">
                            Approved by {mmpFile.approvalWorkflow.firstApproval.approvedBy} on {format(new Date(mmpFile.approvalWorkflow.firstApproval.approvedAt), 'MMM d, yyyy \'at\' h:mm a')}
                          </p>
                          {mmpFile.approvalWorkflow.firstApproval.comments && (
                            <p className="text-sm mt-1">{mmpFile.approvalWorkflow.firstApproval.comments}</p>
                          )}
                        </div>
                      </div>
                    )}
                    {!mmpFile.approvalWorkflow.firstApproval && (
                      <div className="flex items-start gap-3 p-3 border-l-4 border-amber-500 bg-amber-50 rounded">
                        <Clock className="h-5 w-5 text-amber-600 mt-0.5" />
                        <div>
                          <p className="font-medium">First Approval Pending</p>
                          <p className="text-sm text-muted-foreground">
                            Awaiting approval from Admin/ICT
                          </p>
                        </div>
                      </div>
                    )}
                    {mmpFile.approvalWorkflow.finalApproval && (
                      <div className="flex items-start gap-3 p-3 border-l-4 border-blue-500 bg-blue-50 rounded">
                        <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5" />
                        <div>
                          <p className="font-medium">Final Approval</p>
                          <p className="text-sm text-muted-foreground">
                            Approved by {mmpFile.approvalWorkflow.finalApproval.approvedBy} on {format(new Date(mmpFile.approvalWorkflow.finalApproval.approvedAt), 'MMM d, yyyy \'at\' h:mm a')}
                          </p>
                          {mmpFile.approvalWorkflow.finalApproval.comments && (
                            <p className="text-sm mt-1">{mmpFile.approvalWorkflow.finalApproval.comments}</p>
                          )}
                        </div>
                      </div>
                    )}
                    {!mmpFile.approvalWorkflow.finalApproval && mmpFile.approvalWorkflow.firstApproval && (
                      <div className="flex items-start gap-3 p-3 border-l-4 border-amber-500 bg-amber-50 rounded">
                        <Clock className="h-5 w-5 text-amber-600 mt-0.5" />
                        <div>
                          <p className="font-medium">Final Approval Pending</p>
                          <p className="text-sm text-muted-foreground">
                            Awaiting approval from Super Admin
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Financial Overview */}
            {(mmpFile.financial || mmpFile.siteEntries?.some((s: any) => s.cost)) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Financial Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {mmpFile.financial?.budget && (
                      <div className="text-center p-4 border rounded">
                        <div className="text-xl font-bold text-green-600">${mmpFile.financial.budget.toLocaleString()}</div>
                        <div className="text-sm text-muted-foreground">Budget</div>
                        <div className="text-xs text-muted-foreground mt-1">Allocated by: Admin</div>
                        {mmpFile.financial.allocatedAt && (
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(mmpFile.financial.allocatedAt), 'MMM d, yyyy \'at\' h:mm a')}
                          </div>
                        )}
                      </div>
                    )}
                    {mmpFile.siteEntries && (
                      <div className="text-center p-4 border rounded">
                        <div className="text-xl font-bold text-blue-600">
                          ${mmpFile.siteEntries.reduce((sum: number, s: any) => sum + (s.cost || 0), 0).toLocaleString()}
                        </div>
                        <div className="text-sm text-muted-foreground">Total Site Costs</div>
                        <div className="text-xs text-muted-foreground mt-1">Calculated from site entries</div>
                      </div>
                    )}
                    <div className="text-center p-4 border rounded">
                      <div className="text-xl font-bold text-purple-600">
                        {mmpFile.siteEntries?.filter((s: any) => s.cost).length || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Sites with Costs</div>
                      <div className="text-xs text-muted-foreground mt-1">Assigned by: Coordinator</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Permit Preview Dialog */}
      <PermitPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        fileUrl={previewFile.url}
        fileName={previewFile.name}
      />
    </>
  );
};

export default MMPProgressDialog;
