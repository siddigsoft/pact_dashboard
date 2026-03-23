import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeUploadFile } from '@/lib/safeUpload';
import { CoordinatorLocalityPermit, LocalityPermitStatus } from '@/types/coordinator-permits';
import { useAppContext } from '@/context/AppContext';

export const useCoordinatorLocalityPermits = () => {
  const { currentUser } = useAppContext();
  const [permits, setPermits] = useState<CoordinatorLocalityPermit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all permits for current coordinator
  const fetchPermits = async () => {
    if (!currentUser?.id) return;

    setLoading(true);
    setError(null);

    try {
      const bucket = 'coordinator-permits';
      const base = `coordinator-permits/${currentUser.id}`;

      const list = async (path: string) => {
        const { data, error } = await supabase.storage
          .from(bucket)
          .list(path, { limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } });
        if (error) {
          return [] as any[];
        }
        return (data || []) as any[];
      };

      const top = await list(base);
      const stateDirs = (top || []).filter((e: any) => !e.metadata);

      // Best-effort: load verified flags from coordinator_locality_permits (if present).
      // This table is used for dashboard indexing and verification status.
      let dbPermits: Array<{
        state_id: string;
        locality_id: string;
        verified: boolean | null;
        verified_by: string | null;
        verified_at: string | null;
      }> = [];
      try {
        const { data: permitRows } = await supabase
          .from('coordinator_locality_permits')
          .select('state_id, locality_id, verified, verified_by, verified_at')
          .eq('coordinator_id', currentUser.id);
        dbPermits = (permitRows || []) as any[];
      } catch (e) {
        // Table may not exist in all environments; storage is still the source of truth for upload.
        dbPermits = [];
      }

      const permitByKey = new Map<string, (typeof dbPermits)[number]>();
      dbPermits.forEach((p) => {
        permitByKey.set(`${p.state_id}|${p.locality_id}`, p);
      });

      const collected: CoordinatorLocalityPermit[] = [];
      for (const s of stateDirs) {
        const stateId = s.name;
        const locEntries = await list(`${base}/${stateId}`);
        const localityDirs = (locEntries || []).filter((e: any) => !e.metadata);
        for (const l of localityDirs) {
          const localityId = l.name;
          const fileEntries = await list(`${base}/${stateId}/${localityId}`);
          const files = (fileEntries || []).filter((e: any) => !!e.metadata);
          for (const f of files) {
            const fullPath = `${base}/${stateId}/${localityId}/${f.name}`.replace(/\/+/, '/');
            const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fullPath);
            const uploadedAt = (f as any).created_at || new Date().toISOString();
            const ts = uploadedAt;
            const dbKey = `${stateId}|${localityId}`;
            const dbPermit = permitByKey.get(dbKey);
            collected.push({
              id: fullPath,
              coordinatorId: currentUser.id,
              stateId,
              localityId,
              permitFileName: f.name,
              permitFileUrl: urlData.publicUrl,
              uploadedAt: ts,
              verified: !!dbPermit?.verified,
              verifiedBy: dbPermit?.verified_by ?? undefined,
              verifiedAt: dbPermit?.verified_at ?? undefined,
              createdAt: ts,
              updatedAt: ts,
            } as CoordinatorLocalityPermit);
          }
        }
      }

      setPermits(collected);
    } catch (err) {
      console.error('Error fetching coordinator permits:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch permits');
    } finally {
      setLoading(false);
    }
  };

  // Check if coordinator has permit for specific locality
  const hasPermitForLocality = (stateId: string, localityId: string): boolean => {
    return permits.some(permit =>
      permit.stateId === stateId && permit.localityId === localityId
    );
  };

  // Get permit for specific locality
  const getPermitForLocality = (stateId: string, localityId: string): CoordinatorLocalityPermit | undefined => {
    const matches = permits.filter(p => p.stateId === stateId && p.localityId === localityId);
    if (matches.length === 0) return undefined;
    return matches.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];
  };

  // Upload permit for locality
  const uploadPermit = async (
    stateId: string,
    localityId: string,
    file: File
  ): Promise<CoordinatorLocalityPermit | null> => {
    if (!currentUser?.id) return null;

    setLoading(true);
    setError(null);

    try {

      // Upload file using safeUploadFile
      const filePath = `coordinator-permits/${currentUser.id}/${stateId}/${localityId}`;
      const uploadResult = await safeUploadFile(file, {
        bucket: 'coordinator-permits',
        path: filePath,
        allowedTypes: undefined, // allow all types
        maxSizeBytes: 10 * 1024 * 1024
      });
      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || 'Failed to upload file');
      }
      const publicUrl = uploadResult.url;

      const uploadedAt = new Date().toISOString();
      const inserted: CoordinatorLocalityPermit = {
        id: filePath,
        coordinatorId: currentUser.id,
        stateId,
        localityId,
        permitFileName: file.name,
        permitFileUrl: publicUrl,
        uploadedAt,
        verified: false,
        createdAt: uploadedAt,
        updatedAt: uploadedAt,
      } as CoordinatorLocalityPermit;

      // Best-effort: also persist to coordinator_locality_permits table for dashboard indexing.
      // RLS policies should allow owner inserts (auth.uid() = coordinator_id).
      try {
        await supabase
          .from('coordinator_locality_permits')
          .upsert(
            {
              coordinator_id: currentUser.id,
              state_id: stateId,
              locality_id: localityId,
              permit_file_name: file.name,
              permit_file_url: publicUrl,
              verified: false,
              verified_by: null,
              verified_at: null,
            } as any,
            { onConflict: 'coordinator_id,state_id,locality_id' }
          );
      } catch (e) {
        console.warn('[useCoordinatorLocalityPermits] Failed to upsert coordinator_locality_permits (best-effort):', e);
      }

      setPermits(prev => [inserted, ...prev]);
      return inserted;
    } catch (err) {
      console.error('Error uploading permit:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload permit');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Delete permit
  const deletePermit = async (permitId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      // Get permit details for file deletion
      const permit = permits.find(p => p.id === permitId);
      if (!permit) throw new Error('Permit not found');

      let filePath = '';
      if (typeof permit.id === 'string' && permit.id.includes('/')) {
        filePath = permit.id;
      } else if (permit.permitFileUrl) {
        const marker = '/object/public/mmp-files/';
        const idx = permit.permitFileUrl.indexOf(marker);
        if (idx !== -1) {
          filePath = permit.permitFileUrl.substring(idx + marker.length);
        }
      }
      if (!filePath) throw new Error('Invalid storage path');

      await supabase.storage
        .from('coordinator-permits')
        .remove([filePath]);

      // Update local state
      setPermits(prev => prev.filter(p => p.id !== permitId));

      // Best-effort: remove the indexed DB row for this permit as well.
      try {
        await supabase
          .from('coordinator_locality_permits')
          .delete()
          .eq('coordinator_id', currentUser.id)
          .eq('state_id', permit.stateId)
          .eq('locality_id', permit.localityId);
      } catch (e) {
        console.warn('[useCoordinatorLocalityPermits] Failed to delete coordinator_locality_permits row (best-effort):', e);
      }

      return true;
    } catch (err) {
      console.error('Error deleting permit:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete permit');
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermits();
  }, [currentUser?.id]);

  return {
    permits,
    loading,
    error,
    fetchPermits,
    hasPermitForLocality,
    getPermitForLocality,
    uploadPermit,
    deletePermit,
  };
};

