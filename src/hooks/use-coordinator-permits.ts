import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
      const bucket = 'mmp-files';
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
            collected.push({
              id: fullPath,
              coordinatorId: currentUser.id,
              stateId,
              localityId,
              permitFileName: f.name,
              permitFileUrl: urlData.publicUrl,
              uploadedAt: ts,
              verified: false,
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
      // Upload file to storage
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `coordinator-permits/${currentUser.id}/${stateId}/${localityId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('mmp-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('mmp-files')
        .getPublicUrl(filePath);

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
        .from('mmp-files')
        .remove([filePath]);

      // Update local state
      setPermits(prev => prev.filter(p => p.id !== permitId));

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