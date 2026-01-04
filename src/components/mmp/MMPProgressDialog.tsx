import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { MMPFile } from '@/types';
import { format } from 'date-fns';
import { CheckCircle2, AlertCircle, Clock, FileText, Shield, MapPin, Calendar, User, DollarSign, ListChecks, TrendingUp } from 'lucide-react';
import PermitPreviewDialog from '@/components/permits/PermitPreviewDialog';
import { useAppContext } from '@/context/AppContext';

interface MMPProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mmpFile: MMPFile | null;
}

const MMPProgressDialog: React.FC<MMPProgressDialogProps> = ({ open, onOpenChange, mmpFile }) => {
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewFile, setPreviewFile] = React.useState<{ url?: string; name: string }>({ name: '' });
  const [showAllSites, setShowAllSites] = React.useState(false);
  const [selectedSite, setSelectedSite] = React.useState<any>(null);

  const { currentUser, users } = useAppContext();

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
    let total = 3; // Upload, Permits, Verification

    if (mmpFile.status !== 'pending') completed++;
    if (mmpFile.permits?.federal) completed++;
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

  // Helper to get user name by ID
  const getUserName = (userId: string | undefined) => {
    if (!userId) return 'Unknown';
    const user = users.find(u => u.id === userId);
    return user?.fullName || user?.username || user?.email || 'Unknown';
  };

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
                      Responsible FOM(s): FOM Team
                    </div>
                  )}
                  {coordinatorIds.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Responsible Coordinator(s): Coordinator Team
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
                        Pending verification by: Coordinator Team
                      </div>
                    )}
                  </div>
                </div>
                {mmpFile.siteEntries && mmpFile.siteEntries.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium">Sites</h4>
                      <button
                        onClick={() => setShowAllSites(!showAllSites)}
                        className="text-blue-600 hover:text-blue-800 text-sm underline"
                      >
                        {showAllSites ? 'Show Less' : 'Show All'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {(showAllSites ? mmpFile.siteEntries : mmpFile.siteEntries.slice(0, 3)).map((site: any, index: number) => (
                        <div
                          key={index}
                          className="flex justify-between text-sm p-2 bg-muted/50 rounded cursor-pointer hover:bg-muted"
                          onClick={() => setSelectedSite(site)}
                        >
                          <span>{site.siteName || site.site_code || `Site ${index + 1}`}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{site.status || 'pending'}</Badge>
                            {site.status === 'pending' && coordinatorIds.length > 0 && (
                              <span className="text-xs text-muted-foreground">Awaiting: Coordinator Team</span>
                            )}
                            {site.status !== 'pending' && (site as any).completedAt && (
                              <span className="text-xs text-muted-foreground">
                                {format(new Date((site as any).completedAt), 'MMM d, h:mm a')}
                              </span>
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
                          Attached by: FOM Team
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">
                          Awaiting: FOM Team
                        </p>
                      )}
                      {mmpFile.permits?.federal && mmpFile.permits.documents?.[0] && (
                        <div className="mt-1 space-y-1">
                          <p className="text-xs text-muted-foreground">
                            Issue Date: {mmpFile.permits.documents[0].issueDate ? format(new Date(mmpFile.permits.documents[0].issueDate), 'MMM d, yyyy') : 'N/A'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Expiry Date: {mmpFile.permits.documents[0].expiryDate ? format(new Date(mmpFile.permits.documents[0].expiryDate), 'MMM d, yyyy') : 'N/A'}
                          </p>
                        </div>
                      )}
                      {mmpFile.permits?.documents?.[0]?.uploadedAt && (
                        <p className="text-xs text-muted-foreground">
                          Date of attachment: {format(new Date(mmpFile.permits.documents[0].uploadedAt), 'MMM d, yyyy \'at\' h:mm a')}
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
                        Verified by: Coordinator Team
                      </p>
                      {mmpFile.comprehensiveVerification?.lastUpdated && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(mmpFile.comprehensiveVerification.lastUpdated), 'MMM d, yyyy \'at\' h:mm a')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Coordinator Assignments Section */}
                  <div className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-2">
                      {coordinatorIds.length > 0 ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-amber-600" />}
                      <div>
                        <span className="text-sm font-medium">Coordinator Assignments</span>
                        <p className="text-xs text-muted-foreground">Coordinators assigned to states/localities</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={coordinatorIds.length > 0 ? 'default' : 'secondary'}>
                        {coordinatorIds.length > 0 ? 'Assigned' : 'Pending'}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        Assigned by: FOM Team
                      </p>
                      <details className="mt-2">
                        <summary className="text-blue-600 hover:text-blue-800 text-xs underline cursor-pointer">
                          View Assignments ({coordinatorIds.length})
                        </summary>
                        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                          {coordinatorIds.length > 0 ? (
                            coordinatorIds.map((id: string) => (
                              <div key={id} className="text-xs text-muted-foreground">
                                • {getUserName(id)}
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              No coordinators assigned yet. Check workflow data.
                            </div>
                          )}
                        </div>
                      </details>
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
                      Awaiting attachment by: FOM Team
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
                    {(mmpFile.financial as any)?.budget && (
                      <div className="text-center p-4 border rounded">
                        <div className="text-xl font-bold text-green-600">${(mmpFile.financial as any).budget.toLocaleString()}</div>
                        <div className="text-sm text-muted-foreground">Budget</div>
                        <div className="text-xs text-muted-foreground mt-1">Allocated by: Admin</div>
                        {(mmpFile.financial as any).allocatedAt && (
                          <div className="text-xs text-muted-foreground">
                            {format(new Date((mmpFile.financial as any).allocatedAt), 'MMM d, yyyy \'at\' h:mm a')}
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

      {/* Site Details Dialog */}
      {selectedSite && (
        <Dialog open={!!selectedSite} onOpenChange={() => setSelectedSite(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Site Details: {selectedSite.siteName || selectedSite.site_code || 'Unnamed Site'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {/* Site Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Site Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">Site Name</span>
                      <p>{selectedSite.siteName || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">Site Code</span>
                      <p>{selectedSite.site_code || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">Status</span>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(selectedSite.status)}
                        <Badge variant="outline">{selectedSite.status || 'pending'}</Badge>
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">Cost</span>
                      <p>${selectedSite.cost ? selectedSite.cost.toLocaleString() : 'N/A'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Process Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Process Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <div>
                          <span className="text-sm font-medium">MMP Upload</span>
                          <p className="text-xs text-muted-foreground">MMP file uploaded</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="default">Done</Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Responsible: {mmpFile.uploadedBy || 'Unknown'}
                        </p>
                        {mmpFile.uploadedAt && (
                          <p className="text-xs text-muted-foreground">
                            Completed: {format(new Date(mmpFile.uploadedAt), 'MMM d, yyyy \'at\' h:mm a')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-2">
                        {mmpFile.permits?.federal ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}
                        <div>
                          <span className="text-sm font-medium">Federal Permit</span>
                          <p className="text-xs text-muted-foreground">Federal authorization</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={mmpFile.permits?.federal ? 'default' : 'destructive'}>
                          {mmpFile.permits?.federal ? 'Done' : 'Pending'}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Responsible: FOM Team
                        </p>
                        {mmpFile.permits?.federal && mmpFile.permits.documents?.[0]?.uploadedAt && (
                          <p className="text-xs text-muted-foreground">
                            Completed: {format(new Date(mmpFile.permits.documents[0].uploadedAt), 'MMM d, yyyy \'at\' h:mm a')}
                          </p>
                        )}
                        {mmpFile.permits?.federal && (
                          <button
                            onClick={() => handlePreviewPermit(mmpFile.permits.documents?.[0] || { fileUrl: '', fileName: 'Federal Permit' })}
                            className="text-blue-600 hover:text-blue-800 text-xs underline mt-1"
                          >
                            Preview Permit
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-2">
                        {(mmpFile.permits?.documents?.some((p: any) => p.type === 'state') || false) ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}
                        <div>
                          <span className="text-sm font-medium">State Permit</span>
                          <p className="text-xs text-muted-foreground">State authorization</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={(mmpFile.permits?.documents?.some((p: any) => p.type === 'state') || false) ? 'default' : 'destructive'}>
                          {(mmpFile.permits?.documents?.some((p: any) => p.type === 'state') || false) ? 'Done' : 'Pending'}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Responsible: FOM/Coordinator
                        </p>
                        {(mmpFile.permits?.documents?.find((p: any) => p.type === 'state')?.uploadedAt) && (
                          <p className="text-xs text-muted-foreground">
                            Completed: {format(new Date(mmpFile.permits.documents.find((p: any) => p.type === 'state').uploadedAt), 'MMM d, yyyy \'at\' h:mm a')}
                          </p>
                        )}
                        {(mmpFile.permits?.documents?.some((p: any) => p.type === 'state') || false) && (
                          <button
                            onClick={() => handlePreviewPermit(mmpFile.permits.documents.find((p: any) => p.type === 'state'))}
                            className="text-blue-600 hover:text-blue-800 text-xs underline mt-1"
                          >
                            Preview Permit
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-2">
                        {(mmpFile.permits?.documents?.some((p: any) => p.type === 'locality') || false) ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}
                        <div>
                          <span className="text-sm font-medium">Locality Permit</span>
                          <p className="text-xs text-muted-foreground">Local authorization</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={(mmpFile.permits?.documents?.some((p: any) => p.type === 'locality') || false) ? 'default' : 'destructive'}>
                          {(mmpFile.permits?.documents?.some((p: any) => p.type === 'locality') || false) ? 'Done' : 'Pending'}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Responsible: Coordinator
                        </p>
                        {(mmpFile.permits?.documents?.find((p: any) => p.type === 'locality')?.uploadedAt) && (
                          <p className="text-xs text-muted-foreground">
                            Completed: {format(new Date(mmpFile.permits.documents.find((p: any) => p.type === 'locality').uploadedAt), 'MMM d, yyyy \'at\' h:mm a')}
                          </p>
                        )}
                        {(mmpFile.permits?.documents?.some((p: any) => p.type === 'locality') || false) && (
                          <button
                            onClick={() => handlePreviewPermit(mmpFile.permits.documents.find((p: any) => p.type === 'locality'))}
                            className="text-blue-600 hover:text-blue-800 text-xs underline mt-1"
                          >
                            Preview Permit
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-2">
                        {(selectedSite as any).visitDate ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-amber-600" />}
                        <div>
                          <span className="text-sm font-medium">Verification and Visit Date</span>
                          <p className="text-xs text-muted-foreground">Site verification and visit scheduling</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={(selectedSite as any).visitDate ? 'default' : 'secondary'}>
                          {(selectedSite as any).visitDate ? 'Done' : 'Pending'}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Responsible: Coordinator Team
                        </p>
                        {(selectedSite as any).visitDate && (
                          <p className="text-xs text-muted-foreground">
                            Visit Date: {format(new Date((selectedSite as any).visitDate), 'MMM d, yyyy \'at\' h:mm a')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-2">
                        {selectedSite.cost ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-amber-600" />}
                        <div>
                          <span className="text-sm font-medium">Site Cost</span>
                          <p className="text-xs text-muted-foreground">Cost assignment</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={selectedSite.cost ? 'default' : 'secondary'}>
                          {selectedSite.cost ? 'Done' : 'Pending'}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Responsible: Admin
                        </p>
                        {selectedSite.cost && (
                          <p className="text-xs text-muted-foreground">
                            Cost: ${selectedSite.cost.toLocaleString()}
                          </p>
                        )}
                        {(selectedSite as any).costSetBy && (
                          <p className="text-xs text-muted-foreground">
                            By: {getUserName((selectedSite as any).costSetBy)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-2">
                        {(selectedSite as any).claimedBy ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-amber-600" />}
                        <div>
                          <span className="text-sm font-medium">Claimed by</span>
                          <p className="text-xs text-muted-foreground">Site claimed for processing</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={(selectedSite as any).claimedBy ? 'default' : 'secondary'}>
                          {(selectedSite as any).claimedBy ? 'Done' : 'Pending'}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Responsible: Coordinator/Data Collector
                        </p>
                        {(selectedSite as any).claimedBy && (
                          <p className="text-xs text-muted-foreground">
                            Claimed by: {typeof (selectedSite as any).claimedBy === 'string' && (selectedSite as any).claimedBy.length < 20 ? getUserName((selectedSite as any).claimedBy) : (selectedSite as any).claimedBy}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-2">
                        {selectedSite.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-amber-600" />}
                        <div>
                          <span className="text-sm font-medium">Site Visit Status</span>
                          <p className="text-xs text-muted-foreground">Overall site status</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={selectedSite.status === 'completed' ? 'default' : 'secondary'}>
                          {selectedSite.status === 'completed' ? 'Completed' : 'Pending'}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Responsible: {selectedSite.status === 'completed' ? 'Coordinator Team' : 'Coordinator Team'}
                        </p>
                        {selectedSite.status !== 'completed' && (selectedSite as any).visitDate && (
                          <p className="text-xs text-muted-foreground">
                            Days to Visit: {Math.max(0, Math.floor((new Date((selectedSite as any).visitDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))} days
                          </p>
                        )}
                        {selectedSite.status === 'completed' && (selectedSite as any).completedAt && (
                          <p className="text-xs text-muted-foreground">
                            Completed: {format(new Date((selectedSite as any).completedAt), 'MMM d, yyyy \'at\' h:mm a')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default MMPProgressDialog;
