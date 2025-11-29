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
      const { data, error } = await supabase
        .from('coordinator_locality_permits')
        .select('*')
        .eq('coordinator_id', currentUser.id)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;

      console.log('Fetched permits:', data);
      setPermits(data || []);
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
    return permits.find(permit =>
      permit.stateId === stateId && permit.localityId === localityId
    );
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

      // Save permit record
      const { data, error: insertError } = await supabase
        .from('coordinator_locality_permits')
        .insert({
          coordinator_id: currentUser.id,
          state_id: stateId,
          locality_id: localityId,
          permit_file_name: file.name,
          permit_file_url: publicUrl,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Update local state
      setPermits(prev => [data, ...prev]);

      return data;
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

      // Delete from storage - extract path from URL
      // URL format: https://xxx.supabase.co/storage/v1/object/public/mmp-files/coordinator-permits/userId/stateId/localityId/fileName
      const urlParts = permit.permitFileUrl.split('/');
      const filePath = urlParts.slice(-5).join('/'); // Get the last 5 parts: coordinator-permits/userId/stateId/localityId/fileName

      await supabase.storage
        .from('mmp-files')
        .remove([filePath]);

      // Delete from database
      const { error } = await supabase
        .from('coordinator_locality_permits')
        .delete()
        .eq('id', permitId);

      if (error) throw error;

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
        const stateId = site.stateId || site.state; // Use stateId if available, fallback to state
        const localityId = site.localityId || site.locality; // Use localityId if available, fallback to locality

        console.log('Processing site:', {
          siteId: site.id,
          key,
          stateId,
          localityId,
          assignedTo: site.assignedTo,
          currentUserId: currentUser.id
        });

        if (!localityMap.has(key)) {
          localityMap.set(key, {
            state: site.state,
            locality: site.locality,
            stateId,
            localityId,
            hasPermit: hasPermitForLocality(stateId, localityId),
            permit: getPermitForLocality(stateId, localityId),
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
  }, [siteVisits, currentUser?.id, permits]);

  return {
    localitiesWithPermitStatus,
    totalLocalities: localitiesWithPermitStatus.length,
    localitiesWithPermits: localitiesWithPermitStatus.filter(l => l.hasPermit),
    localitiesWithoutPermits: localitiesWithPermitStatus.filter(l => !l.hasPermit),
  };
};