// Helper function to group sites by locality and check permit status
export const useLocalityPermitStatus = (siteVisits: any[]) => {
  const { currentUser } = useAppContext();
  const { permits, hasPermitForLocality, getPermitForLocality } = useCoordinatorLocalityPermits();
  const [hubStates, setHubStates] = React.useState<Array<{ state_id: string; state_name: string }>>([]);
  const [registryLocalities, setRegistryLocalities] = React.useState<Array<{ locality_id: string; locality_name: string; state_id: string }>>([]);

  React.useEffect(() => {
    const fetchLocationMappings = async () => {
      try {
        const [{ data: hs }, { data: locs }] = await Promise.all([
          supabase.from('hub_states').select('state_id, state_name'),
          supabase.from('sites_registry').select('locality_id, locality_name, state_id')
        ]);
        setHubStates(hs || []);
        setRegistryLocalities(locs || []);
      } catch (e) {
      }
    };
    fetchLocationMappings();
  }, []);

  const localitiesWithPermitStatus: LocalityPermitStatus[] = React.useMemo(() => {
    console.log('useLocalityPermitStatus Debug:', {
      currentUserId: currentUser?.id,
      siteVisitsCount: siteVisits?.length || 0,
      permitsCount: permits.length,
      siteVisits: siteVisits?.slice(0, 3).map(s => ({
        id: s.id,
        assignedTo: s.assignedTo,
        state: s.state,
        locality: s.locality,
        stateId: s.stateId,
        localityId: s.localityId
      }))
    });

    if (!currentUser?.id || !siteVisits) return [];

    const localityMap = new Map<string, LocalityPermitStatus>();

    // Group sites by locality
    siteVisits
      .filter(site => site.assignedTo === currentUser.id)
      .forEach(site => {
        const key = `${site.state}-${site.locality}`;
        const resolvedStateId = site.stateId || hubStates.find(hs => hs.state_name === site.state)?.state_id || '';
        const resolvedLocalityId = site.localityId || (
          resolvedStateId ? (registryLocalities.find(l => l.locality_name === site.locality && l.state_id === resolvedStateId)?.locality_id || '') : ''
        );

        console.log('Processing site:', {
          siteId: site.id,
          key,
          stateId: resolvedStateId,
          localityId: resolvedLocalityId,
          assignedTo: site.assignedTo,
          currentUserId: currentUser.id
        });

        if (!localityMap.has(key)) {
          localityMap.set(key, {
            state: site.state,
            locality: site.locality,
            stateId: resolvedStateId,
            localityId: resolvedLocalityId,
            hasPermit: !!(resolvedStateId && resolvedLocalityId && hasPermitForLocality(resolvedStateId, resolvedLocalityId)),
            permit: resolvedStateId && resolvedLocalityId ? getPermitForLocality(resolvedStateId, resolvedLocalityId) : undefined,
            siteCount: 0,
            sites: [],
          });
        }

        const locality = localityMap.get(key)!;
        locality.sites.push(site);
        locality.siteCount++;
      });

    const result = Array.from(localityMap.values());
    console.log('Final localities:', result.map(l => ({
      state: l.state,
      locality: l.locality,
      hasPermit: l.hasPermit,
      siteCount: l.siteCount
    })));

    return result;
  }, [siteVisits, currentUser?.id, permits, hubStates, registryLocalities]);

  return {
    localitiesWithPermitStatus,
    totalLocalities: localitiesWithPermitStatus.length,
    localitiesWithPermits: localitiesWithPermitStatus.filter(l => l.hasPermit),
    localitiesWithoutPermits: localitiesWithPermitStatus.filter(l => !l.hasPermit),
  };
};