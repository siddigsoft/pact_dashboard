import { supabase } from '@/integrations/supabase/client';

export interface AppVersionInfo {
  current: string;
  minimum_supported: string;
  latest: string;
  update_required: boolean;
  update_available: boolean;
  changelog?: string;
  download_url?: string;
}

export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

export async function checkAppVersion(
  currentVersion: string,
  platform: 'web' | 'mobile' = 'mobile'
): Promise<AppVersionInfo> {
  try {
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('platform', platform)
      .single();

    if (error || !data) {
      console.warn('Could not fetch version info:', error);
      return {
        current: currentVersion,
        minimum_supported: currentVersion,
        latest: currentVersion,
        update_required: false,
        update_available: false,
      };
    }

    const isBelowMinimum = 
      compareVersions(currentVersion, data.minimum_supported) < 0;
    
    const isUpdateAvailable = 
      compareVersions(currentVersion, data.latest_version) < 0;
    
    const forceUpdate = data.force_update === true;
    const updateRequired = isBelowMinimum || forceUpdate;

    return {
      current: currentVersion,
      minimum_supported: data.minimum_supported,
      latest: data.latest_version,
      update_required: updateRequired,
      update_available: isUpdateAvailable && !updateRequired,
      changelog: data.changelog,
      download_url: data.download_url,
    };
  } catch (error) {
    console.error('Error checking app version:', error);
    return {
      current: currentVersion,
      minimum_supported: currentVersion,
      latest: currentVersion,
      update_required: false,
      update_available: false,
    };
  }
}

export function getAppVersion(): string {
  return '1.0.0';
}
