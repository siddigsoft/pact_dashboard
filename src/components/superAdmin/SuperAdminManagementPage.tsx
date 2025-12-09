import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useUser } from '@/context/user/UserContext';
import { ShieldCheck, UserPlus, UserX, Shield, AlertTriangle, CheckCircle2, XCircle, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

export function SuperAdminManagementPage() {
  const { toast } = useToast();
  const { currentUser, users, sendPasswordRecoveryEmail } = useUser();
  const {
    superAdmins,
    stats,
    loading,
    isSuperAdmin,
    canAddSuperAdmin,
    createSuperAdmin,
    deactivateSuperAdmin,
  } = useSuperAdmin();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedSuperAdminId, setSelectedSuperAdminId] = useState('');
  const [appointmentReason, setAppointmentReason] = useState('');
  const [deactivationReason, setDeactivationReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [passwordResetDialog, setPasswordResetDialog] = useState<{ open: boolean; user: { id: string; name: string; email: string } | null }>({ open: false, user: null });
  const [isSendingReset, setIsSendingReset] = useState(false);

  const handleCreate = async () => {
    if (!currentUser || !selectedUserId) return;

    if (!appointmentReason.trim()) {
      alert('Please provide a reason for this appointment');
      return;
    }

    setProcessing(true);
    const success = await createSuperAdmin({
      userId: selectedUserId,
      appointedBy: currentUser.id,
      appointmentReason,
    });

    setProcessing(false);
    if (success) {
      setShowCreateDialog(false);
      setSelectedUserId('');
      setAppointmentReason('');
    }
  };

  const handleDeactivate = async () => {
    if (!currentUser || !selectedSuperAdminId) return;

    if (!deactivationReason.trim()) {
      alert('Please provide a reason for deactivation');
      return;
    }

    setProcessing(true);
    const success = await deactivateSuperAdmin({
      superAdminId: selectedSuperAdminId,
      deactivatedBy: currentUser.id,
      deactivationReason,
    });

    setProcessing(false);
    if (success) {
      setShowDeactivateDialog(false);
      setSelectedSuperAdminId('');
      setDeactivationReason('');
    }
  };

  const openDeactivateDialog = (superAdminId: string) => {
    setSelectedSuperAdminId(superAdminId);
    setShowDeactivateDialog(true);
  };

  const handleOpenPasswordReset = (user: { id: string; name: string; email: string }) => {
    setPasswordResetDialog({ open: true, user });
  };

  const handleSendPasswordReset = async () => {
    if (!passwordResetDialog.user?.email) return;
    setIsSendingReset(true);
    try {
      const success = await sendPasswordRecoveryEmail(passwordResetDialog.user.email);
      if (success) {
        toast({
          title: "Password reset email sent",
          description: `A password reset link has been sent to ${passwordResetDialog.user.email}`,
        });
        setPasswordResetDialog({ open: false, user: null });
      }
    } catch (error) {
      console.error("Error sending password reset:", error);
      toast({
        title: "Error",
        description: "Failed to send password reset email",
        variant: "destructive",
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  const eligibleUsers = users.filter((user) => {
    const isAlreadySuperAdmin = superAdmins.some(
      (sa) => sa.userId === user.id && sa.isActive
    );
    const isAdmin = ['admin', 'financialAdmin', 'ict'].includes(user.role);
    return isAdmin && !isAlreadySuperAdmin;
  });

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <Shield className="h-16 w-16 text-destructive mx-auto" />
            <h2 className="text-2xl font-bold">Access Denied</h2>
            <p className="text-muted-foreground">
              Only super-admins can access this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-super-admin-management">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
            Super-Admin Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage super-admin accounts with complete system control
          </p>
        </div>
        {canAddSuperAdmin && (
          <Button onClick={() => setShowCreateDialog(true)} data-testid="button-add-super-admin">
            <UserPlus className="h-4 w-4 mr-2" />
            Add Super-Admin
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-3xl font-bold text-green-600">{stats?.activeCount || 0}</p>
              </div>
              <CheckCircle2 className="h-12 w-12 text-green-600/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Maximum Allowed</p>
                <p className="text-3xl font-bold">{stats?.maxAllowed || 3}</p>
              </div>
              <Shield className="h-12 w-12 text-primary/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Available Slots</p>
                <p className="text-3xl font-bold text-blue-600">
                  {(stats?.maxAllowed || 3) - (stats?.activeCount || 0)}
                </p>
              </div>
              <UserPlus className="h-12 w-12 text-blue-600/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {!canAddSuperAdmin && (
        <Card className="border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  Maximum Limit Reached
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  You must deactivate an existing super-admin before adding a new one. This limit is
                  database-enforced.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Active Super-Admins</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : superAdmins.filter((sa) => sa.isActive).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No active super-admins</p>
          ) : (
            <div className="space-y-3">
              {superAdmins
                .filter((sa) => sa.isActive)
                .map((superAdmin) => {
                  const user = users.find((u) => u.id === superAdmin.userId);
                  return (
                    <Card key={superAdmin.id} className="hover-elevate">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2">
                              <Shield className="h-5 w-5 text-primary" />
                              <h4 className="font-medium">{user?.name || 'Unknown User'}</h4>
                              <Badge variant="default" className="gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Active
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <Label className="text-xs text-muted-foreground">Email</Label>
                                <p>{user?.email || 'N/A'}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Appointed</Label>
                                <p>{format(new Date(superAdmin.appointedAt), 'MMM d, yyyy')}</p>
                              </div>
                              <div className="col-span-2">
                                <Label className="text-xs text-muted-foreground">Reason</Label>
                                <p className="text-sm">{superAdmin.appointmentReason}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Deletions</Label>
                                <p className="font-medium">{superAdmin.deletionCount}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Adjustments</Label>
                                <p className="font-medium">{superAdmin.adjustmentCount}</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {user && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenPasswordReset({ id: user.id, name: user.name, email: user.email })}
                                data-testid={`button-reset-password-${superAdmin.id}`}
                              >
                                <Mail className="h-4 w-4 mr-1" />
                                Reset Password
                              </Button>
                            )}
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openDeactivateDialog(superAdmin.id)}
                              data-testid={`button-deactivate-${superAdmin.id}`}
                            >
                              <UserX className="h-4 w-4 mr-1" />
                              Deactivate
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-muted-foreground" />
            Deactivated Super-Admins
          </CardTitle>
        </CardHeader>
        <CardContent>
          {superAdmins.filter((sa) => !sa.isActive).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No deactivated super-admins</p>
          ) : (
            <div className="space-y-3">
              {superAdmins
                .filter((sa) => !sa.isActive)
                .map((superAdmin) => {
                  const user = users.find((u) => u.id === superAdmin.userId);
                  return (
                    <Card key={superAdmin.id} className="opacity-75">
                      <CardContent className="p-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-muted-foreground" />
                            <h4 className="font-medium">{user?.name || 'Unknown User'}</h4>
                            <Badge variant="secondary" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              Inactive
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <Label className="text-xs text-muted-foreground">Deactivated</Label>
                              <p>
                                {superAdmin.deactivatedAt
                                  ? format(new Date(superAdmin.deactivatedAt), 'MMM d, yyyy')
                                  : 'N/A'}
                              </p>
                            </div>
                            <div className="col-span-2">
                              <Label className="text-xs text-muted-foreground">Reason</Label>
                              <p className="text-sm">{superAdmin.deactivationReason || 'N/A'}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent data-testid="dialog-create-super-admin">
          <DialogHeader>
            <DialogTitle>Add New Super-Admin</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3 rounded-md">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Super-admins have complete system control including deletion privileges. Maximum 3
                accounts allowed.
              </p>
            </div>

            <div>
              <Label htmlFor="select-user">Select Admin User</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger data-testid="select-user">
                  <SelectValue placeholder="Choose a user..." />
                </SelectTrigger>
                <SelectContent>
                  {eligibleUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="appointment-reason">Appointment Reason *</Label>
              <Textarea
                id="appointment-reason"
                value={appointmentReason}
                onChange={(e) => setAppointmentReason(e.target.value)}
                placeholder="Explain why this user should be a super-admin..."
                rows={3}
                data-testid="textarea-appointment-reason"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={processing || !selectedUserId} data-testid="button-confirm-create">
              {processing ? 'Creating...' : 'Create Super-Admin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <DialogContent data-testid="dialog-deactivate-super-admin">
          <DialogHeader>
            <DialogTitle>Deactivate Super-Admin</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 p-3 rounded-md">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                This will remove super-admin privileges from this user. The action is permanent but
                can be reversed by creating a new super-admin appointment.
              </p>
            </div>

            <div>
              <Label htmlFor="deactivation-reason">Deactivation Reason *</Label>
              <Textarea
                id="deactivation-reason"
                value={deactivationReason}
                onChange={(e) => setDeactivationReason(e.target.value)}
                placeholder="Explain why this super-admin is being deactivated..."
                rows={3}
                data-testid="textarea-deactivation-reason"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeactivateDialog(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeactivate}
              disabled={processing}
              data-testid="button-confirm-deactivate"
            >
              {processing ? 'Deactivating...' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog 
        open={passwordResetDialog.open} 
        onOpenChange={(open) => {
          if (!open) setPasswordResetDialog({ open: false, user: null });
        }}
      >
        <DialogContent data-testid="dialog-password-reset">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3 rounded-md">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                This will send a password reset email to the user. They will receive a link to create a new password.
              </p>
            </div>

            {passwordResetDialog.user && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">User</Label>
                  <p className="font-medium">{passwordResetDialog.user.name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p>{passwordResetDialog.user.email}</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setPasswordResetDialog({ open: false, user: null })} 
              data-testid="button-cancel-reset"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendPasswordReset}
              disabled={isSendingReset || !passwordResetDialog.user?.email}
              data-testid="button-confirm-send-reset"
            >
              {isSendingReset ? 'Sending...' : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Reset Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
