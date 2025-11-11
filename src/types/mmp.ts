import { MMPBase, MMPLocation, MMPStatus } from './mmp/base';
import { MMPApprovalWorkflow, MMPWorkflow } from './mmp/workflow';
import { MMPTeam } from './mmp/team';
import { MMPSiteEntry, MMPSiteVisit } from './mmp/site';
import { MMPPermitsData } from './mmp/permits';
import { MMPFinancial } from './mmp/financial';
import { MMPPerformance } from './mmp/performance';
import { MMPCPVerification, MMPComprehensiveVerification } from './mmp/verification';

export * from './mmp/base';
export * from './mmp/workflow';
export * from './mmp/team';
export * from './mmp/site';
export * from './mmp/permits';
export * from './mmp/financial';
export * from './mmp/performance';
export * from './mmp/verification';

export interface MMPFile extends MMPBase {
  approvalWorkflow?: MMPApprovalWorkflow;
  workflow?: MMPWorkflow;
  location?: MMPLocation;
  siteEntries?: MMPSiteEntry[];
  team?: MMPTeam;
  permits?: MMPPermitsData;
  siteVisit?: MMPSiteVisit;
  financial?: MMPFinancial;
  performance?: MMPPerformance;
  cpVerification?: MMPCPVerification;
  comprehensiveVerification?: MMPComprehensiveVerification;
  activities?: any[];
  status: MMPStatus;
  logs?: { action: string; by: string; date: string }[];
}
