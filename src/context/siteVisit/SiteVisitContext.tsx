import React, { createContext, useContext, useState, useEffect } from 'react';
import { SiteVisit, User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '../user/UserContext';
import { SiteVisitContextType } from './types';
import { calculateOnTimeRate, calculateUserRating } from './utils';
import { isUserNearSite, calculateUserWorkload, calculateDistance } from '@/utils/collectorUtils';
import { fetchSiteVisits, createSiteVisitInDb, updateSiteVisitInDb, deleteSiteVisitInDb } from './supabase';
import { useNotifications } from '../notifications/NotificationContext';
import { supabase } from '@/integrations/supabase/client';

const SiteVisitContext = createContext<SiteVisitContextType | undefined>(undefined);

export const SiteVisitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appSiteVisits, setAppSiteVisits] = useState<SiteVisit[]>([]);
  const { toast } = useToast();
  const { currentUser, users, updateUser } = useUser();
  
  useEffect(() => {
    const loadSiteVisits = async () => {
      try {
        const visits = await fetchSiteVisits();
        setAppSiteVisits(visits);
      } catch (error) {
        console.error('Failed to load site visits:', error);
        toast({
          title: "Error loading site visits",
          description: "Please try refreshing the page.",
          variant: "destructive",
        });
      }
    };
    
    loadSiteVisits();
  }, [toast]);

  const createSiteVisit = async (siteVisitData: Partial<SiteVisit>): Promise<string | undefined> => {
    try {
      if (!currentUser) {
        toast({
          title: "Authentication required",
          description: "You must be logged in to create a site visit.",
          variant: "destructive",
        });
        return undefined;
      }

      const now = new Date().toISOString();
      const newVisit = await createSiteVisitInDb({
        ...siteVisitData,
        createdAt: now,
      });

      setAppSiteVisits(prev => [...prev, newVisit]);
      
      try {
        const normalize = (v?: string) => (v ?? '').toString().trim().toLowerCase();
        let consideredUsers = users.filter(user => {
          const roleVal = (user.role || '').toString();
          const direct = roleVal === 'dataCollector' || roleVal.toLowerCase() === 'datacollector';
          const inArray = Array.isArray(user.roles) && user.roles.some((r: any) => r === 'dataCollector' || (typeof r === 'string' && r.toLowerCase() === 'datacollector'));
          return direct || inArray;
        });

        if (consideredUsers.length === 0) {
          try {
            const { data: profilesData } = await supabase
              .from('profiles')
              .select('id, full_name, role, state_id, locality_id, hub_id, location, availability');
            const { data: rolesData } = await supabase
              .from('user_roles')
              .select('*');

            const rolesMap: Record<string, any[]> = {};
            (rolesData || []).forEach((r: any) => {
              if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
              if (r.role) rolesMap[r.user_id].push(r.role);
            });

            const remoteUsers = (profilesData || []).map((p: any) => {
              let locationData = p.location;
              try {
                if (typeof locationData === 'string') locationData = JSON.parse(locationData);
              } catch {}
              return {
                id: p.id,
                name: p.full_name || 'Unknown',
                role: p.role || 'dataCollector',
                roles: rolesMap[p.id] || [],
                stateId: p.state_id,
                localityId: p.locality_id,
                hubId: p.hub_id,
                availability: p.availability || 'offline',
                location: locationData,
              } as any;
            });

            consideredUsers = remoteUsers.filter((user: any) => {
              const roleVal = (user.role || '').toString();
              const direct = roleVal === 'dataCollector' || roleVal.toLowerCase() === 'datacollector';
              const inArray = Array.isArray(user.roles) && user.roles.some((r: any) => r === 'dataCollector' || (typeof r === 'string' && r.toLowerCase() === 'datacollector'));
              return direct || inArray;
            });
          } catch (e) {
            console.warn('Failed to fetch collectors for auto-assignment:', e);
          }
        }

        const hasValidCoords = (coords?: { latitude?: number; longitude?: number }) => {
          if (!coords) return false;
          const { latitude, longitude } = coords as any;
          return (
            typeof latitude === 'number' && typeof longitude === 'number' &&
            Number.isFinite(latitude) && Number.isFinite(longitude) &&
            !(latitude === 0 && longitude === 0)
          );
        };

        const siteCoords = hasValidCoords(newVisit.coordinates)
          ? (newVisit.coordinates as any)
          : hasValidCoords(newVisit.location)
            ? (newVisit.location as any)
            : null;

        let workloadCounts: Record<string, number> = {};
        try {
          const { data: activeEntries } = await supabase
            .from('mmp_site_entries')
            .select('additional_data, status');
          const counts: Record<string, number> = {};
          (activeEntries || []).forEach((r: any) => {
            const ad = r.additional_data || {};
            const assignedTo = ad.assigned_to;
            if (assignedTo && (r.status === 'assigned' || r.status === 'inProgress' || r.status === 'in_progress')) {
              counts[assignedTo] = (counts[assignedTo] || 0) + 1;
            }
          });
          workloadCounts = counts;
        } catch {}

        const enhanced = consideredUsers.map(user => {
          const hasUserCoords = typeof user.location?.latitude === 'number' && typeof user.location?.longitude === 'number';
          const distance = siteCoords && hasUserCoords
            ? calculateDistance(
                user.location!.latitude!,
                user.location!.longitude!,
                (siteCoords as any).latitude,
                (siteCoords as any).longitude
              )
            : 999999;
          const isStateMatch = !!(user.stateId && newVisit.state && normalize(user.stateId) === normalize(newVisit.state));
          const isLocalityMatch = !!(user.localityId && newVisit.locality && normalize(user.localityId) === normalize(newVisit.locality));
          const isHubMatch = !!(user.hubId && newVisit.hub && normalize(user.hubId) === normalize(newVisit.hub));
          const workload = typeof workloadCounts[user.id] === 'number'
            ? workloadCounts[user.id]
            : calculateUserWorkload(user.id, appSiteVisits);
          return { user, distance, isStateMatch, isLocalityMatch, isHubMatch, workload };
        });

        const perfectMatches = enhanced.filter(e => e.isStateMatch && e.isLocalityMatch);

        if (perfectMatches.length > 0) {
          perfectMatches.sort((a, b) => {
            if (a.workload !== b.workload) return a.workload - b.workload;
            if (a.distance !== b.distance) return a.distance - b.distance;
            return 0;
          });

          const best = perfectMatches[0];
          const updatedVisit = await updateSiteVisitInDb(newVisit.id, {
            status: 'assigned',
            assignedTo: best.user.id,
            assignedBy: currentUser.id,
            assignedAt: new Date().toISOString(),
          });

          setAppSiteVisits(prev => prev.map(v => v.id === newVisit.id ? updatedVisit : v));

          addNotification({
            userId: best.user.id,
            title: "Assigned to Site Visit",
            message: `You have been assigned to the site visit at ${newVisit.siteName}. Total fee: ${Number(newVisit.fees?.total || 0)} ${newVisit.fees?.currency || 'SDG'}. Payment schedule: 20% (${(Number(newVisit.fees?.total || 0) * 0.2).toFixed(2)}) upfront cleared before start, 80% (${(Number(newVisit.fees?.total || 0) * 0.8).toFixed(2)}) after completion.`,
            type: "info",
            link: `/site-visits/${newVisit.id}`,
            relatedEntityId: newVisit.id,
            relatedEntityType: "siteVisit",
          });
        } else {
          const stateMatches = enhanced.filter(e => e.isStateMatch);
          if (stateMatches.length > 0) {
            stateMatches.sort((a, b) => {
              if (a.workload !== b.workload) return a.workload - b.workload;
              if (a.distance !== b.distance) return a.distance - b.distance;
              return 0;
            });

            const bestState = stateMatches[0];
            const updatedVisit = await updateSiteVisitInDb(newVisit.id, {
              status: 'assigned',
              assignedTo: bestState.user.id,
              assignedBy: currentUser.id,
              assignedAt: new Date().toISOString(),
            });

            setAppSiteVisits(prev => prev.map(v => v.id === newVisit.id ? updatedVisit : v));

            addNotification({
              userId: bestState.user.id,
              title: "Assigned to Site Visit",
              message: `You have been assigned to the site visit at ${newVisit.siteName}. Total fee: ${Number(newVisit.fees?.total || 0)} ${newVisit.fees?.currency || 'SDG'}. Payment schedule: 20% (${(Number(newVisit.fees?.total || 0) * 0.2).toFixed(2)}) upfront cleared before start, 80% (${(Number(newVisit.fees?.total || 0) * 0.8).toFixed(2)}) after completion.`,
              type: "info",
              link: `/site-visits/${newVisit.id}`,
              relatedEntityId: newVisit.id,
              relatedEntityType: "siteVisit",
            });
          } else {
            const hubMatches = enhanced.filter(e => e.isHubMatch);
            if (hubMatches.length > 0) {
              hubMatches.sort((a, b) => {
                if (a.workload !== b.workload) return a.workload - b.workload;
                if (a.distance !== b.distance) return a.distance - b.distance;
                return 0;
              });

              const bestHub = hubMatches[0];
              const updatedVisit = await updateSiteVisitInDb(newVisit.id, {
                status: 'assigned',
                assignedTo: bestHub.user.id,
                assignedBy: currentUser.id,
                assignedAt: new Date().toISOString(),
              });

              setAppSiteVisits(prev => prev.map(v => v.id === newVisit.id ? updatedVisit : v));

              addNotification({
                userId: bestHub.user.id,
                title: "Assigned to Site Visit",
                message: `You have been assigned to the site visit at ${newVisit.siteName}. Total fee: ${Number(newVisit.fees?.total || 0)} ${newVisit.fees?.currency || 'SDG'}. Payment schedule: 20% (${(Number(newVisit.fees?.total || 0) * 0.2).toFixed(2)}) upfront cleared before start, 80% (${(Number(newVisit.fees?.total || 0) * 0.8).toFixed(2)}) after completion.`,
                type: "info",
                link: `/site-visits/${newVisit.id}`,
                relatedEntityId: newVisit.id,
                relatedEntityType: "siteVisit",
              });
            } else if (enhanced.length > 0) {
              const anySorted = [...enhanced].sort((a, b) => {
                if (a.workload !== b.workload) return a.workload - b.workload;
                if (a.distance !== b.distance) return a.distance - b.distance;
                return 0;
              });
              const bestAny = anySorted[0];
              const updatedVisit = await updateSiteVisitInDb(newVisit.id, {
                status: 'assigned',
                assignedTo: bestAny.user.id,
                assignedBy: currentUser.id,
                assignedAt: new Date().toISOString(),
              });

              setAppSiteVisits(prev => prev.map(v => v.id === newVisit.id ? updatedVisit : v));

              addNotification({
                userId: bestAny.user.id,
                title: "Assigned to Site Visit",
                message: `You have been assigned to the site visit at ${newVisit.siteName}. Total fee: ${Number(newVisit.fees?.total || 0)} ${newVisit.fees?.currency || 'SDG'}. Payment schedule: 20% (${(Number(newVisit.fees?.total || 0) * 0.2).toFixed(2)}) upfront cleared before start, 80% (${(Number(newVisit.fees?.total || 0) * 0.8).toFixed(2)}) after completion.`,
                type: "info",
                link: `/site-visits/${newVisit.id}`,
                relatedEntityId: newVisit.id,
                relatedEntityType: "siteVisit",
              });
            }
          }
        }
      } catch (autoAssignErr) {
        console.warn('Auto-assignment failed; manual assignment remains available:', autoAssignErr);
      }

      toast({
        title: "Site visit created",
        description: "The site visit has been created successfully.",
      });

      return newVisit.id;
    } catch (error) {
      console.error("Create site visit error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while creating the site visit.",
        variant: "destructive",
      });
      return undefined;
    }
  };

  const { addNotification } = useNotifications();

  const verifySitePermit = async (siteVisitId: string): Promise<boolean> => {
    try {
      if (!currentUser) return false;

      const siteVisit = appSiteVisits.find(v => v.id === siteVisitId);
      if (!siteVisit) return false;

      const updatedVisit = await updateSiteVisitInDb(siteVisitId, {
        status: 'permitVerified',
        permitDetails: {
          ...siteVisit.permitDetails,
          verifiedBy: currentUser.id,
          verifiedAt: new Date().toISOString(),
        },
      });

      setAppSiteVisits(prev => 
        prev.map(visit => 
          visit.id === siteVisitId ? updatedVisit : visit
        )
      );

      const managers = users.filter(u => 
        ['admin', 'ict', 'fom'].includes(u.role)
      );

      managers.forEach(manager => {
        addNotification({
          userId: manager.id,
          title: "Permits Verified",
          message: `Permits for site visit #${siteVisitId} have been verified and it's ready for assignment.`,
          type: "info",
          link: `/site-visits/${siteVisitId}`,
          relatedEntityId: siteVisitId,
          relatedEntityType: "siteVisit",
        });
      });

      toast({
        title: "Permits verified",
        description: "Site visit permits have been verified.",
      });

      return true;
    } catch (error) {
      console.error("Permit verification error:", error);
      toast({
        title: "Verification error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
      return false;
    }
  };

  const assignSiteVisit = async (siteVisitId: string, userId: string): Promise<boolean> => {
    try {
      if (!currentUser) return false;
      
      const visit = appSiteVisits.find(v => v.id === siteVisitId);
      const user = users.find(u => u.id === userId);
      
      if (!visit || !user) {
        toast({
          title: "Assignment error",
          description: "Site visit or user not found.",
          variant: "destructive",
        });
        return false;
      }

      const updatedVisit = await updateSiteVisitInDb(siteVisitId, {
        status: 'assigned',
        assignedTo: userId,
        assignedBy: currentUser.id,
        assignedAt: new Date().toISOString(),
      });

      setAppSiteVisits(prev => 
        prev.map(v => v.id === siteVisitId ? updatedVisit : v)
      );

      // Notify the assignee with fee and payment schedule details
      addNotification({
        userId,
        title: "Assigned to Site Visit",
        message: `You have been assigned to the site visit at ${updatedVisit.siteName}. Total fee: ${Number(updatedVisit.fees?.total || 0)} ${updatedVisit.fees?.currency || 'SDG'}. Payment schedule: 20% (${(Number(updatedVisit.fees?.total || 0) * 0.2).toFixed(2)}) upfront cleared before start, 80% (${(Number(updatedVisit.fees?.total || 0) * 0.8).toFixed(2)}) after completion.`,
        type: "info",
        link: `/site-visits/${siteVisitId}`,
        relatedEntityId: siteVisitId,
        relatedEntityType: "siteVisit",
      });

      toast({
        title: "Site visit assigned",
        description: `The site visit has been assigned to ${user.name}.`,
      });
      return true;
    } catch (error) {
      console.error("Site visit assignment error:", error);
      toast({
        title: "Assignment error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
      return false;
    }
  };

  const startSiteVisit = async (siteVisitId: string): Promise<boolean> => {
    try {
      if (!currentUser) return false;
      
      const siteVisit = appSiteVisits.find(v => v.id === siteVisitId);
      
      if (!siteVisit) {
        toast({
          title: "Error",
          description: "Site visit not found.",
          variant: "destructive",
        });
        return false;
      }
      
      if (siteVisit.assignedTo !== currentUser.id) {
        toast({
          title: "Permission denied",
          description: "You are not assigned to this site visit.",
          variant: "destructive",
        });
        return false;
      }

      setAppSiteVisits(prev => 
        prev.map(v => 
          v.id === siteVisitId ? {
            ...v,
            status: 'inProgress',
          } : v
        )
      );

      const supervisors = users.filter(u => u.role === 'supervisor');
      supervisors.forEach(supervisor => {
        addNotification({
          userId: supervisor.id,
          title: "Site Visit Started",
          message: `${currentUser.name} has started the site visit at ${siteVisit.siteName}.`,
          type: "info",
          link: `/site-visits/${siteVisitId}`,
          relatedEntityId: siteVisitId,
          relatedEntityType: "siteVisit",
        });
      });

      toast({
        title: "Site visit started",
        description: "You have successfully started the site visit.",
      });
      return true;
    } catch (error) {
      console.error("Start site visit error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
      return false;
    }
  };

  const completeSiteVisit = async (
    siteVisitId: string, 
    data: { notes?: string; attachments?: string[] }
  ): Promise<boolean> => {
    try {
      if (!currentUser) return false;
      
      const siteVisit = appSiteVisits.find(v => v.id === siteVisitId);
      
      if (!siteVisit) {
        toast({
          title: "Error",
          description: "Site visit not found.",
          variant: "destructive",
        });
        return false;
      }
      
      if (siteVisit.assignedTo !== currentUser.id) {
        toast({
          title: "Permission denied",
          description: "You are not assigned to this site visit.",
          variant: "destructive",
        });
        return false;
      }

      if (siteVisit.status !== 'inProgress') {
        toast({
          title: "Error",
          description: "Site visit must be in progress to complete it.",
          variant: "destructive",
        });
        return false;
      }

      const now = new Date().toISOString();

      setAppSiteVisits(prev => 
        prev.map(v => 
          v.id === siteVisitId ? {
            ...v,
            status: 'completed',
            completedAt: now,
            notes: data.notes || v.notes,
            attachments: data.attachments || v.attachments,
          } : v
        )
      );

      try {
        await updateSiteVisitInDb(siteVisitId, {
          status: 'completed',
          completedAt: now,
          notes: data.notes,
          attachments: data.attachments,
        });
      } catch (persistErr) {
        console.warn('Failed to persist completed status:', persistErr);
      }


      const assignedUserId = siteVisit.assignedTo;
      const user = users.find(u => u.id === assignedUserId);
      
      if (user) {
        const workload = calculateUserWorkload(assignedUserId, appSiteVisits) - 1;
        
        const updatedUser = {
          ...user,
          performance: {
            ...user.performance,
            totalCompletedTasks: user.performance.totalCompletedTasks + 1,
            onTimeCompletion: calculateOnTimeRate(user.id, true, users),
            currentWorkload: Math.max(0, workload),
          },
        };
        updateUser(updatedUser);
      }

      const supervisors = users.filter(u => u.role === 'supervisor');
      supervisors.forEach(supervisor => {
        addNotification({
          userId: supervisor.id,
          title: "Site Visit Completed",
          message: `${currentUser.name} has completed the site visit at ${siteVisit.siteName}. Please rate the visit.`,
          type: "success",
          link: `/site-visits/${siteVisitId}/rate`,
          relatedEntityId: siteVisitId,
          relatedEntityType: "siteVisit",
        });
      });

      try {
        const { data: costData, error: costError } = await supabase
          .from('site_visit_costs')
          .select('*')
          .eq('site_visit_id', siteVisitId)
          .single();

        if (costData && !costError) {
          const totalCost = (
            parseFloat(costData.transportation_cost || 0) +
            parseFloat(costData.accommodation_cost || 0) +
            parseFloat(costData.meal_allowance || 0) +
            parseFloat(costData.other_costs || 0)
          );

          if (totalCost > 0) {
            const { data: walletData, error: walletError } = await supabase
              .from('wallets')
              .select('*')
              .eq('user_id', assignedUserId)
              .single();

            let walletId = walletData?.id;
            let currentBalance = 0;

            if (!walletData || walletError) {
              const { data: newWallet, error: createError } = await supabase
                .from('wallets')
                .insert({
                  user_id: assignedUserId,
                  balances: { SDG: totalCost },
                  total_earned: totalCost,
                })
                .select()
                .single();

              if (createError) throw createError;
              walletId = newWallet.id;
            } else {
              currentBalance = parseFloat(walletData.balances?.SDG || 0);
              const newBalance = currentBalance + totalCost;
              
              await supabase
                .from('wallets')
                .update({
                  balances: { ...walletData.balances, SDG: newBalance },
                  total_earned: parseFloat(walletData.total_earned || 0) + totalCost,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', walletId);
            }

            await supabase.from('wallet_transactions').insert({
              wallet_id: walletId,
              user_id: assignedUserId,
              type: 'site_visit_completion',
              amount: totalCost,
              currency: 'SDG',
              site_visit_id: siteVisitId,
              description: `Site visit completed: ${siteVisit.siteName}`,
              balance_before: currentBalance,
              balance_after: currentBalance + totalCost,
              created_by: currentUser.id,
            });

            addNotification({
              userId: assignedUserId,
              title: "Payment Received",
              message: `${totalCost.toFixed(2)} SDG added to your wallet for completing ${siteVisit.siteName}`,
              type: "success",
              relatedEntityId: siteVisitId,
              relatedEntityType: "siteVisit",
            });
          }
        }
      } catch (walletErr) {
        console.error('Failed to add wallet payment:', walletErr);
      }

      toast({
        title: "Site visit completed",
        description: `You have successfully completed the site visit.`,
      });
      return true;
    } catch (error) {
      console.error("Complete site visit error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
      return false;
    }
  };

  const rateSiteVisit = async (
    siteVisitId: string, 
    data: { rating: number; notes?: string }
  ): Promise<boolean> => {
    try {
      if (!currentUser) return false;

      const siteVisit = appSiteVisits.find(v => v.id === siteVisitId);
      
      if (!siteVisit || !siteVisit.assignedTo || siteVisit.status !== 'completed') {
        toast({
          title: "Error",
          description: "Cannot rate this site visit.",
          variant: "destructive",
        });
        return false;
      }

      setAppSiteVisits(prev => 
        prev.map(v => 
          v.id === siteVisitId ? {
            ...v,
            rating: data.rating,
            ratingNotes: data.notes,
          } : v
        )
      );

      const assignedUserId = siteVisit.assignedTo;
      const user = users.find(u => u.id === assignedUserId);
      
      if (user) {
        const updatedUser = {
          ...user,
          performance: {
            ...user.performance,
            rating: calculateUserRating(assignedUserId, appSiteVisits),
          },
        };
        updateUser(updatedUser);
      }

      addNotification({
        userId: assignedUserId,
        title: "Site Visit Rated",
        message: `Your site visit at ${siteVisit.siteName} has been rated ${data.rating}/5.`,
        type: data.rating >= 4 ? "success" : "info",
        link: `/site-visits/${siteVisitId}`,
        relatedEntityId: siteVisitId,
        relatedEntityType: "siteVisit",
      });

      toast({
        title: "Site visit rated",
        description: "You have successfully rated the site visit.",
      });
      return true;
    } catch (error) {
      console.error("Rate site visit error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
      return false;
    }
  };

  const deleteSiteVisit = async (siteVisitId: string): Promise<boolean> => {
    try {
      await deleteSiteVisitInDb(siteVisitId);
      setAppSiteVisits(prev => prev.filter(v => v.id !== siteVisitId));
      toast({
        title: "Site visit deleted",
        description: `The site visit has been removed.`,
      });
      return true;
    } catch (error) {
      console.error("Delete site visit error:", error);
      toast({
        title: "Deletion error",
        description: "An unexpected error occurred while deleting the site visit.",
        variant: "destructive",
      });
      return false;
    }
  };

  const getNearbyDataCollectors = (siteVisitId: string): User[] => {
    const siteVisit = appSiteVisits.find(v => v.id === siteVisitId);
    if (!siteVisit) return [];
    
    return users.filter(user => 
      (user.role === 'dataCollector' || user.role === 'datacollector') && 
      user.status === 'active' && 
      user.availability !== 'offline' && 
      isUserNearSite(user, siteVisit, 15)
    );
  };

  return (
    <SiteVisitContext.Provider
      value={{
        siteVisits: appSiteVisits,
        verifySitePermit,
        assignSiteVisit,
        startSiteVisit,
        completeSiteVisit,
        rateSiteVisit,
        getNearbyDataCollectors,
        createSiteVisit,
        deleteSiteVisit,
      }}
    >
      {children}
    </SiteVisitContext.Provider>
  );
};

export const useSiteVisitContext = () => {
  const context = useContext(SiteVisitContext);
  if (context === undefined) {
    throw new Error('useSiteVisitContext must be used within a SiteVisitProvider');
  }
  return context;
};
