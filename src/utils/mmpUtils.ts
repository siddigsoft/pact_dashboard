
import { MMPFile } from '@/types/mmp';

/**
 * Check if an MMP file is properly approved and valid for site visits
 */
export const isValidForSiteVisits = (mmp: MMPFile): boolean => {
  // Check if MMP has the required properties
  const siteEntriesCount = mmp.siteEntries?.length || 0;
  const declaredEntriesCount = mmp.entries || 0;
  
  const hasRequiredFields = 
    mmp.id && 
    mmp.status === 'approved' &&
    (siteEntriesCount > 0 || declaredEntriesCount > 0);

  console.log(`MMP ${mmp.id} validity check:`, {
    hasId: Boolean(mmp.id),
    isApproved: mmp.status === 'approved',
    hasSiteEntries: siteEntriesCount > 0,
    hasEntries: declaredEntriesCount > 0,
    siteEntriesCount,
    declaredEntriesCount,
    isValid: hasRequiredFields
  });

  return hasRequiredFields;
};

/**
 * Log MMP files to the console for debugging
 */
export const debugMMPFiles = (mmps: MMPFile[], context: string = 'General'): void => {
  console.log(`=== MMP Files Debug [${context}] ===`);
  console.log(`Total MMPs: ${mmps.length}`);
  
  const approved = mmps.filter(m => m.status === 'approved').length;
  const pending = mmps.filter(m => m.status === 'pending').length;
  const rejected = mmps.filter(m => m.status === 'rejected').length;
  const other = mmps.length - approved - pending - rejected;
  
  console.log(`Status breakdown: Approved: ${approved}, Pending: ${pending}, Rejected: ${rejected}, Other: ${other}`);
  
  if (mmps.length > 0) {
    const firstMmp = mmps[0];
    console.log('Sample MMP:', firstMmp.id, firstMmp.mmpId);
    console.log('Sample MMP Entries:', firstMmp.entries);
    console.log('Sample MMP Site Entries:', firstMmp.siteEntries?.length || 0);
    
    if (firstMmp.siteEntries && firstMmp.siteEntries.length > 0) {
      console.log('First site entry sample:', firstMmp.siteEntries[0]);
    }
  }
  
  console.log('=== End MMP Debug ===');
};

/**
 * Get the effective site count from an MMP file
 * This function handles cases where the declared entries count might differ from the actual site entries array length
 * @deprecated Use getActualSiteCount and getTotalSiteCount instead for clearer semantics
 */
export const getEffectiveSiteCount = (mmp: MMPFile): number => {
  const siteEntriesCount = mmp.siteEntries?.length || 0;
  const declaredEntriesCount = mmp.entries || 0;
  
  // Prefer the actual array length if available, otherwise fallback to declared count
  const result = siteEntriesCount > 0 ? siteEntriesCount : declaredEntriesCount;
  
  console.log(`getEffectiveSiteCount for MMP ${mmp.id}:`, {
    siteEntriesCount,
    declaredEntriesCount,
    result
  });
  
  return result;
};

/**
 * Get the actual site entries count from the siteEntries array
 * Returns the actual site entries array length
 */
export const getActualSiteCount = (mmp: MMPFile): number => {
  if (!mmp) return 0;
  const siteEntriesCount = mmp.siteEntries?.length || 0;
  
  console.log(`getActualSiteCount for MMP ${mmp?.id}:`, {
    siteEntriesCount,
    hasSiteEntries: Boolean(mmp.siteEntries)
  });
  
  return siteEntriesCount;
};

/**
 * Get the total entries count to display
 * Returns the actual site entries array length if available,
 * otherwise returns the declared entries count
 */
export const getTotalSiteCount = (mmp: MMPFile): number => {
  if (!mmp) return 0;
  
  const siteEntriesCount = mmp.siteEntries?.length || 0;
  const declaredEntriesCount = mmp.entries || 0;
  
  // If we have actual site entries, use that count, otherwise use declared count
  const result = siteEntriesCount > 0 ? siteEntriesCount : declaredEntriesCount;
  
  console.log(`getTotalSiteCount for MMP ${mmp?.id}:`, {
    siteEntriesCount,
    declaredEntriesCount,
    result
  });
  
  return result;
};

/**
 * Calculate the processing progress percentage
 */
export const calculateProcessingPercentage = (mmp: MMPFile): number => {
  const totalSiteCount = getTotalSiteCount(mmp);
  const processedEntries = mmp.processedEntries || 0;
  
  const percentage = totalSiteCount > 0 
    ? Math.round((processedEntries / totalSiteCount) * 100)
    : 0;
    
  console.log(`calculateProcessingPercentage for MMP ${mmp.id}:`, {
    totalSiteCount,
    processedEntries,
    percentage
  });
  
  return percentage;
};
