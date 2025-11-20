export interface MMPSiteEntry {
  id: string;
  status: string;
  siteCode?: string;
  inMoDa?: boolean;
  visitedBy?: string;
  mainActivity?: string;
  visitDate?: string;
  isFlagged?: boolean;
  flagReason?: string;
  flaggedBy?: string;
  flaggedAt?: string;
  // Monitoring Plan Structure Fields
  hubOffice?: string; // e.g., "Farchana Hub"
  state?: string; // e.g., "West Darfur"
  locality?: string; // e.g., "Kulbus", "Geneina"
  siteName?: string; // e.g., "ADAREEB", "AL-FAROUQ", "AL-QADISIYA", etc.
  cpName?: string; // e.g., "World Relief (WR)"
  siteActivity?: string; // e.g., "GFA"
  monitoringBy?: string; // e.g., "PACT"
  surveyTool?: string; // e.g., "PDM"
  useMarketDiversion?: boolean;
  useWarehouseMonitoring?: boolean;
  // Additional fields
  visitType?: string;
  comments?: string;
  additionalData?: Record<string, string>;
}

export interface MMPSiteVisit {
  complexity?: string;
  estimatedDuration?: string;
  resources?: string[];
  risks?: string;
  escalation?: string;
}
