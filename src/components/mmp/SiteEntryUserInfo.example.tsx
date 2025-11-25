/**
 * Example usage of SiteEntryUserInfo component
 * 
 * This file demonstrates how to:
 * 1. Query site entries with user relationships
 * 2. Use the SiteEntryUserInfo component to display the information
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import SiteEntryUserInfo from './SiteEntryUserInfo';

interface SiteEntryWithUsers {
  id: string;
  site_name: string;
  status: string;
  verified_by_user_id: string | null;
  verified_by: string | null;
  verified_at: string | null;
  completed_by_user_id: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  verifier?: {
    id: string;
    full_name: string | null;
    email: string | null;
    username: string | null;
  } | null;
  completer?: {
    id: string;
    full_name: string | null;
    email: string | null;
    username: string | null;
  } | null;
}

/**
 * Example: Fetch a single site entry with user relationships
 */
export const ExampleSingleSiteEntry: React.FC<{ siteEntryId: string }> = ({ siteEntryId }) => {
  const [siteEntry, setSiteEntry] = useState<SiteEntryWithUsers | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSiteEntry = async () => {
      try {
        const { data, error } = await supabase
          .from('mmp_site_entries')
          .select(`
            *,
            verifier:profiles!mmp_site_entries_verified_by_user_id_fkey (
              id,
              full_name,
              email,
              username
            ),
            completer:profiles!mmp_site_entries_completed_by_user_id_fkey (
              id,
              full_name,
              email,
              username
            )
          `)
          .eq('id', siteEntryId)
          .single();

        if (error) throw error;
        setSiteEntry(data as SiteEntryWithUsers);
      } catch (error) {
        console.error('Error fetching site entry:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSiteEntry();
  }, [siteEntryId]);

  if (loading) return <div>Loading...</div>;
  if (!siteEntry) return <div>Site entry not found</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{siteEntry.site_name}</h2>
      <p>Status: {siteEntry.status}</p>
      
      <SiteEntryUserInfo
        siteEntry={siteEntry}
        verifier={siteEntry.verifier || null}
        completer={siteEntry.completer || null}
        showTimestamps={true}
      />
    </div>
  );
};

/**
 * Example: Fetch multiple site entries with user relationships
 */
export const ExampleMultipleSiteEntries: React.FC = () => {
  const [siteEntries, setSiteEntries] = useState<SiteEntryWithUsers[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSiteEntries = async () => {
      try {
        const { data, error } = await supabase
          .from('mmp_site_entries')
          .select(`
            *,
            verifier:profiles!mmp_site_entries_verified_by_user_id_fkey (
              id,
              full_name,
              email,
              username
            ),
            completer:profiles!mmp_site_entries_completed_by_user_id_fkey (
              id,
              full_name,
              email,
              username
            )
          `)
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) throw error;
        setSiteEntries(data as SiteEntryWithUsers[]);
      } catch (error) {
        console.error('Error fetching site entries:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSiteEntries();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Recent Site Entries</h2>
      {siteEntries.map((entry) => (
        <div key={entry.id} className="border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold">{entry.site_name}</h3>
          <SiteEntryUserInfo
            siteEntry={entry}
            verifier={entry.verifier || null}
            completer={entry.completer || null}
            compact={true}
          />
        </div>
      ))}
    </div>
  );
};

/**
 * Example: Update site entry with verification
 */
export const ExampleVerifySiteEntry: React.FC<{ 
  siteEntryId: string; 
  currentUserId: string;
  currentUserUsername: string;
}> = ({ siteEntryId, currentUserId, currentUserUsername }) => {
  const handleVerify = async () => {
    try {
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({
          verified_by_user_id: currentUserId, // New UUID field
          verified_by: currentUserUsername, // Keep text field for backward compatibility
          verified_at: new Date().toISOString(),
          status: 'verified'
        })
        .eq('id', siteEntryId);

      if (error) throw error;
      alert('Site entry verified successfully!');
    } catch (error) {
      console.error('Error verifying site entry:', error);
      alert('Failed to verify site entry');
    }
  };

  return (
    <button 
      onClick={handleVerify}
      className="px-4 py-2 bg-green-600 text-white rounded"
    >
      Verify Site Entry
    </button>
  );
};

/**
 * Example: Update site entry with completion
 */
export const ExampleCompleteSiteEntry: React.FC<{ 
  siteEntryId: string; 
  currentUserId: string;
  currentUserUsername: string;
}> = ({ siteEntryId, currentUserId, currentUserUsername }) => {
  const handleComplete = async () => {
    try {
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({
          completed_by_user_id: currentUserId, // New UUID field
          accepted_by: currentUserUsername, // Keep text field for backward compatibility
          accepted_at: new Date().toISOString(),
          status: 'completed'
        })
        .eq('id', siteEntryId);

      if (error) throw error;
      alert('Site entry completed successfully!');
    } catch (error) {
      console.error('Error completing site entry:', error);
      alert('Failed to complete site entry');
    }
  };

  return (
    <button 
      onClick={handleComplete}
      className="px-4 py-2 bg-blue-600 text-white rounded"
    >
      Complete Site Entry
    </button>
  );
};

