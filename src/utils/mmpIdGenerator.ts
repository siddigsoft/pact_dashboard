
/**
 * Parses an MMP ID string into its components
 * Format: M-MMYYYY-VX.Y-REG
 * @param mmpId The MMP ID to parse
 * @returns Parsed MMP ID object or null if invalid format
 */
export const parseMMPId = (mmpId: string) => {
  try {
    // Example MMP ID: M-052023-V1.0-KRT
    const parts = mmpId.split('-');
    if (parts.length !== 4) return null;
    
    // Extract month and year from second part (MMYYYY)
    const dateMatch = parts[1].match(/^(\d{2})(\d{4})$/);
    if (!dateMatch) return null;
    
    const month = parseInt(dateMatch[1], 10);
    const year = parseInt(dateMatch[2], 10);
    
    // Extract version from third part (VX.Y)
    const versionMatch = parts[2].match(/^V(\d+)\.(\d+)$/);
    if (!versionMatch) return null;
    
    const versionMajor = parseInt(versionMatch[1], 10);
    const versionMinor = parseInt(versionMatch[2], 10);
    
    // Region is the fourth part
    const region = parts[3];
    
    return {
      prefix: parts[0],
      month,
      year,
      version: {
        major: versionMajor,
        minor: versionMinor,
      },
      region,
    };
  } catch (error) {
    console.error("Failed to parse MMP ID:", error);
    return null;
  }
};

/**
 * Generates an MMP ID based on the provided parameters
 * @param month Month number
 * @param year Year number
 * @param versionMajor Major version number
 * @param versionMinor Minor version number
 * @param regionCode Region code string
 * @returns The generated MMP ID
 */
export const generateMmpId = (month: number, year: number, versionMajor: number, versionMinor: number, regionCode: string) => {
  // Format: M-MMYYYY-VX.Y-REG
  const monthStr = month.toString().padStart(2, '0');
  const yearStr = year.toString();
  return `M-${monthStr}${yearStr}-V${versionMajor}.${versionMinor}-${regionCode}`;
};

// Add an alias for backward compatibility 
export const generateMMPId = generateMmpId;

/**
 * Generates a site code with the given prefix and sequence number
 * @param prefix Site code prefix
 * @param sequenceNumber Sequence number
 * @returns The generated site code
 */
export const generateSiteCode = (prefix: string, sequenceNumber: number) => {
  return `${prefix}${sequenceNumber.toString().padStart(5, '0')}`;
};

/**
 * Validates a site code format
 * Format: [Hub 2 chars][State 2 chars][Date 6 chars]-[4 digits]
 * Example: KOKH230524-0001 for Khartoum Hub, Khartoum State, May 24, 2023
 * @param code Site code to validate
 * @returns Boolean indicating if the site code is valid
 */
export const validateSiteCode = (code: string): boolean => {
  if (!code || typeof code !== 'string') return false;
  // Format: [Hub 2 chars][State 2 chars][Date 6 chars]-[4 digits]
  // Example: KOKH230524-0001
  const regex = /^[A-Z]{2}[A-Z]{2}\d{6}-\d{4}$/;
  return regex.test(code.trim());
};

/**
 * Increments MMP version number
 * @param currentVersion Current version object
 * @param isMajor Whether to increment major version
 * @returns New version object
 */
export const incrementVersion = (currentVersion: { major: number; minor: number }, isMajor: boolean = false) => {
  if (isMajor) {
    return { major: currentVersion.major + 1, minor: 0 };
  } else {
    return { major: currentVersion.major, minor: currentVersion.minor + 1 };
  }
};
