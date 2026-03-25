import { useTranslation } from 'react-i18next';
import { toast } from '@/hooks/toast';

type NotificationVariant = 'default' | 'destructive' | 'success' | 'warning' | 'info';

interface NotificationOptions {
  duration?: number;
  important?: boolean;
}

export function useNotification() {
  const { t } = useTranslation();

  const notify = (
    titleKey: string,
    descriptionKey?: string,
    variant: NotificationVariant = 'default',
    options: NotificationOptions = {}
  ) => {
    toast({
      title: t(titleKey),
      description: descriptionKey ? t(descriptionKey) : undefined,
      variant,
      duration: options.duration,
      important: options.important,
    });
  };

  const success = (titleKey: string, descriptionKey?: string, options?: NotificationOptions) => {
    notify(titleKey, descriptionKey, 'success', options);
  };

  const error = (titleKey: string, descriptionKey?: string, options?: NotificationOptions) => {
    notify(titleKey, descriptionKey, 'destructive', options);
  };

  const warning = (titleKey: string, descriptionKey?: string, options?: NotificationOptions) => {
    notify(titleKey, descriptionKey, 'warning', options);
  };

  const info = (titleKey: string, descriptionKey?: string, options?: NotificationOptions) => {
    notify(titleKey, descriptionKey, 'info', options);
  };

  const auth = {
    loginSuccess: (options?: NotificationOptions) => 
      success('notifications.auth.loginSuccess', 'notifications.auth.loginSuccessDesc', options),
    loginFailed: (options?: NotificationOptions) => 
      error('notifications.auth.loginFailed', 'notifications.auth.loginFailedDesc', options),
    logoutSuccess: (options?: NotificationOptions) => 
      info('notifications.auth.logoutSuccess', 'notifications.auth.logoutSuccessDesc', options),
    sessionExpired: (options?: NotificationOptions) => 
      warning('notifications.auth.sessionExpired', 'notifications.auth.sessionExpiredDesc', options),
    passwordResetSent: (options?: NotificationOptions) => 
      success('notifications.auth.passwordResetSent', 'notifications.auth.passwordResetSentDesc', options),
    passwordChanged: (options?: NotificationOptions) => 
      success('notifications.auth.passwordChanged', 'notifications.auth.passwordChangedDesc', options),
    accountCreated: (options?: NotificationOptions) => 
      success('notifications.auth.accountCreated', 'notifications.auth.accountCreatedDesc', options),
    mfaEnabled: (options?: NotificationOptions) => 
      success('notifications.auth.mfaEnabled', 'notifications.auth.mfaEnabledDesc', options),
    mfaDisabled: (options?: NotificationOptions) => 
      info('notifications.auth.mfaDisabled', 'notifications.auth.mfaDisabledDesc', options),
  };

  const siteVisit = {
    started: (options?: NotificationOptions) => 
      success('notifications.siteVisit.started', 'notifications.siteVisit.startedDesc', options),
    completed: (options?: NotificationOptions) => 
      success('notifications.siteVisit.completed', 'notifications.siteVisit.completedDesc', options),
    paused: (options?: NotificationOptions) => 
      info('notifications.siteVisit.paused', 'notifications.siteVisit.pausedDesc', options),
    resumed: (options?: NotificationOptions) => 
      info('notifications.siteVisit.resumed', 'notifications.siteVisit.resumedDesc', options),
    assigned: (options?: NotificationOptions) => 
      info('notifications.siteVisit.assigned', 'notifications.siteVisit.assignedDesc', { ...options, important: true }),
    claimed: (options?: NotificationOptions) => 
      success('notifications.siteVisit.claimed', 'notifications.siteVisit.claimedDesc', options),
    photoAdded: (options?: NotificationOptions) => 
      success('notifications.siteVisit.photoAdded', 'notifications.siteVisit.photoAddedDesc', options),
    notesUpdated: (options?: NotificationOptions) => 
      success('notifications.siteVisit.notesUpdated', 'notifications.siteVisit.notesUpdatedDesc', options),
    gpsError: (options?: NotificationOptions) => 
      error('notifications.siteVisit.gpsError', 'notifications.siteVisit.gpsErrorDesc', options),
  };

  const mmp = {
    uploaded: (options?: NotificationOptions) => 
      success('notifications.mmp.uploaded', 'notifications.mmp.uploadedDesc', options),
    verified: (options?: NotificationOptions) => 
      success('notifications.mmp.verified', 'notifications.mmp.verifiedDesc', options),
    rejected: (options?: NotificationOptions) => 
      error('notifications.mmp.rejected', 'notifications.mmp.rejectedDesc', options),
    dispatched: (options?: NotificationOptions) => 
      success('notifications.mmp.dispatched', 'notifications.mmp.dispatchedDesc', options),
    forwarded: (options?: NotificationOptions) => 
      success('notifications.mmp.forwarded', 'notifications.mmp.forwardedDesc', options),
  };

  const wallet = {
    transactionSuccess: (options?: NotificationOptions) => 
      success('notifications.wallet.transactionSuccess', 'notifications.wallet.transactionSuccessDesc', options),
    transactionFailed: (options?: NotificationOptions) => 
      error('notifications.wallet.transactionFailed', 'notifications.wallet.transactionFailedDesc', options),
    insufficientFunds: (options?: NotificationOptions) => 
      error('notifications.wallet.insufficientFunds', 'notifications.wallet.insufficientFundsDesc', options),
    depositReceived: (options?: NotificationOptions) => 
      success('notifications.wallet.depositReceived', 'notifications.wallet.depositReceivedDesc', options),
    withdrawalApproved: (options?: NotificationOptions) => 
      success('notifications.wallet.withdrawalApproved', 'notifications.wallet.withdrawalApprovedDesc', options),
    withdrawalRejected: (options?: NotificationOptions) => 
      error('notifications.wallet.withdrawalRejected', 'notifications.wallet.withdrawalRejectedDesc', options),
  };

  const approval = {
    submitted: (options?: NotificationOptions) => 
      success('notifications.approval.submitted', 'notifications.approval.submittedDesc', options),
    approved: (options?: NotificationOptions) => 
      success('notifications.approval.approved', 'notifications.approval.approvedDesc', options),
    rejected: (options?: NotificationOptions) => 
      error('notifications.approval.rejected', 'notifications.approval.rejectedDesc', options),
    pendingReview: (options?: NotificationOptions) => 
      info('notifications.approval.pendingReview', 'notifications.approval.pendingReviewDesc', options),
  };

  const sync = {
    started: (options?: NotificationOptions) => 
      info('notifications.sync.started', 'notifications.sync.startedDesc', options),
    completed: (options?: NotificationOptions) => 
      success('notifications.sync.completed', 'notifications.sync.completedDesc', options),
    failed: (options?: NotificationOptions) => 
      error('notifications.sync.failed', 'notifications.sync.failedDesc', options),
    offline: (options?: NotificationOptions) => 
      warning('notifications.sync.offline', 'notifications.sync.offlineDesc', options),
    online: (options?: NotificationOptions) => 
      success('notifications.sync.online', 'notifications.sync.onlineDesc', options),
  };

  const location = {
    permissionRequired: (options?: NotificationOptions) => 
      info('notifications.location.permissionRequired', 'notifications.location.permissionRequiredDesc', options),
    permissionDenied: (options?: NotificationOptions) => 
      error('notifications.location.permissionDenied', 'notifications.location.permissionDeniedDesc', options),
    sharingEnabled: (options?: NotificationOptions) => 
      success('notifications.location.sharingEnabled', 'notifications.location.sharingEnabledDesc', options),
    sharingDisabled: (options?: NotificationOptions) => 
      info('notifications.location.sharingDisabled', 'notifications.location.sharingDisabledDesc', options),
  };

  const push = {
    enabled: (options?: NotificationOptions) => 
      success('notifications.push.enabled', 'notifications.push.enabledDesc', options),
    disabled: (options?: NotificationOptions) => 
      info('notifications.push.disabled', 'notifications.push.disabledDesc', options),
    approvalRequired: (options?: NotificationOptions) => 
      warning('notifications.push.approvalRequired', 'notifications.push.approvalRequiredDesc', { ...options, important: true }),
  };

  const file = {
    uploadSuccess: (options?: NotificationOptions) => 
      success('notifications.file.uploadSuccess', 'notifications.file.uploadSuccessDesc', options),
    uploadFailed: (options?: NotificationOptions) => 
      error('notifications.file.uploadFailed', 'notifications.file.uploadFailedDesc', options),
    downloadSuccess: (options?: NotificationOptions) => 
      success('notifications.file.downloadSuccess', 'notifications.file.downloadSuccessDesc', options),
    downloadFailed: (options?: NotificationOptions) => 
      error('notifications.file.downloadFailed', 'notifications.file.downloadFailedDesc', options),
    deleteSuccess: (options?: NotificationOptions) => 
      success('notifications.file.deleteSuccess', 'notifications.file.deleteSuccessDesc', options),
    invalidFormat: (options?: NotificationOptions) => 
      error('notifications.file.invalidFormat', 'notifications.file.invalidFormatDesc', options),
    fileTooLarge: (options?: NotificationOptions) => 
      error('notifications.file.fileTooLarge', 'notifications.file.fileTooLargeDesc', options),
  };

  const profile = {
    updated: (options?: NotificationOptions) => 
      success('notifications.profile.updated', 'notifications.profile.updatedDesc', options),
    avatarUpdated: (options?: NotificationOptions) => 
      success('notifications.profile.avatarUpdated', 'notifications.profile.avatarUpdatedDesc', options),
    settingsSaved: (options?: NotificationOptions) => 
      success('notifications.profile.settingsSaved', 'notifications.profile.settingsSavedDesc', options),
  };

  const team = {
    memberAdded: (options?: NotificationOptions) => 
      success('notifications.team.memberAdded', 'notifications.team.memberAddedDesc', options),
    memberRemoved: (options?: NotificationOptions) => 
      info('notifications.team.memberRemoved', 'notifications.team.memberRemovedDesc', options),
    roleUpdated: (options?: NotificationOptions) => 
      success('notifications.team.roleUpdated', 'notifications.team.roleUpdatedDesc', options),
  };

  const project = {
    created: (options?: NotificationOptions) => 
      success('notifications.project.created', 'notifications.project.createdDesc', options),
    updated: (options?: NotificationOptions) => 
      success('notifications.project.updated', 'notifications.project.updatedDesc', options),
    deleted: (options?: NotificationOptions) => 
      info('notifications.project.deleted', 'notifications.project.deletedDesc', options),
  };

  const budget = {
    updated: (options?: NotificationOptions) => 
      success('notifications.budget.updated', 'notifications.budget.updatedDesc', options),
    exceeded: (options?: NotificationOptions) => 
      error('notifications.budget.exceeded', 'notifications.budget.exceededDesc', { ...options, important: true }),
    warning: (options?: NotificationOptions) => 
      warning('notifications.budget.warning', 'notifications.budget.warningDesc', options),
  };

  const signature = {
    requested: (options?: NotificationOptions) => 
      info('notifications.signature.requested', 'notifications.signature.requestedDesc', { ...options, important: true }),
    signed: (options?: NotificationOptions) => 
      success('notifications.signature.signed', 'notifications.signature.signedDesc', options),
    verified: (options?: NotificationOptions) => 
      success('notifications.signature.verified', 'notifications.signature.verifiedDesc', options),
  };

  const errors = {
    generic: (options?: NotificationOptions) => 
      error('notifications.error.generic', 'notifications.error.genericDesc', options),
    network: (options?: NotificationOptions) => 
      error('notifications.error.network', 'notifications.error.networkDesc', options),
    permission: (options?: NotificationOptions) => 
      error('notifications.error.permission', 'notifications.error.permissionDesc', options),
    notFound: (options?: NotificationOptions) => 
      error('notifications.error.notFound', 'notifications.error.notFoundDesc', options),
    validation: (options?: NotificationOptions) => 
      error('notifications.error.validation', 'notifications.error.validationDesc', options),
    timeout: (options?: NotificationOptions) => 
      error('notifications.error.timeout', 'notifications.error.timeoutDesc', options),
  };

  return {
    notify,
    success,
    error,
    warning,
    info,
    auth,
    siteVisit,
    mmp,
    wallet,
    approval,
    sync,
    location,
    push,
    file,
    profile,
    team,
    project,
    budget,
    signature,
    errors,
    t,
  };
}
