#!/usr/bin/env node
'use strict';

/**
 * migrate-structure.cjs
 * Moves source files to the new feature-first layout and updates all @/ imports.
 *
 * Run: node scripts/migrate-structure.cjs
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src');

// ─── STATIC FILE MOVES ───────────────────────────────────────────────────────
// Each entry: ['path/relative/to/src/from', 'path/relative/to/src/to']
const STATIC_MOVES = [

  // ── CONTEXT → features/[domain]/context/ ──────────────────────────────────
  ['context/approval/ApprovalContext.tsx',                          'features/approval/context/ApprovalContext.tsx'],
  ['context/archive/ArchiveContext.tsx',                            'features/archive/context/ArchiveContext.tsx'],
  ['context/audit/AuditContext.tsx',                                'features/audit/context/AuditContext.tsx'],
  ['context/audit/index.ts',                                        'features/audit/context/index.ts'],
  ['context/budget/BudgetContext.tsx',                              'features/budget/context/BudgetContext.tsx'],
  ['context/budget/budgetQueries.ts',                               'features/budget/context/budgetQueries.ts'],
  ['context/classification/ClassificationContext.tsx',              'features/classification/context/ClassificationContext.tsx'],
  ['context/classification/classificationQueries.ts',               'features/classification/context/classificationQueries.ts'],
  ['context/costApproval/CostSubmissionContext.tsx',                'features/costApproval/context/CostSubmissionContext.tsx'],
  ['context/costApproval/adapter.ts',                               'features/costApproval/context/adapter.ts'],
  ['context/costApproval/supabase.ts',                              'features/costApproval/context/supabase.ts'],
  ['context/downPayment/DownPaymentContext.tsx',                    'features/downPayment/context/DownPaymentContext.tsx'],
  ['context/downPayment/downPaymentQueries.ts',                     'features/downPayment/context/downPaymentQueries.ts'],
  ['context/location/LocationContext.tsx',                          'features/location/context/LocationContext.tsx'],
  ['context/mmp/MMPContext.tsx',                                    'features/mmp/context/MMPContext.tsx'],
  ['context/mmp/mmpQueries.ts',                                     'features/mmp/context/mmpQueries.ts'],
  ['context/mmp/mmpTransform.ts',                                   'features/mmp/context/mmpTransform.ts'],
  ['context/mmp/types.ts',                                          'features/mmp/context/types.ts'],
  ['context/mmp/hooks/useMMPOperations.ts',                         'features/mmp/context/hooks/useMMPOperations.ts'],
  ['context/mmp/hooks/useMMPStatusOperations.ts',                   'features/mmp/context/hooks/useMMPStatusOperations.ts'],
  ['context/mmp/hooks/useMMPUpload.ts',                             'features/mmp/context/hooks/useMMPUpload.ts'],
  ['context/mmp/hooks/useMMPVersioning.ts',                         'features/mmp/context/hooks/useMMPVersioning.ts'],
  ['context/notifications/NotificationContext.tsx',                 'features/notifications/context/NotificationContext.tsx'],
  ['context/NotificationContext.tsx',                               'features/notifications/context/NotificationContextLegacy.tsx'],
  ['context/ActionableNotificationContext.tsx',                     'features/notifications/context/ActionableNotificationContext.tsx'],
  ['context/ActiveVisitContext.tsx',                                'features/siteVisit/context/ActiveVisitContext.tsx'],
  ['context/NavigationContext.tsx',                                  'shared/context/NavigationContext.tsx'],
  ['context/ViewModeContext.tsx',                                   'shared/context/ViewModeContext.tsx'],
  ['context/AppContext.tsx',                                        'shared/context/AppContext.tsx'],
  ['context/presence/GlobalPresenceContext.tsx',                    'features/notifications/context/GlobalPresenceContext.tsx'],
  ['context/project/ProjectContext.tsx',                            'features/project/context/ProjectContext.tsx'],
  ['context/project/projectQueries.ts',                             'features/project/context/projectQueries.ts'],
  ['context/role-management/RoleManagementContext.tsx',             'features/roleManagement/context/RoleManagementContext.tsx'],
  ['context/settings/SettingsContext.tsx',                          'features/settings/context/SettingsContext.tsx'],
  ['context/settings/settingsQueries.ts',                           'features/settings/context/settingsQueries.ts'],
  ['context/siteVisit/SiteVisitContext.tsx',                        'features/siteVisit/context/SiteVisitContext.tsx'],
  ['context/siteVisit/siteVisitQueries.ts',                         'features/siteVisit/context/siteVisitQueries.ts'],
  ['context/siteVisit/supabase.ts',                                 'features/siteVisit/context/supabase.ts'],
  ['context/siteVisit/types.ts',                                    'features/siteVisit/context/types.ts'],
  ['context/siteVisit/utils.ts',                                    'features/siteVisit/context/utils.ts'],
  ['context/siteVisit/mmpSiteEntriesAdapter.ts',                   'features/siteVisit/context/mmpSiteEntriesAdapter.ts'],
  ['context/superAdmin/SuperAdminContext.tsx',                      'features/admin/context/SuperAdminContext.tsx'],
  ['context/user/UserContext.tsx',                                  'features/user/context/UserContext.tsx'],
  ['context/user/__tests__/loadUsersFromStorage.test.ts',           'features/user/context/__tests__/loadUsersFromStorage.test.ts'],
  ['context/wallet/WalletContext.tsx',                              'features/wallet/context/WalletContext.tsx'],
  ['context/wallet/walletQueries.ts',                               'features/wallet/context/walletQueries.ts'],
  ['context/wallet/supabase.ts',                                    'features/wallet/context/supabase.ts'],
  ['context/activity/ActivityTrackingContext.tsx',                  'features/admin/context/ActivityTrackingContext.tsx'],
  ['context/chat/ChatContext.tsx',                                  'features/chat/context/ChatContext.tsx'],
  ['context/chat/ChatContextSupabase.tsx',                          'features/chat/context/ChatContextSupabase.tsx'],
  ['context/communications/CallContext.tsx',                        'features/calls/context/CallContext.tsx'],
  ['context/communications/CommunicationContext.tsx',               'features/calls/context/CommunicationContext.tsx'],
  ['context/dashboard/DashboardMmpFilterContext.tsx',               'features/dashboard/context/DashboardMmpFilterContext.tsx'],
  ['context/realtime/LiveDashboardContext.tsx',                     'features/dashboard/context/LiveDashboardContext.tsx'],
  ['context/sync/index.ts',                                         'shared/context/sync/index.ts'],
  ['context/sync/SyncStatusContext.tsx',                            'shared/context/sync/SyncStatusContext.tsx'],

  // ── REPOSITORIES → features/[domain]/repository/ ──────────────────────────
  ['repositories/approval/approvalRepository.ts',                   'features/approval/repository/approvalRepository.ts'],
  ['repositories/archive/archiveRepository.ts',                     'features/archive/repository/archiveRepository.ts'],
  ['repositories/audit/auditRepository.ts',                         'features/audit/repository/auditRepository.ts'],
  ['repositories/budget/budgetRepository.ts',                       'features/budget/repository/budgetRepository.ts'],
  ['repositories/chat/chatRepository.ts',                           'features/chat/repository/chatRepository.ts'],
  ['repositories/classification/classificationRepository.ts',       'features/classification/repository/classificationRepository.ts'],
  ['repositories/costApproval/adapter.ts',                          'features/costApproval/repository/adapter.ts'],
  ['repositories/costApproval/costApprovalRepository.ts',           'features/costApproval/repository/costApprovalRepository.ts'],
  ['repositories/costApproval/operationalCostSubmissionsRepository.ts', 'features/costApproval/repository/operationalCostSubmissionsRepository.ts'],
  ['repositories/downPayment/downPaymentRepository.ts',             'features/downPayment/repository/downPaymentRepository.ts'],
  ['repositories/email/emailManagementRepository.ts',               'features/admin/repository/emailManagementRepository.ts'],
  ['repositories/finance/financeRepository.ts',                     'features/finance/repository/financeRepository.ts'],
  ['repositories/financialOperations/financialOperationsRepository.ts', 'features/finance/repository/financialOperationsRepository.ts'],
  ['repositories/hubOperations/hubOperationsRepository.ts',         'features/admin/repository/hubOperationsRepository.ts'],
  ['repositories/location/locationRepository.ts',                   'features/location/repository/locationRepository.ts'],
  ['repositories/mmp/dispatchSites/dispatchSitesRepository.ts',     'features/mmp/repository/dispatchSitesRepository.ts'],
  ['repositories/mmp/mmpCycleCloseRepository.ts',                   'features/mmp/repository/mmpCycleCloseRepository.ts'],
  ['repositories/mmp/mmpRepository.ts',                             'features/mmp/repository/mmpRepository.ts'],
  ['repositories/notification/notificationRepository.ts',           'features/notifications/repository/notificationRepository.ts'],
  ['repositories/profile/profileRepository.ts',                     'features/user/repository/profileRepository.ts'],
  ['repositories/project/projectRepository.ts',                     'features/project/repository/projectRepository.ts'],
  ['repositories/roleManagement/roleManagementRepository.ts',       'features/roleManagement/repository/roleManagementRepository.ts'],
  ['repositories/settings/settingsRepository.ts',                   'features/settings/repository/settingsRepository.ts'],
  ['repositories/settings/settingsSupabaseRepository.ts',           'features/settings/repository/settingsSupabaseRepository.ts'],
  ['repositories/siteVisit/mmpSiteEntriesAdapter.ts',               'features/siteVisit/repository/mmpSiteEntriesAdapter.ts'],
  ['repositories/siteVisit/siteVisitRepository.ts',                 'features/siteVisit/repository/siteVisitRepository.ts'],
  ['repositories/staffDirectory/staffDirectoryRepository.ts',       'features/documents/repository/staffDirectoryRepository.ts'],
  ['repositories/superAdmin/superAdminRepository.ts',               'features/admin/repository/superAdminRepository.ts'],
  ['repositories/user/userRepository.ts',                           'features/user/repository/userRepository.ts'],
  ['repositories/wallet/paymentMethodsRepository.ts',               'features/wallet/repository/paymentMethodsRepository.ts'],
  ['repositories/wallet/transactionScannerRepository.ts',           'features/wallet/repository/transactionScannerRepository.ts'],
  ['repositories/wallet/walletRepository.ts',                       'features/wallet/repository/walletRepository.ts'],

  // ── SERVICES → features/ ──────────────────────────────────────────────────
  ['services/ChatService.ts',                                       'features/chat/services/ChatService.ts'],

  // ── COMPONENTS (flat root) → features/ or shared/ ─────────────────────────
  ['components/AdminUsersTable.tsx',                                'features/admin/components/AdminUsersTable.tsx'],
  ['components/EmailCCInput.tsx',                                   'features/admin/components/EmailCCInput.tsx'],
  ['components/ApprovalTierAnalytics.tsx',                          'features/approval/components/ApprovalTierAnalytics.tsx'],
  ['components/PendingApprovalsList.tsx',                           'features/approval/components/PendingApprovalsList.tsx'],
  ['components/AuditLogViewer.tsx',                                 'features/audit/components/AuditLogViewer.tsx'],
  ['components/ComplianceTracker.tsx',                              'features/audit/components/ComplianceTracker.tsx'],
  ['components/BudgetForecast.tsx',                                 'features/budget/components/BudgetForecast.tsx'],
  ['components/FinancialDashboard.tsx',                             'features/finance/components/FinancialDashboard.tsx'],
  ['components/FraudDetection.tsx',                                 'features/finance/components/FraudDetection.tsx'],
  ['components/FraudPreventionDashboard.tsx',                       'features/finance/components/FraudPreventionDashboard.tsx'],
  ['components/GpsLocationCapture.tsx',                             'features/location/components/GpsLocationCapture.tsx'],
  ['components/LocationCapture.tsx',                                'features/location/components/LocationCapture.tsx'],
  ['components/LocationSharingControl.tsx',                         'features/location/components/LocationSharingControl.tsx'],
  ['components/DashboardLocationSharingCard.tsx',                   'features/location/components/DashboardLocationSharingCard.tsx'],
  ['components/LocalityPermitQuestions.tsx',                        'features/coordinator/components/LocalityPermitQuestions.tsx'],
  ['components/LocalityPermitUpload.tsx',                           'features/coordinator/components/LocalityPermitUpload.tsx'],
  ['components/StatePermitUpload.tsx',                              'features/coordinator/components/StatePermitUpload.tsx'],
  ['components/PermitVerificationQuestions.tsx',                    'features/coordinator/components/PermitVerificationQuestions.tsx'],
  ['components/SequentialPermitUpload.tsx',                         'features/coordinator/components/SequentialPermitUpload.tsx'],
  ['components/MMPAdvancedFilters.tsx',                             'features/mmp/components/MMPAdvancedFilters.tsx'],
  ['components/MMPApprovalWorkflow.tsx',                            'features/mmp/components/MMPApprovalWorkflow.tsx'],
  ['components/MMPComprehensiveVerification.tsx',                   'features/mmp/components/MMPComprehensiveVerification.tsx'],
  ['components/MMPCPVerification.tsx',                              'features/mmp/components/MMPCPVerification.tsx'],
  ['components/MMPHistoricalTrends.tsx',                            'features/mmp/components/MMPHistoricalTrends.tsx'],
  ['components/MMPOverallInformation.tsx',                          'features/mmp/components/MMPOverallInformation.tsx'],
  ['components/MMPPermitFileUpload.tsx',                            'features/mmp/components/MMPPermitFileUpload.tsx'],
  ['components/MMPPermitVerification.tsx',                          'features/mmp/components/MMPPermitVerification.tsx'],
  ['components/MMPSiteInformation.tsx',                             'features/mmp/components/MMPSiteInformation.tsx'],
  ['components/MMPStageChangeDialog.tsx',                           'features/mmp/components/MMPStageChangeDialog.tsx'],
  ['components/MMPStageIndicator.tsx',                              'features/mmp/components/MMPStageIndicator.tsx'],
  ['components/MMPVersionHistory.tsx',                              'features/mmp/components/MMPVersionHistory.tsx'],
  ['components/MoDaDeadlineCountdown.tsx',                          'features/mmp/components/MoDaDeadlineCountdown.tsx'],
  ['components/BrowserNotificationListener.tsx',                   'features/notifications/components/BrowserNotificationListener.tsx'],
  ['components/NotificationDropdown.tsx',                           'features/notifications/components/NotificationDropdown.tsx'],
  ['components/NotificationExamples.tsx',                           'features/notifications/components/NotificationExamples.tsx'],
  ['components/NotificationInitializer.tsx',                        'features/notifications/components/NotificationInitializer.tsx'],
  ['components/NotificationStack.tsx',                              'features/notifications/components/NotificationStack.tsx'],
  ['components/SiteEntriesTable.tsx',                               'features/siteVisit/components/SiteEntriesTable.tsx'],
  ['components/SiteVisitFinancialTracker.tsx',                      'features/siteVisit/components/SiteVisitFinancialTracker.tsx'],
  ['components/SiteVisitReminders.tsx',                             'features/siteVisit/components/SiteVisitReminders.tsx'],
  ['components/BankakAccountForm.tsx',                              'features/wallet/components/BankakAccountForm.tsx'],
  ['components/UserRoleDashboard.tsx',                              'features/user/components/UserRoleDashboard.tsx'],
  ['components/AvatarUpload.tsx',                                   'shared/components/common/AvatarUpload.tsx'],
  ['components/ConfigurationError.tsx',                             'shared/components/common/ConfigurationError.tsx'],
  ['components/DeadlineCountdown.tsx',                              'shared/components/common/DeadlineCountdown.tsx'],
  ['components/ErrorBoundary.tsx',                                  'shared/components/common/ErrorBoundary.tsx'],
  ['components/FaceCapture.tsx',                                    'shared/components/common/FaceCapture.tsx'],
  ['components/FileUpload.tsx',                                     'shared/components/common/FileUpload.tsx'],
  ['components/GlobalBroadcastAlert.tsx',                           'shared/components/common/GlobalBroadcastAlert.tsx'],
  ['components/GlobalRefreshBar.tsx',                               'shared/components/common/GlobalRefreshBar.tsx'],
  ['components/LanguageSwitcher.tsx',                               'shared/components/common/LanguageSwitcher.tsx'],
  ['components/UpdateDialog.tsx',                                   'shared/components/common/UpdateDialog.tsx'],
  ['components/ViewModeToggle.tsx',                                 'shared/components/common/ViewModeToggle.tsx'],
  ['components/MobileGlobalSearch.tsx',                             'shared/components/layout/MobileGlobalSearch.tsx'],
  ['components/MobileNavigation.tsx',                               'shared/components/layout/MobileNavigation.tsx'],
  ['components/TabletNavigation.tsx',                               'shared/components/layout/TabletNavigation.tsx'],

  // ── COMPONENT SUBFOLDERS → features/ ─────────────────────────────────────
  // admin/
  ['components/admin/FeeStructureEditDialog.tsx',                   'features/admin/components/FeeStructureEditDialog.tsx'],
  ['components/admin/ManageClassificationDialog.tsx',               'features/admin/components/ManageClassificationDialog.tsx'],
  ['components/admin/RetainerProcessingCard.tsx',                   'features/admin/components/RetainerProcessingCard.tsx'],
  // archive/
  ['components/archive/ArchiveCalendarView.tsx',                    'features/archive/components/ArchiveCalendarView.tsx'],
  ['components/archive/ArchiveFilters.tsx',                         'features/archive/components/ArchiveFilters.tsx'],
  ['components/archive/ArchiveHeader.tsx',                          'features/archive/components/ArchiveHeader.tsx'],
  ['components/archive/ArchiveMMPList.tsx',                         'features/archive/components/ArchiveMMPList.tsx'],
  ['components/archive/ArchiveSearch.tsx',                          'features/archive/components/ArchiveSearch.tsx'],
  ['components/archive/ArchiveSiteVisitList.tsx',                   'features/archive/components/ArchiveSiteVisitList.tsx'],
  ['components/archive/ArchiveStatisticsCard.tsx',                  'features/archive/components/ArchiveStatisticsCard.tsx'],
  // auth/
  ['components/auth/PermissionGuard.tsx',                           'features/auth/components/PermissionGuard.tsx'],
  ['components/auth/SessionTimeoutWarning.tsx',                     'features/auth/components/SessionTimeoutWarning.tsx'],
  ['components/auth/TwoFactorChallenge.tsx',                        'features/auth/components/TwoFactorChallenge.tsx'],
  ['components/auth/TwoFactorSetup.tsx',                            'features/auth/components/TwoFactorSetup.tsx'],
  // budget/
  ['components/budget/BudgetCard.tsx',                              'features/budget/components/BudgetCard.tsx'],
  ['components/budget/BudgetOverrideDialog.tsx',                    'features/budget/components/BudgetOverrideDialog.tsx'],
  ['components/budget/BudgetStatusBadge.tsx',                       'features/budget/components/BudgetStatusBadge.tsx'],
  ['components/budget/CreateMMPBudgetDialog.tsx',                   'features/budget/components/CreateMMPBudgetDialog.tsx'],
  ['components/budget/CreateProjectBudgetDialog.tsx',               'features/budget/components/CreateProjectBudgetDialog.tsx'],
  ['components/budget/EditProjectBudgetDialog.tsx',                 'features/budget/components/EditProjectBudgetDialog.tsx'],
  ['components/budget/TopUpBudgetDialog.tsx',                       'features/budget/components/TopUpBudgetDialog.tsx'],
  // calls/
  ['components/calls/CallMethodDialog.tsx',                         'features/calls/components/CallMethodDialog.tsx'],
  ['components/calls/IncomingJitsiCall.tsx',                        'features/calls/components/IncomingJitsiCall.tsx'],
  ['components/calls/JitsiCallModal.tsx',                           'features/calls/components/JitsiCallModal.tsx'],
  // chat/
  ['components/chat/ChatNotificationIndicator.tsx',                 'features/chat/components/ChatNotificationIndicator.tsx'],
  ['components/chat/ChatSidebar.tsx',                               'features/chat/components/ChatSidebar.tsx'],
  ['components/chat/ChatTestComponent.tsx',                         'features/chat/components/ChatTestComponent.tsx'],
  // common/ → shared
  ['components/common/FloatingToggle.tsx',                          'shared/components/common/FloatingToggle.tsx'],
  ['components/common/OnlineOfflineToggle.tsx',                     'shared/components/common/OnlineOfflineToggle.tsx'],
  // communication/ → calls/ + chat/
  ['components/communication/AssignmentAlertPopup.tsx',             'features/calls/components/AssignmentAlertPopup.tsx'],
  ['components/communication/CallInterface.tsx',                    'features/calls/components/CallInterface.tsx'],
  ['components/communication/CommunicationPanel.tsx',               'features/calls/components/CommunicationPanel.tsx'],
  ['components/communication/FloatingMessenger.tsx',                'features/chat/components/FloatingMessenger.tsx'],
  ['components/communication/GlobalCallOverlay.tsx',                'features/calls/components/GlobalCallOverlay.tsx'],
  ['components/communication/PersistentMessenger.tsx',              'features/chat/components/PersistentMessenger.tsx'],
  // coordinator/
  ['components/coordinator/LocalityPermitManager.tsx',              'features/coordinator/components/LocalityPermitManager.tsx'],
  ['components/coordinator/SiteRecallDialog.tsx',                   'features/coordinator/components/SiteRecallDialog.tsx'],
  // cost-submission/
  ['components/cost-submission/CostDocumentUpload.tsx',             'features/costApproval/components/CostDocumentUpload.tsx'],
  ['components/cost-submission/CostReconciliationForm.tsx',         'features/costApproval/components/CostReconciliationForm.tsx'],
  ['components/cost-submission/CostRequestForm.tsx',                'features/costApproval/components/CostRequestForm.tsx'],
  ['components/cost-submission/CostSubmissionForm.tsx',             'features/costApproval/components/CostSubmissionForm.tsx'],
  ['components/cost-submission/CostSubmissionHistory.tsx',          'features/costApproval/components/CostSubmissionHistory.tsx'],
  ['components/cost-submission/CostSubmissionSignature.tsx',        'features/costApproval/components/CostSubmissionSignature.tsx'],
  ['components/cost-submission/ExcelUploadParser.tsx',              'features/costApproval/components/ExcelUploadParser.tsx'],
  // dashboard/
  ['components/dashboard/AchievementProgressBar.tsx',               'features/dashboard/components/AchievementProgressBar.tsx'],
  ['components/dashboard/AchievementTracker.tsx',                   'features/dashboard/components/AchievementTracker.tsx'],
  ['components/dashboard/ActivityFeed.tsx',                         'features/dashboard/components/ActivityFeed.tsx'],
  ['components/dashboard/CalendarAndVisits.tsx',                    'features/dashboard/components/CalendarAndVisits.tsx'],
  ['components/dashboard/ChatIndicatorWidget.tsx',                  'features/dashboard/components/ChatIndicatorWidget.tsx'],
  ['components/dashboard/ConfirmationAnalytics.tsx',                'features/dashboard/components/ConfirmationAnalytics.tsx'],
  ['components/dashboard/ConfirmationStatusWidget.tsx',             'features/dashboard/components/ConfirmationStatusWidget.tsx'],
  ['components/dashboard/ConnectionStatus.tsx',                     'features/dashboard/components/ConnectionStatus.tsx'],
  ['components/dashboard/DashboardCalendar.tsx',                    'features/dashboard/components/DashboardCalendar.tsx'],
  ['components/dashboard/DashboardCalendarCard.tsx',                'features/dashboard/components/DashboardCalendarCard.tsx'],
  ['components/dashboard/DashboardDesktopView.tsx',                 'features/dashboard/components/DashboardDesktopView.tsx'],
  ['components/dashboard/DashboardMobileView.tsx',                  'features/dashboard/components/DashboardMobileView.tsx'],
  ['components/dashboard/DashboardNotifications.tsx',               'features/dashboard/components/DashboardNotifications.tsx'],
  ['components/dashboard/DashboardOptimization.tsx',                'features/dashboard/components/DashboardOptimization.tsx'],
  ['components/dashboard/DashboardStatsOverview.tsx',               'features/dashboard/components/DashboardStatsOverview.tsx'],
  ['components/dashboard/EnhancedActivityFeed.tsx',                 'features/dashboard/components/EnhancedActivityFeed.tsx'],
  ['components/dashboard/EnhancedDashboard.tsx',                    'features/dashboard/components/EnhancedDashboard.tsx'],
  ['components/dashboard/EnhancedMoDaCountdown.tsx',                'features/dashboard/components/EnhancedMoDaCountdown.tsx'],
  ['components/dashboard/EnhancedRiskManagement.tsx',               'features/dashboard/components/EnhancedRiskManagement.tsx'],
  ['components/dashboard/ForwardedMMPsCard.tsx',                    'features/dashboard/components/ForwardedMMPsCard.tsx'],
  ['components/dashboard/FraudDetectionWidget.tsx',                 'features/dashboard/components/FraudDetectionWidget.tsx'],
  ['components/dashboard/FraudPreventionDashboardWidget.tsx',       'features/dashboard/components/FraudPreventionDashboardWidget.tsx'],
  ['components/dashboard/GradientStatCard.tsx',                     'features/dashboard/components/GradientStatCard.tsx'],
  ['components/dashboard/LiveTeamMapWidget.tsx',                    'features/dashboard/components/LiveTeamMapWidget.tsx'],
  ['components/dashboard/MMPOverviewCard.tsx',                      'features/dashboard/components/MMPOverviewCard.tsx'],
  ['components/dashboard/OnlineUsersPanel.tsx',                     'features/dashboard/components/OnlineUsersPanel.tsx'],
  ['components/dashboard/PersistentCommunication.tsx',              'features/dashboard/components/PersistentCommunication.tsx'],
  ['components/dashboard/PlanningSiteVisitsList.tsx',               'features/dashboard/components/PlanningSiteVisitsList.tsx'],
  ['components/dashboard/PlanningSiteVisitsMap.tsx',                'features/dashboard/components/PlanningSiteVisitsMap.tsx'],
  ['components/dashboard/QuickActionButtons.tsx',                   'features/dashboard/components/QuickActionButtons.tsx'],
  ['components/dashboard/RefreshButton.tsx',                        'features/dashboard/components/RefreshButton.tsx'],
  ['components/dashboard/SectionHeader.tsx',                        'features/dashboard/components/SectionHeader.tsx'],
  ['components/dashboard/SiteVisitCostSummary.tsx',                 'features/dashboard/components/SiteVisitCostSummary.tsx'],
  ['components/dashboard/SiteVisitsSummaryCard.tsx',                'features/dashboard/components/SiteVisitsSummaryCard.tsx'],
  ['components/dashboard/TeamCommunication.tsx',                    'features/dashboard/components/TeamCommunication.tsx'],
  ['components/dashboard/TeamLocationMap.tsx',                      'features/dashboard/components/TeamLocationMap.tsx'],
  ['components/dashboard/TeamMemberCard.tsx',                       'features/dashboard/components/TeamMemberCard.tsx'],
  ['components/dashboard/TeamMemberDetailModal.tsx',                'features/dashboard/components/TeamMemberDetailModal.tsx'],
  ['components/dashboard/TeamMemberTable.tsx',                      'features/dashboard/components/TeamMemberTable.tsx'],
  ['components/dashboard/UpcomingSiteVisitsCard.tsx',               'features/dashboard/components/UpcomingSiteVisitsCard.tsx'],
  ['components/dashboard/animation-utils.tsx',                      'features/dashboard/components/animation-utils.tsx'],
  ['components/dashboard/analytics/MMPPerformanceCard.tsx',         'features/dashboard/components/analytics/MMPPerformanceCard.tsx'],
  ['components/dashboard/analytics/MonthlyComparisonCard.tsx',      'features/dashboard/components/analytics/MonthlyComparisonCard.tsx'],
  ['components/dashboard/filters/DashboardFilters.tsx',             'features/dashboard/components/filters/DashboardFilters.tsx'],
  ['components/dashboard/filters/MmpGlobalFilter.tsx',              'features/dashboard/components/filters/MmpGlobalFilter.tsx'],
  ['components/dashboard/filters/MMPVersionSelector.tsx',           'features/dashboard/components/filters/MMPVersionSelector.tsx'],
  ['components/dashboard/shared/ZoneMmpAnalyticsTab.tsx',           'features/dashboard/components/shared/ZoneMmpAnalyticsTab.tsx'],
  ['components/dashboard/shared/ZoneMmpStatsCards.tsx',             'features/dashboard/components/shared/ZoneMmpStatsCards.tsx'],
  ['components/dashboard/zones/DataCollectorZone.tsx',              'features/dashboard/components/zones/DataCollectorZone.tsx'],
  // downPayment/
  ['components/downPayment/AuditTrailViewer.tsx',                   'features/downPayment/components/AuditTrailViewer.tsx'],
  ['components/downPayment/CostAdjustmentDialog.tsx',               'features/downPayment/components/CostAdjustmentDialog.tsx'],
  // finance/
  ['components/finance/FinanceSignatureIntegration.tsx',            'features/finance/components/FinanceSignatureIntegration.tsx'],
  ['components/finance/RetainerDashboard.tsx',                      'features/finance/components/RetainerDashboard.tsx'],
  // layout/ → shared
  ['components/layout/SessionManager.tsx',                          'shared/components/layout/SessionManager.tsx'],
  // location/
  ['components/location/LocationPermissionPrompt.tsx',              'features/location/components/LocationPermissionPrompt.tsx'],
  // map/ → location
  ['components/map/DynamicFieldTeamMap.tsx',                        'features/location/components/DynamicFieldTeamMap.tsx'],
  ['components/map/FieldTeamMap.tsx',                               'features/location/components/FieldTeamMap.tsx'],
  ['components/map/FieldTeamMapPermissions.tsx',                    'features/location/components/FieldTeamMapPermissions.tsx'],
  ['components/map/HubHighlight.tsx',                               'features/location/components/HubHighlight.tsx'],
  ['components/map/LeafletMapContainer.tsx',                        'features/location/components/LeafletMapContainer.tsx'],
  ['components/map/MapComponent.tsx',                               'features/location/components/MapComponent.tsx'],
  ['components/map/ReactLeafletMap.tsx',                            'features/location/components/ReactLeafletMap.tsx'],
  ['components/map/SimpleFieldTeamMap.tsx',                         'features/location/components/SimpleFieldTeamMap.tsx'],
  ['components/map/StaticTeamMap.tsx',                              'features/location/components/StaticTeamMap.tsx'],
  // mmp/
  ['components/mmp/CoordinatorSitesList.tsx',                       'features/mmp/components/CoordinatorSitesList.tsx'],
  ['components/mmp/CostSparkline.tsx',                              'features/mmp/components/CostSparkline.tsx'],
  ['components/mmp/DateRangeVisitBadge.tsx',                        'features/mmp/components/DateRangeVisitBadge.tsx'],
  ['components/mmp/ExchangeRatePanel.tsx',                          'features/mmp/components/ExchangeRatePanel.tsx'],
  ['components/mmp/FallbackOptionsSelector.tsx',                    'features/mmp/components/FallbackOptionsSelector.tsx'],
  ['components/mmp/ForwardToFOMDialog.tsx',                         'features/mmp/components/ForwardToFOMDialog.tsx'],
  ['components/mmp/LocalityRequirementTriageDialog.tsx',            'features/mmp/components/LocalityRequirementTriageDialog.tsx'],
  ['components/mmp/MMPAdminValidation.tsx',                         'features/mmp/components/MMPAdminValidation.tsx'],
  ['components/mmp/MMPCategorySitesTable.tsx',                      'features/mmp/components/MMPCategorySitesTable.tsx'],
  ['components/mmp/MMPClassificationSelector.tsx',                  'features/mmp/components/MMPClassificationSelector.tsx'],
  ['components/mmp/MMPDetailHeader.tsx',                            'features/mmp/components/MMPDetailHeader.tsx'],
  ['components/mmp/MMPFileManagement.tsx',                          'features/mmp/components/MMPFileManagement.tsx'],
  ['components/mmp/MMPFileUpload.tsx',                              'features/mmp/components/MMPFileUpload.tsx'],
  ['components/mmp/MMPFomPermitUpload.tsx',                         'features/mmp/components/MMPFomPermitUpload.tsx'],
  ['components/mmp/MMPHeader.tsx',                                  'features/mmp/components/MMPHeader.tsx'],
  ['components/mmp/MMPOverviewCard.tsx',                            'features/mmp/components/MMPOverviewCard.tsx'],
  ['components/mmp/MMPPartialUpdate.tsx',                           'features/mmp/components/MMPPartialUpdate.tsx'],
  ['components/mmp/MMPProgressDialog.tsx',                          'features/mmp/components/MMPProgressDialog.tsx'],
  ['components/mmp/MMPSiteEntriesTable.tsx',                        'features/mmp/components/MMPSiteEntriesTable.tsx'],
  ['components/mmp/MMPStatusBadge.tsx',                             'features/mmp/components/MMPStatusBadge.tsx'],
  ['components/mmp/MmpFilterBar.tsx',                               'features/mmp/components/MmpFilterBar.tsx'],
  ['components/mmp/MMPVersionHistoryCard.tsx',                      'features/mmp/components/MMPVersionHistoryCard.tsx'],
  ['components/mmp/MonitoringPlanSummary.tsx',                      'features/mmp/components/MonitoringPlanSummary.tsx'],
  ['components/mmp/PendingPostponementApprovals.tsx',               'features/mmp/components/PendingPostponementApprovals.tsx'],
  ['components/mmp/PendingRecallApprovals.tsx',                     'features/mmp/components/PendingRecallApprovals.tsx'],
  ['components/mmp/PostponementDialog.tsx',                         'features/mmp/components/PostponementDialog.tsx'],
  ['components/mmp/RecallDialog.tsx',                               'features/mmp/components/RecallDialog.tsx'],
  ['components/mmp/RecallHistory.tsx',                              'features/mmp/components/RecallHistory.tsx'],
  ['components/mmp/ReclaimFromCoordinatorDialog.tsx',               'features/mmp/components/ReclaimFromCoordinatorDialog.tsx'],
  ['components/mmp/RecoveryDashboard.tsx',                          'features/mmp/components/RecoveryDashboard.tsx'],
  ['components/mmp/SiteAuditTrail.tsx',                             'features/mmp/components/SiteAuditTrail.tsx'],
  ['components/mmp/SiteDetailDialog.tsx',                           'features/mmp/components/SiteDetailDialog.tsx'],
  ['components/mmp/SiteEntryUserInfo.tsx',                          'features/mmp/components/SiteEntryUserInfo.tsx'],
  ['components/mmp/VarianceAlertBanner.tsx',                        'features/mmp/components/VarianceAlertBanner.tsx'],
  ['components/mmp/WorkflowTrackerTab.tsx',                         'features/mmp/components/WorkflowTrackerTab.tsx'],
  ['components/mmp/CoordinatorSummaryCard.tsx',                     'features/mmp/components/CoordinatorSummaryCard.tsx'],
  ['components/mmp/DispatchSitesDialog.tsx',                        'features/mmp/components/DispatchSitesDialog.tsx'],
  ['components/mmp/MMPList.tsx',                                    'features/mmp/components/MMPList.tsx'],
  // notifications/
  ['components/notifications/ActionableNotification.tsx',           'features/notifications/components/ActionableNotification.tsx'],
  ['components/notifications/mobile/MobileNotificationView.tsx',    'features/notifications/components/mobile/MobileNotificationView.tsx'],
  ['components/notifications/shared/NotificationBubble.tsx',        'features/notifications/components/shared/NotificationBubble.tsx'],
  ['components/notifications/shared/NotificationListItem.tsx',      'features/notifications/components/shared/NotificationListItem.tsx'],
  ['components/notifications/web/NotificationList.tsx',             'features/notifications/components/web/NotificationList.tsx'],
  ['components/notifications/web/NotificationPopup.tsx',            'features/notifications/components/web/NotificationPopup.tsx'],
  ['components/notifications/web/WebNotificationView.tsx',          'features/notifications/components/web/WebNotificationView.tsx'],
  // project/
  ['components/project/ActivityTimeline.tsx',                       'features/project/components/ActivityTimeline.tsx'],
  ['components/project/ProjectCostTab.tsx',                         'features/project/components/ProjectCostTab.tsx'],
  ['components/project/ProjectDetail.tsx',                          'features/project/components/ProjectDetail.tsx'],
  ['components/project/ProjectForm.tsx',                            'features/project/components/ProjectForm.tsx'],
  ['components/project/ProjectList.tsx',                            'features/project/components/ProjectList.tsx'],
  ['components/project/TeamMemberCard.tsx',                         'features/project/components/TeamMemberCard.tsx'],
  ['components/project/activity/ActivityForm.tsx',                  'features/project/components/activity/ActivityForm.tsx'],
  ['components/project/activity/ActivityManager.tsx',               'features/project/components/activity/ActivityManager.tsx'],
  ['components/project/activity/SubActivityForm.tsx',               'features/project/components/activity/SubActivityForm.tsx'],
  ['components/project/team/TeamCompositionManager.tsx',            'features/project/components/team/TeamCompositionManager.tsx'],
  ['components/project/team/UserCalendarAvailability.tsx',          'features/project/components/team/UserCalendarAvailability.tsx'],
  ['components/project/team/UserProjectHistory.tsx',                'features/project/components/team/UserProjectHistory.tsx'],
  // reports/
  ['components/reports/AnalyticsReports.tsx',                       'features/reports/components/AnalyticsReports.tsx'],
  ['components/reports/AuditingReports.tsx',                        'features/reports/components/AuditingReports.tsx'],
  ['components/reports/DocumentsReport.tsx',                        'features/reports/components/DocumentsReport.tsx'],
  ['components/reports/ExecutiveDashboard.tsx',                     'features/reports/components/ExecutiveDashboard.tsx'],
  ['components/reports/FinancialReports.tsx',                       'features/reports/components/FinancialReports.tsx'],
  ['components/reports/ProjectCostReports.tsx',                     'features/reports/components/ProjectCostReports.tsx'],
  ['components/reports/ReceiptsReport.tsx',                         'features/reports/components/ReceiptsReport.tsx'],
  ['components/reports/ReportChart.tsx',                            'features/reports/components/ReportChart.tsx'],
  ['components/reports/SignaturesReport.tsx',                       'features/reports/components/SignaturesReport.tsx'],
  // settings/
  ['components/settings/AutoReleaseSettings.tsx',                   'features/settings/components/AutoReleaseSettings.tsx'],
  ['components/settings/ConfirmationDeadlineSettings.tsx',          'features/settings/components/ConfirmationDeadlineSettings.tsx'],
  ['components/settings/NotificationSettings.tsx',                  'features/settings/components/NotificationSettings.tsx'],
  // signature/ → documents
  ['components/signature/MobileSignaturePad.tsx',                   'features/documents/components/signature/MobileSignaturePad.tsx'],
  ['components/signature/SignatureAnalytics.tsx',                   'features/documents/components/signature/SignatureAnalytics.tsx'],
  ['components/signature/SignatureAuditLog.tsx',                    'features/documents/components/signature/SignatureAuditLog.tsx'],
  ['components/signature/SignatureConfirmationDialog.tsx',          'features/documents/components/signature/SignatureConfirmationDialog.tsx'],
  ['components/signature/SignatureManager.tsx',                     'features/documents/components/signature/SignatureManager.tsx'],
  ['components/signature/SignaturePad.tsx',                         'features/documents/components/signature/SignaturePad.tsx'],
  ['components/signature/SignatureVerificationPanel.tsx',           'features/documents/components/signature/SignatureVerificationPanel.tsx'],
  // site-visit/
  ['components/site-visit/AssignCollectorButton.tsx',               'features/siteVisit/components/AssignCollectorButton.tsx'],
  ['components/site-visit/AssignmentMap.tsx',                       'features/siteVisit/components/AssignmentMap.tsx'],
  ['components/site-visit/AssignmentNotification.tsx',              'features/siteVisit/components/AssignmentNotification.tsx'],
  ['components/site-visit/BatchConfirmation.tsx',                   'features/siteVisit/components/BatchConfirmation.tsx'],
  ['components/site-visit/CollectorCard.tsx',                       'features/siteVisit/components/CollectorCard.tsx'],
  ['components/site-visit/CollectorFilters.tsx',                    'features/siteVisit/components/CollectorFilters.tsx'],
  ['components/site-visit/CompletedVisitReportCard.tsx',            'features/siteVisit/components/CompletedVisitReportCard.tsx'],
  ['components/site-visit/ConfirmationAcknowledgment.tsx',          'features/siteVisit/components/ConfirmationAcknowledgment.tsx'],
  ['components/site-visit/ConfirmationDeadlineCountdown.tsx',       'features/siteVisit/components/ConfirmationDeadlineCountdown.tsx'],
  ['components/site-visit/ConfirmationHistoryLog.tsx',              'features/siteVisit/components/ConfirmationHistoryLog.tsx'],
  ['components/site-visit/EditSiteEntryForm.tsx',                   'features/siteVisit/components/EditSiteEntryForm.tsx'],
  ['components/site-visit/EnhancedAssignmentNotification.tsx',      'features/siteVisit/components/EnhancedAssignmentNotification.tsx'],
  ['components/site-visit/FOMSiteVisitsDashboard.tsx',              'features/siteVisit/components/FOMSiteVisitsDashboard.tsx'],
  ['components/site-visit/MMPInfoCard.tsx',                         'features/siteVisit/components/MMPInfoCard.tsx'],
  ['components/site-visit/NearestEnumeratorsCard.tsx',              'features/siteVisit/components/NearestEnumeratorsCard.tsx'],
  ['components/site-visit/RequestDownPaymentButton.tsx',            'features/siteVisit/components/RequestDownPaymentButton.tsx'],
  ['components/site-visit/SiteEntryCard.tsx',                       'features/siteVisit/components/SiteEntryCard.tsx'],
  ['components/site-visit/SiteVisitAuditTrail.tsx',                 'features/siteVisit/components/SiteVisitAuditTrail.tsx'],
  ['components/site-visit/SiteVisitCard.tsx',                       'features/siteVisit/components/SiteVisitCard.tsx'],
  ['components/site-visit/SiteVisitConfirmation.tsx',               'features/siteVisit/components/SiteVisitConfirmation.tsx'],
  ['components/site-visit/SiteVisitCosts.tsx',                      'features/siteVisit/components/SiteVisitCosts.tsx'],
  ['components/site-visit/SiteVisitCostsUnified.tsx',               'features/siteVisit/components/SiteVisitCostsUnified.tsx'],
  ['components/site-visit/SiteVisitDates.tsx',                      'features/siteVisit/components/SiteVisitDates.tsx'],
  ['components/site-visit/SiteVisitHeader.tsx',                     'features/siteVisit/components/SiteVisitHeader.tsx'],
  ['components/site-visit/SiteVisitInfo.tsx',                       'features/siteVisit/components/SiteVisitInfo.tsx'],
  ['components/site-visit/SiteVisitStats.tsx',                      'features/siteVisit/components/SiteVisitStats.tsx'],
  ['components/site-visit/SiteVisitsByState.tsx',                   'features/siteVisit/components/SiteVisitsByState.tsx'],
  ['components/site-visit/SmartCollectorSelector.tsx',              'features/siteVisit/components/SmartCollectorSelector.tsx'],
  ['components/site-visit/StartVisitDialog.tsx',                    'features/siteVisit/components/StartVisitDialog.tsx'],
  ['components/site-visit/ViewToggle.tsx',                          'features/siteVisit/components/ViewToggle.tsx'],
  ['components/site-visit/VisitFilters.tsx',                        'features/siteVisit/components/VisitFilters.tsx'],
  ['components/site-visit/VisitReportDialog.tsx',                   'features/siteVisit/components/VisitReportDialog.tsx'],

  // ── PAGES → features/ ────────────────────────────────────────────────────
  // admin
  ['pages/AdminBroadcast.tsx',                                      'features/admin/AdminBroadcast.tsx'],
  ['pages/DataVisibility.tsx',                                      'features/admin/DataVisibility.tsx'],
  ['pages/DemoDataCollector.tsx',                                   'features/admin/DemoDataCollector.tsx'],
  ['pages/EmailManagement.tsx',                                     'features/admin/EmailManagement.tsx'],
  ['pages/EmailPreviewPage.tsx',                                    'features/admin/EmailPreviewPage.tsx'],
  ['pages/EmailTracking.tsx',                                       'features/admin/EmailTracking.tsx'],
  ['pages/Equipment.tsx',                                           'features/admin/Equipment.tsx'],
  ['pages/HubManagement.tsx',                                       'features/admin/HubManagement.tsx'],
  ['pages/HubOperations.tsx',                                       'features/admin/HubOperations.tsx'],
  ['pages/IncidentReports.tsx',                                     'features/admin/IncidentReports.tsx'],
  ['pages/MobileSignatureAdmin.tsx',                                'features/admin/MobileSignatureAdmin.tsx'],
  ['pages/MobileSupportTickets.tsx',                                'features/admin/MobileSupportTickets.tsx'],
  ['pages/SafetyHub.tsx',                                           'features/admin/SafetyHub.tsx'],
  ['pages/Helpline.tsx',                                            'features/admin/Helpline.tsx'],
  ['pages/SupportContacts.tsx',                                     'features/admin/SupportContacts.tsx'],
  ['pages/MobileHelpArticles.tsx',                                  'features/admin/MobileHelpArticles.tsx'],
  // analytics
  ['pages/QuestionnaireAnalytics.tsx',                              'features/analytics/QuestionnaireAnalytics.tsx'],
  ['features/analytics/QuestionnaireAnalyticsPageImpl.tsx',        'features/analytics/QuestionnaireAnalyticsImpl.tsx'],
  // approval
  ['pages/ApprovalDashboard.tsx',                                   'features/approval/ApprovalDashboard.tsx'],
  ['pages/SupervisorApprovals.tsx',                                 'features/approval/SupervisorApprovals.tsx'],
  // archive
  ['pages/Archive.tsx',                                             'features/archive/Archive.tsx'],
  // audit
  ['pages/AuditCompliance.tsx',                                     'features/audit/AuditCompliance.tsx'],
  ['pages/AuditLogs.tsx',                                           'features/audit/AuditLogs.tsx'],
  // auth
  ['pages/Auth.tsx',                                                'features/auth/Auth.tsx'],
  ['pages/ForgotPassword.tsx',                                      'features/auth/ForgotPassword.tsx'],
  ['pages/Login.tsx',                                               'features/auth/Login.tsx'],
  ['pages/Login/LoginBanner.tsx',                                   'features/auth/components/LoginBanner.tsx'],
  ['pages/Login/LoginSystemInfo.tsx',                               'features/auth/components/LoginSystemInfo.tsx'],
  ['pages/LoginAnalytics.tsx',                                      'features/auth/LoginAnalytics.tsx'],
  ['pages/Register.tsx',                                            'features/auth/Register.tsx'],
  ['pages/RegistrationSuccess.tsx',                                 'features/auth/RegistrationSuccess.tsx'],
  ['pages/ResetPassword.tsx',                                       'features/auth/ResetPassword.tsx'],
  // budget
  ['pages/Budget.tsx',                                              'features/budget/Budget.tsx'],
  // calls
  ['pages/Calls.tsx',                                               'features/calls/Calls.tsx'],
  ['pages/CallAnalytics.tsx',                                       'features/calls/CallAnalytics.tsx'],
  ['pages/MobileCallScheduling.tsx',                                'features/calls/MobileCallScheduling.tsx'],
  // calendar
  ['pages/Calendar.tsx',                                            'features/calendar/Calendar.tsx'],
  // chat
  ['pages/Chat.tsx',                                                'features/chat/Chat.tsx'],
  // classification
  ['pages/Classifications.tsx',                                     'features/classification/Classifications.tsx'],
  ['pages/ClassificationFeeManagement.tsx',                         'features/classification/ClassificationFeeManagement.tsx'],
  // coordinator
  ['pages/coordinator/CoordinatorDashboard.tsx',                   'features/coordinator/CoordinatorDashboard.tsx'],
  ['pages/coordinator/SitesForVerification.tsx',                   'features/coordinator/SitesForVerification.tsx'],
  ['pages/ReviewAssignCoordinators.tsx',                            'features/coordinator/ReviewAssignCoordinators.tsx'],
  ['features/coordinator/CoordinatorSitesPageImpl.tsx',            'features/coordinator/CoordinatorSitesImpl.tsx'],
  // costApproval
  ['pages/CostSubmission.tsx',                                      'features/costApproval/CostSubmission.tsx'],
  ['pages/CostPredictions.tsx',                                     'features/costApproval/CostPredictions.tsx'],
  ['pages/CostSubmissionReports.tsx',                               'features/costApproval/CostSubmissionReports.tsx'],
  ['pages/MobileCostSubmission.tsx',                                'features/costApproval/MobileCostSubmission.tsx'],
  ['features/cost/CostSubmissionPageImpl.tsx',                     'features/costApproval/CostSubmissionImpl.tsx'],
  ['features/cost/CostPredictionsPageImpl.tsx',                    'features/costApproval/CostPredictionsImpl.tsx'],
  // dashboard
  ['pages/Index.tsx',                                               'features/dashboard/Index.tsx'],
  ['pages/Dashboard.tsx',                                           'features/dashboard/Dashboard.tsx'],
  // documents
  ['pages/Documentation.tsx',                                       'features/documents/Documentation.tsx'],
  ['pages/MobileDocumentation.tsx',                                 'features/documents/MobileDocumentation.tsx'],
  ['pages/MobileDocumentSync.tsx',                                  'features/documents/MobileDocumentSync.tsx'],
  ['pages/PublicDocumentation.tsx',                                 'features/documents/PublicDocumentation.tsx'],
  ['pages/StaffDirectory.tsx',                                      'features/documents/StaffDirectory.tsx'],
  ['pages/DataExportCenter.tsx',                                    'features/documents/DataExportCenter.tsx'],
  ['features/documents/DocumentsPageImpl.tsx',                     'features/documents/DocumentsImpl.tsx'],
  // downPayment
  ['pages/DownPaymentApproval.tsx',                                 'features/downPayment/DownPaymentApproval.tsx'],
  // finance
  ['pages/Finance.tsx',                                             'features/finance/Finance.tsx'],
  ['pages/FinancialOperations.tsx',                                 'features/finance/FinancialOperations.tsx'],
  ['pages/FinanceApproval.tsx',                                     'features/finance/FinanceApproval.tsx'],
  ['pages/ReconciliationDashboard.tsx',                             'features/finance/ReconciliationDashboard.tsx'],
  ['pages/RetainerManagement.tsx',                                  'features/finance/RetainerManagement.tsx'],
  ['pages/ExchangeRates.tsx',                                       'features/finance/ExchangeRates.tsx'],
  // location
  ['pages/AdvancedMap.tsx',                                         'features/location/AdvancedMap.tsx'],
  // mmp
  ['pages/MMP.tsx',                                                 'features/mmp/MMP.tsx'],
  ['pages/EditMMP.tsx',                                             'features/mmp/EditMMP.tsx'],
  ['pages/MMPCycleClose.tsx',                                       'features/mmp/MMPCycleClose.tsx'],
  ['pages/MMPDetail.tsx',                                           'features/mmp/MMPDetail.tsx'],
  ['pages/MMPDetailView.tsx',                                       'features/mmp/MMPDetailView.tsx'],
  ['pages/MMPDetailedVerification.tsx',                             'features/mmp/MMPDetailedVerification.tsx'],
  ['pages/MMPUpload.tsx',                                           'features/mmp/MMPUpload.tsx'],
  ['pages/MMPVerification.tsx',                                     'features/mmp/MMPVerification.tsx'],
  ['pages/MMPVerificationPage.tsx',                                 'features/mmp/MMPVerificationPage.tsx'],
  ['pages/mmp/CoordinatorSites.tsx',                               'features/mmp/CoordinatorSites.tsx'],
  ['pages/mmp/MMPForwardToCoordinatorPage.tsx',                    'features/mmp/MMPForwardToCoordinatorPage.tsx'],
  ['pages/mmp/MMPForwardToFOMPage.tsx',                            'features/mmp/MMPForwardToFOMPage.tsx'],
  ['pages/mmp/MMPPermitMessagePage.tsx',                           'features/mmp/MMPPermitMessagePage.tsx'],
  ['pages/mmp/MMPPreviewPage.tsx',                                  'features/mmp/MMPPreviewPage.tsx'],
  ['pages/mmp/MMPValidationPage.tsx',                               'features/mmp/MMPValidationPage.tsx'],
  ['pages/mmp/MMPVerificationPage.tsx',                             'features/mmp/MMPVerificationPage2.tsx'],
  ['pages/mmp/PermitPreview.tsx',                                   'features/mmp/PermitPreview.tsx'],
  ['pages/mmp/PermitUpload.tsx',                                    'features/mmp/PermitUpload.tsx'],
  ['features/mmp/MMPPageImpl.tsx',                                  'features/mmp/MMPImpl.tsx'],
  // notifications
  ['pages/NotificationAnalytics.tsx',                               'features/notifications/NotificationAnalytics.tsx'],
  ['pages/NotificationHistory.tsx',                                 'features/notifications/NotificationHistory.tsx'],
  ['pages/NotificationPreferences.tsx',                             'features/notifications/NotificationPreferences.tsx'],
  ['pages/Notifications.tsx',                                       'features/notifications/Notifications.tsx'],
  // project
  ['pages/CreateProject.tsx',                                       'features/project/CreateProject.tsx'],
  ['pages/CreateProjectActivity.tsx',                               'features/project/CreateProjectActivity.tsx'],
  ['pages/EditProject.tsx',                                         'features/project/EditProject.tsx'],
  ['pages/ProjectActivityDetail.tsx',                               'features/project/ProjectActivityDetail.tsx'],
  ['pages/ProjectDetail.tsx',                                       'features/project/ProjectDetail.tsx'],
  ['pages/ProjectTeamManagement.tsx',                               'features/project/ProjectTeamManagement.tsx'],
  ['pages/Projects.tsx',                                            'features/project/Projects.tsx'],
  // reports
  ['pages/AdvanceRequestsReport.tsx',                               'features/reports/AdvanceRequestsReport.tsx'],
  ['pages/Reports.tsx',                                             'features/reports/Reports.tsx'],
  ['features/reports/AdvanceRequestsReportPageImpl.tsx',           'features/reports/AdvanceRequestsReportImpl.tsx'],
  // roleManagement
  ['pages/RoleManagement.tsx',                                      'features/roleManagement/RoleManagement.tsx'],
  ['pages/RolePerspectiveViewer.tsx',                               'features/roleManagement/RolePerspectiveViewer.tsx'],
  ['pages/PermissionsManagement.tsx',                               'features/roleManagement/PermissionsManagement.tsx'],
  // settings
  ['pages/Settings.tsx',                                            'features/settings/Settings.tsx'],
  // siteVisit
  ['pages/CreateSiteVisit.tsx',                                     'features/siteVisit/CreateSiteVisit.tsx'],
  ['pages/CreateSiteVisitMMP.tsx',                                  'features/siteVisit/CreateSiteVisitMMP.tsx'],
  ['pages/CreateSiteVisitMMPDetail.tsx',                            'features/siteVisit/CreateSiteVisitMMPDetail.tsx'],
  ['pages/CreateSiteVisitUrgent.tsx',                               'features/siteVisit/CreateSiteVisitUrgent.tsx'],
  ['pages/EditSiteVisit.tsx',                                       'features/siteVisit/EditSiteVisit.tsx'],
  ['pages/EnumeratorAvailableSites.tsx',                            'features/siteVisit/EnumeratorAvailableSites.tsx'],
  ['pages/EnumeratorMySites.tsx',                                   'features/siteVisit/EnumeratorMySites.tsx'],
  ['pages/EnumeratorSmartAssigned.tsx',                             'features/siteVisit/EnumeratorSmartAssigned.tsx'],
  ['pages/MonitoringForm.tsx',                                      'features/siteVisit/MonitoringForm.tsx'],
  ['pages/MonitoringPlanPage.tsx',                                  'features/siteVisit/MonitoringPlanPage.tsx'],
  ['pages/SiteVisitDetail.tsx',                                     'features/siteVisit/SiteVisitDetail.tsx'],
  ['pages/SiteVisits.tsx',                                          'features/siteVisit/SiteVisits.tsx'],
  ['pages/TrackerPreparationPlan.tsx',                              'features/siteVisit/TrackerPreparationPlan.tsx'],
  // user
  ['pages/FieldTeam.tsx',                                           'features/user/FieldTeam.tsx'],
  ['pages/UserDetail.tsx',                                          'features/user/UserDetail.tsx'],
  ['pages/Users.tsx',                                               'features/user/Users.tsx'],
  // wallet
  ['pages/AdminWalletDetail.tsx',                                   'features/wallet/AdminWalletDetail.tsx'],
  ['pages/AdminWallets.tsx',                                        'features/wallet/AdminWallets.tsx'],
  ['pages/TransactionScanner.tsx',                                  'features/wallet/TransactionScanner.tsx'],
  ['pages/Wallet.tsx',                                              'features/wallet/Wallet.tsx'],
  ['pages/WalletReports.tsx',                                       'features/wallet/WalletReports.tsx'],
  ['pages/WithdrawalApproval.tsx',                                  'features/wallet/WithdrawalApproval.tsx'],
  // misc
  ['pages/NotFound.tsx',                                            'app/NotFound.tsx'],
  ['pages/GlobalSearchPage.tsx',                                    'shared/pages/GlobalSearchPage.tsx'],

  // ── HOOKS (domain-specific → features/) ──────────────────────────────────
  ['hooks/use-realtime-site-visits.ts',                             'features/siteVisit/hooks/use-realtime-site-visits.ts'],
  ['hooks/use-site-assignment.ts',                                  'features/siteVisit/hooks/use-site-assignment.ts'],
  ['hooks/use-site-claim-realtime.ts',                              'features/siteVisit/hooks/use-site-claim-realtime.ts'],
  ['hooks/use-site-visit-reminders.tsx',                            'features/siteVisit/hooks/use-site-visit-reminders.tsx'],
  ['hooks/use-site-visit-reminders-ui.tsx',                         'features/siteVisit/hooks/use-site-visit-reminders-ui.tsx'],
  ['hooks/use-auto-release.ts',                                     'features/siteVisit/hooks/use-auto-release.ts'],
  ['hooks/use-auto-release-scheduler.ts',                           'features/siteVisit/hooks/use-auto-release-scheduler.ts'],
  ['hooks/use-claim-fee-calculation.ts',                            'features/siteVisit/hooks/use-claim-fee-calculation.ts'],
  ['hooks/use-assignment-tracker.ts',                               'features/siteVisit/hooks/use-assignment-tracker.ts'],
  ['hooks/use-geofencing.ts',                                       'features/location/hooks/use-geofencing.ts'],
  ['hooks/use-background-location.tsx',                             'features/location/hooks/use-background-location.tsx'],
  ['hooks/use-battery-location.tsx',                                'features/location/hooks/use-battery-location.tsx'],
  ['hooks/use-realtime-team-locations.ts',                          'features/location/hooks/use-realtime-team-locations.ts'],
  ['hooks/use-notification.ts',                                     'features/notifications/hooks/use-notification.ts'],
  ['hooks/use-notification-badge.ts',                               'features/notifications/hooks/use-notification-badge.ts'],
  ['hooks/use-notification-cleanup.ts',                             'features/notifications/hooks/use-notification-cleanup.ts'],
  ['hooks/use-notification-manager.ts',                             'features/notifications/hooks/use-notification-manager.ts'],
  ['hooks/use-notification-pin.ts',                                 'features/notifications/hooks/use-notification-pin.ts'],
  ['hooks/use-notification-receipts.ts',                            'features/notifications/hooks/use-notification-receipts.ts'],
  ['hooks/use-notification-snooze.ts',                              'features/notifications/hooks/use-notification-snooze.ts'],
  ['hooks/use-notification-sound.ts',                               'features/notifications/hooks/use-notification-sound.ts'],
  ['hooks/use-browser-notifications.ts',                            'features/notifications/hooks/use-browser-notifications.ts'],
  ['hooks/use-push-notifications.ts',                               'features/notifications/hooks/use-push-notifications.ts'],
  ['hooks/usePersistentNotifications.ts',                           'features/notifications/hooks/usePersistentNotifications.ts'],
  ['hooks/notifications/useNotificationAnimation.ts',               'features/notifications/hooks/useNotificationAnimation.ts'],
  ['hooks/notifications/useNotificationSound.ts',                   'features/notifications/hooks/useNotificationSound.ts'],
  ['hooks/useBudgetRestriction.ts',                                 'features/budget/hooks/useBudgetRestriction.ts'],
  ['hooks/useWithdrawalRealtime.ts',                                'features/wallet/hooks/useWithdrawalRealtime.ts'],
  ['hooks/useRecallMMP.ts',                                         'features/mmp/hooks/useRecallMMP.ts'],
  ['hooks/use-zone-mmp-analytics.ts',                               'features/mmp/hooks/use-zone-mmp-analytics.ts'],
  ['hooks/useUserProjects.ts',                                      'features/project/hooks/useUserProjects.ts'],
  ['hooks/useCallSounds.ts',                                        'features/calls/hooks/useCallSounds.ts'],
  ['hooks/use-call-manager.tsx',                                    'features/calls/hooks/use-call-manager.tsx'],
  ['hooks/use-do-not-disturb.ts',                                   'features/calls/hooks/use-do-not-disturb.ts'],
  ['hooks/use-mfa.ts',                                              'features/auth/hooks/use-mfa.ts'],
  ['hooks/use-biometric.tsx',                                       'features/auth/hooks/use-biometric.tsx'],
  ['hooks/use-authorization.ts',                                    'features/auth/hooks/use-authorization.ts'],
  ['hooks/use-registration-form.ts',                                'features/auth/hooks/use-registration-form.ts'],
  ['hooks/useSessionTimeout.ts',                                    'features/auth/hooks/useSessionTimeout.ts'],
  ['hooks/useSignatureEnforcement.ts',                              'features/documents/hooks/useSignatureEnforcement.ts'],
  ['hooks/useSignatureRequired.ts',                                 'features/documents/hooks/useSignatureRequired.ts'],
  ['hooks/use-signature.ts',                                        'features/documents/hooks/use-signature.ts'],
  ['hooks/use-audit-log.ts',                                        'features/audit/hooks/use-audit-log.ts'],
  ['hooks/useLiveDashboard.ts',                                     'features/dashboard/hooks/useLiveDashboard.ts'],
  ['hooks/useLiveDashboardCore.ts',                                 'features/dashboard/hooks/useLiveDashboardCore.ts'],
  ['hooks/use-android-back.tsx',                                    'platform/mobile/hooks/use-android-back.tsx'],
  ['hooks/use-mobile-extended-settings.ts',                         'platform/mobile/hooks/use-mobile-extended-settings.ts'],
  ['hooks/use-mobile-permissions.tsx',                              'platform/mobile/hooks/use-mobile-permissions.tsx'],
  ['hooks/useFCM.ts',                                               'platform/mobile/hooks/useFCM.ts'],
  ['hooks/use-service-worker.ts',                                   'platform/web/hooks/use-service-worker.ts'],
  ['hooks/useOfflineData.ts',                                       'platform/mobile/hooks/useOfflineData.ts'],
  ['hooks/useOfflineSiteVisit.ts',                                  'platform/mobile/hooks/useOfflineSiteVisit.ts'],
  // shared hooks
  ['hooks/useRealtimeHealth.ts',                                    'shared/hooks/useRealtimeHealth.ts'],
  ['hooks/useRealtimeResource.ts',                                  'shared/hooks/useRealtimeResource.ts'],
  ['hooks/useRealtimeTable.ts',                                     'shared/hooks/useRealtimeTable.ts'],
  ['hooks/useMutationHandlers.tsx',                                 'shared/hooks/useMutationHandlers.tsx'],
  ['hooks/useFocusReconnect.ts',                                    'shared/hooks/useFocusReconnect.ts'],
  ['hooks/useApi.ts',                                               'shared/hooks/useApi.ts'],
  ['hooks/useCustomHook.ts',                                        'shared/hooks/useCustomHook.ts'],
  ['hooks/useDebounce.ts',                                          'shared/hooks/useDebounce.ts'],
  ['hooks/toast/index.ts',                                          'shared/hooks/toast/index.ts'],
  ['hooks/toast/toast-reducer.ts',                                  'shared/hooks/toast/toast-reducer.ts'],
  ['hooks/toast/types.ts',                                          'shared/hooks/toast/types.ts'],
  ['hooks/toast/utils.ts',                                          'shared/hooks/toast/utils.ts'],
  ['hooks/use-roles.ts',                                            'shared/hooks/use-roles.ts'],
  ['hooks/use-offline.tsx',                                         'shared/hooks/use-offline.tsx'],
  ['hooks/use-mobile.tsx',                                          'shared/hooks/use-mobile.tsx'],
  ['hooks/use-toast.ts',                                            'shared/hooks/use-toast.ts'],
  ['hooks/use-unified-navigation.ts',                               'shared/hooks/use-unified-navigation.ts'],
  ['hooks/useTheme.ts',                                             'shared/hooks/useTheme.ts'],
  ['hooks/useWhatsAppNotifications.ts',                             'shared/hooks/useWhatsAppNotifications.ts'],
  ['hooks/use-form-autosave.tsx',                                   'shared/hooks/use-form-autosave.tsx'],
  ['hooks/use-device.tsx',                                          'shared/hooks/use-device.tsx'],

  // ── LIB → platform/mobile or shared/lib ──────────────────────────────────
  ['lib/battery-location.ts',                                       'platform/mobile/battery-location.ts'],
  ['lib/batteryOptimizer.ts',                                       'platform/mobile/batteryOptimizer.ts'],
  ['lib/biometric-auth.ts',                                         'platform/mobile/biometric-auth.ts'],
  ['lib/capacitor-init.ts',                                         'platform/mobile/capacitor-init.ts'],
  ['lib/deepLinking.ts',                                            'platform/mobile/deepLinking.ts'],
  ['lib/device-trust.ts',                                           'platform/mobile/device-trust.ts'],
  ['lib/deviceFingerprint.ts',                                      'platform/mobile/deviceFingerprint.ts'],
  ['lib/enhanced-haptics.ts',                                       'platform/mobile/enhanced-haptics.ts'],
  ['lib/geofencing.ts',                                             'platform/mobile/geofencing.ts'],
  ['lib/haptics.ts',                                                'platform/mobile/haptics.ts'],
  ['lib/image-compression.ts',                                      'platform/mobile/image-compression.ts'],
  ['lib/mobile-docs-export.ts',                                     'platform/mobile/mobile-docs-export.ts'],
  ['lib/mobile-gradients.ts',                                       'platform/mobile/mobile-gradients.ts'],
  ['lib/offline-db.ts',                                             'platform/mobile/offline-db.ts'],
  ['lib/offline-form-autosave.ts',                                  'platform/mobile/offline-form-autosave.ts'],
  ['lib/offline-map-cache.ts',                                      'platform/mobile/offline-map-cache.ts'],
  ['lib/offline-map-tiles.ts',                                      'platform/mobile/offline-map-tiles.ts'],
  ['lib/offline-media-queue.ts',                                    'platform/mobile/offline-media-queue.ts'],
  ['lib/offline-prefetch.ts',                                       'platform/mobile/offline-prefetch.ts'],
  ['lib/app-update.ts',                                             'platform/web/app-update.ts'],
  ['lib/app-update-checker.ts',                                     'platform/web/app-update-checker.ts'],
  ['lib/crashlytics.ts',                                            'platform/mobile/crashlytics.ts'],
  ['lib/mfa-session.ts',                                            'features/auth/lib/mfa-session.ts'],
  ['lib/login-tracking.ts',                                         'features/auth/lib/login-tracking.ts'],
  ['lib/recall-cache.ts',                                           'features/mmp/lib/recall-cache.ts'],
  ['lib/recall-offline.ts',                                         'features/mmp/lib/recall-offline.ts'],
  ['lib/wallet/export.ts',                                          'features/wallet/lib/export.ts'],

  // ── ROUTES ────────────────────────────────────────────────────────────────
  ['routes/MMPRoutes.tsx',                                          'app/routes/MMPRoutes.tsx'],
];

// ─── DYNAMIC: mobile components → platform/mobile/components/ ────────────────
function discoverMobileComponents() {
  const mobileDir = path.join(SRC, 'components', 'mobile');
  if (!fs.existsSync(mobileDir)) return [];
  const moves = [];
  function walk(dir, rel) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, relPath);
      } else if (/\.(tsx?|js)$/.test(entry.name)) {
        moves.push([
          `components/mobile/${relPath}`,
          `platform/mobile/components/${relPath}`,
        ]);
      }
    }
  }
  walk(mobileDir, '');
  return moves;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getAllTsFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
      results.push(...getAllTsFiles(full));
    } else if (/\.(tsx?|js)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function stripExt(p) {
  return p.replace(/\.(tsx?|js)$/, '');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
function main() {
  const allMoves = [...STATIC_MOVES, ...discoverMobileComponents()];

  // Deduplicate: if two sources map to same dest, warn and skip second
  const destSeen = new Map();
  const deduped = [];
  for (const [from, to] of allMoves) {
    if (destSeen.has(to)) {
      console.warn(`CONFLICT: both "${destSeen.get(to)}" and "${from}" map to "${to}" — skipping second`);
      continue;
    }
    destSeen.set(to, from);
    deduped.push([from, to]);
  }

  // ── Step 1: Move files ────────────────────────────────────────────────────
  console.log('\n=== STEP 1: Moving files ===\n');
  let moved = 0, skipped = 0;

  for (const [from, to] of deduped) {
    const fromAbs = path.join(SRC, from);
    const toAbs   = path.join(SRC, to);

    if (!fs.existsSync(fromAbs)) {
      console.log(`SKIP (not found): ${from}`);
      skipped++;
      continue;
    }
    if (fs.existsSync(toAbs)) {
      console.log(`SKIP (dest exists): ${to}`);
      skipped++;
      continue;
    }

    fs.mkdirSync(path.dirname(toAbs), { recursive: true });
    fs.renameSync(fromAbs, toAbs);
    console.log(`MOVED: ${from}`);
    console.log(`    → ${to}`);
    moved++;
  }

  console.log(`\nMoved: ${moved}  Skipped: ${skipped}\n`);

  // ── Step 2: Build @/ import replacement map ───────────────────────────────
  console.log('=== STEP 2: Building import map ===\n');
  const importMap = new Map(); // oldPath → newPath (both without extensions, with @/ prefix)

  for (const [from, to] of deduped) {
    const oldImport = `@/${stripExt(from)}`;
    const newImport = `@/${stripExt(to)}`;
    if (oldImport !== newImport) {
      importMap.set(oldImport, newImport);
    }
  }

  console.log(`Import map has ${importMap.size} entries\n`);

  // ── Step 3: Update imports in all source files ────────────────────────────
  console.log('=== STEP 3: Updating imports ===\n');

  // Scan the whole project root (src + vite.config etc)
  const searchDirs = [SRC, path.join(ROOT, 'scripts')];
  const allFiles = searchDirs.flatMap(getAllTsFiles);

  // Sort longer paths first so more-specific replacements take precedence
  const sortedEntries = [...importMap.entries()].sort(
    ([a], [b]) => b.length - a.length
  );

  let filesUpdated = 0;

  for (const filePath of allFiles) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    let updated = content;

    for (const [oldImport, newImport] of sortedEntries) {
      // Match: from '@/...' or from "@/..." (with or without trailing slash)
      // Escape special regex chars in the path
      const escaped = oldImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match exactly this path (end of string must be quote or slash for sub-paths)
      const re = new RegExp(`(['"])${escaped}(['"])`, 'g');
      updated = updated.replace(re, `$1${newImport}$2`);
    }

    if (updated !== content) {
      fs.writeFileSync(filePath, updated, 'utf8');
      filesUpdated++;
      console.log(`UPDATED: ${path.relative(ROOT, filePath)}`);
    }
  }

  console.log(`\nUpdated imports in ${filesUpdated} files\n`);
  console.log('=== MIGRATION COMPLETE ===');
  console.log('Next steps:');
  console.log('  1. Run: npx tsc --noEmit  (check for broken imports)');
  console.log('  2. Run: npm run dev       (verify the app starts)');
  console.log('  3. Delete now-empty legacy folders: src/pages/, src/context/, src/repositories/, src/services/');
}

main();
