import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import {
  CheckCircle,
  Clock,
  FileCheck,
  MapPin,
  Users,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  BarChart3,
  Calendar,
  Target
} from 'lucide-react';
import { format } from 'date-fns';

interface CoordinatorStats {
  totalSites: number;
  newSites: number;
  permitsAttached: number;
  verifiedSites: number;
  approvedSites: number;
  completedSites: number;
  rejectedSites: number;
  pendingLocalPermits: number;
  pendingStatePermits: number;
}

interface RecentActivity {
  id: string;
  type: 'verification' | 'approval' | 'rejection' | 'permit_upload';
  siteName: string;
  siteCode: string;
  timestamp: string;
  details: string;
}

const CoordinatorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAppContext();
  const [stats, setStats] = useState<CoordinatorStats>({
    totalSites: 0,
    newSites: 0,
    permitsAttached: 0,
    verifiedSites: 0,
    approvedSites: 0,
    completedSites: 0,
    rejectedSites: 0,
    pendingLocalPermits: 0,
    pendingStatePermits: 0
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.id) return;
    loadDashboardData();
  }, [currentUser]);

  const loadDashboardData = async () => {
    if (!currentUser?.id) return;

    setLoading(true);
    try {
      const userId = currentUser.id;

      // Load all mmp_site_entries and filter by assigned_to in additional_data
      const { data: allEntries, error } = await supabase
        .from('mmp_site_entries')
        .select('*')
        .limit(1000);

      if (error) throw error;

      // Filter entries assigned to current user
      const userEntries = (allEntries || []).filter((entry: any) => {
        const ad = entry.additional_data || {};
        return ad.assigned_to === userId;
      });

      // Calculate stats
      const newSites = userEntries.filter((e: any) =>
        e.status === 'Pending' || e.status === 'Dispatched' || e.status === 'assigned' || e.status === 'inProgress' || e.status === 'in_progress'
      ).length;

      const permitsAttached = userEntries.filter((e: any) =>
        e.status?.toLowerCase() === 'permits_attached'
      ).length;

      const verifiedSites = userEntries.filter((e: any) =>
        e.status?.toLowerCase() === 'verified'
      ).length;

      const approvedSites = userEntries.filter((e: any) =>
        e.status?.toLowerCase() === 'approved'
      ).length;

      const completedSites = userEntries.filter((e: any) =>
        e.status?.toLowerCase() === 'completed'
      ).length;

      const rejectedSites = userEntries.filter((e: any) =>
        e.status?.toLowerCase() === 'rejected'
      ).length;

      // Calculate permit requirements
      const statesMap = new Map<string, any>();
      userEntries.forEach((site: any) => {
        const stateKey = site.state;
        if (!statesMap.has(stateKey)) {
          statesMap.set(stateKey, {
            state: site.state,
            localities: new Map(),
            totalSites: 0,
            hasStatePermit: false
          });
        }

        const stateData = statesMap.get(stateKey);
        const localityKey = site.locality;

        if (!stateData.localities.has(localityKey)) {
          stateData.localities.set(localityKey, {
            state: site.state,
            locality: site.locality,
            sites: [],
            hasPermit: false
          });
        }

        stateData.localities.get(localityKey).sites.push(site);
        stateData.totalSites++;
      });

      // Check permit status
      let pendingStatePermits = 0;
      let pendingLocalPermits = 0;

      for (const stateData of statesMap.values()) {
        // Check state permits
        const mmpFileId = stateData.localities.values().next().value?.sites?.[0]?.mmp_file_id;
        if (mmpFileId) {
          try {
            const { data: mmpData } = await supabase
              .from('mmp_files')
              .select('permits')
              .eq('id', mmpFileId)
              .single();

            if (mmpData?.permits) {
              const permitsData = mmpData.permits as any;
              if (permitsData.statePermits) {
                const sp = permitsData.statePermits.find((sp: any) => sp.state === stateData.state);
                if (!sp || !sp.verified) {
                  pendingStatePermits++;
                }
              }
            } else {
              pendingStatePermits++;
            }
          } catch (err) {
            pendingStatePermits++;
          }
        }

        // Check local permits
        for (const locality of stateData.localities.values()) {
          const resolvedStateId = await getStateIdFromName(stateData.state);
          const resolvedLocalityId = resolvedStateId ? await getLocalityIdFromName(locality.locality, resolvedStateId) : null;

          if (resolvedStateId && resolvedLocalityId) {
            const { data: permit } = await supabase
              .from('coordinator_locality_permits')
              .select('id')
              .eq('state_id', resolvedStateId)
              .eq('locality_id', resolvedLocalityId)
              .maybeSingle();

            if (!permit) {
              pendingLocalPermits++;
            }
          }
        }
      }

      setStats({
        totalSites: userEntries.length,
        newSites,
        permitsAttached,
        verifiedSites,
        approvedSites,
        completedSites,
        rejectedSites,
        pendingLocalPermits,
        pendingStatePermits
      });

      // Load recent activity (last 5 actions)
      const recentEntries = userEntries
        .filter((entry: any) => entry.verified_at || entry.approved_at || entry.rejected_at)
        .sort((a: any, b: any) => {
          const aTime = new Date(a.verified_at || a.approved_at || a.rejected_at || a.updated_at).getTime();
          const bTime = new Date(b.verified_at || b.approved_at || b.rejected_at || b.updated_at).getTime();
          return bTime - aTime;
        })
        .slice(0, 5)
        .map((entry: any) => {
          let type: 'verification' | 'approval' | 'rejection' | 'permit_upload' = 'verification';
          let timestamp = entry.verified_at;
          let details = '';

          if (entry.status?.toLowerCase() === 'approved') {
            type = 'approval';
            timestamp = entry.approved_at || entry.updated_at;
            details = 'Site approved';
          } else if (entry.status?.toLowerCase() === 'rejected') {
            type = 'rejection';
            timestamp = entry.verified_at || entry.updated_at;
            details = entry.verification_notes || 'Site rejected';
          } else if (entry.status?.toLowerCase() === 'verified') {
            type = 'verification';
            timestamp = entry.verified_at;
            details = 'Site verified';
          }

          return {
            id: entry.id,
            type,
            siteName: entry.site_name,
            siteCode: entry.site_code,
            timestamp,
            details
          };
        });

      setRecentActivity(recentEntries);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStateIdFromName = async (stateName: string): Promise<string | null> => {
    // This would need to be implemented based on your data structure
    // For now, return null
    return null;
  };

  const getLocalityIdFromName = async (localityName: string, stateId: string): Promise<string | null> => {
    // This would need to be implemented based on your data structure
    // For now, return null
    return null;
  };

  const StatCard = ({ title, value, icon: Icon, color, onClick }: {
    title: string;
    value: number;
    icon: any;
    color: string;
    onClick?: () => void;
  }) => (
    <Card className={`cursor-pointer transition-all hover:shadow-md ${onClick ? 'hover:scale-105' : ''}`} onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
          <Icon className={`h-8 w-8 ${color.replace('text-', 'text-').replace('-600', '-500')}`} />
        </div>
      </CardContent>
    </Card>
  );

  const QuickActionCard = ({ title, description, icon: Icon, onClick, color = "bg-blue-500" }: {
    title: string;
    description: string;
    icon: any;
    onClick: () => void;
    color?: string;
  }) => (
    <Card className="cursor-pointer transition-all hover:shadow-md hover:scale-105" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">{title}</h3>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            Coordinator Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {currentUser?.fullName || currentUser?.email}
          </p>
        </div>
        <Button
          onClick={() => navigate('/dashboard')}
          variant="outline"
          className="flex items-center gap-2"
        >
          <ArrowRight className="h-4 w-4" />
          Main Dashboard
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="New Sites"
          value={stats.newSites}
          icon={Clock}
          color="text-blue-600"
          onClick={() => navigate('/coordinator/sites')}
        />
        <StatCard
          title="Permits Attached"
          value={stats.permitsAttached}
          icon={FileCheck}
          color="text-green-600"
          onClick={() => navigate('/coordinator/sites')}
        />
        <StatCard
          title="Verified"
          value={stats.verifiedSites}
          icon={CheckCircle}
          color="text-purple-600"
          onClick={() => navigate('/coordinator/sites')}
        />
        <StatCard
          title="Completed"
          value={stats.completedSites}
          icon={Target}
          color="text-emerald-600"
          onClick={() => navigate('/coordinator/sites')}
        />
      </div>

      {/* Permit Alerts */}
      {(stats.pendingStatePermits > 0 || stats.pendingLocalPermits > 0) && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                  Permit Requirements
                </h3>
                <div className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-300">
                  {stats.pendingStatePermits > 0 && (
                    <p>• {stats.pendingStatePermits} state permit{stats.pendingStatePermits !== 1 ? 's' : ''} required</p>
                  )}
                  {stats.pendingLocalPermits > 0 && (
                    <p>• {stats.pendingLocalPermits} local permit{stats.pendingLocalPermits !== 1 ? 's' : ''} required</p>
                  )}
                </div>
                <Button
                  size="sm"
                  className="mt-3 bg-amber-600 hover:bg-amber-700"
                  onClick={() => navigate('/coordinator/sites')}
                >
                  Manage Permits
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <QuickActionCard
          title="Site Verification"
          description="Review and verify sites assigned to you"
          icon={CheckCircle}
          onClick={() => navigate('/coordinator/sites')}
          color="bg-blue-500"
        />
        <QuickActionCard
          title="Sites for Verification"
          description="View sites ready for verification"
          icon={MapPin}
          onClick={() => navigate('/coordinator/sites-for-verification')}
          color="bg-green-500"
        />
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className={`p-1.5 rounded-full ${
                    activity.type === 'verification' ? 'bg-purple-100 text-purple-600' :
                    activity.type === 'approval' ? 'bg-green-100 text-green-600' :
                    activity.type === 'rejection' ? 'bg-red-100 text-red-600' :
                    'bg-blue-100 text-blue-600'
                  }`}>
                    {activity.type === 'verification' ? <CheckCircle className="h-3 w-3" /> :
                     activity.type === 'approval' ? <Target className="h-3 w-3" /> :
                     activity.type === 'rejection' ? <AlertTriangle className="h-3 w-3" /> :
                     <FileCheck className="h-3 w-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {activity.siteName} ({activity.siteCode})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activity.details}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(activity.timestamp), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Performance Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.totalSites}</div>
              <div className="text-xs text-muted-foreground">Total Sites</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {stats.totalSites > 0 ? Math.round((stats.completedSites / stats.totalSites) * 100) : 0}%
              </div>
              <div className="text-xs text-muted-foreground">Completion Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {stats.verifiedSites + stats.approvedSites + stats.completedSites}
              </div>
              <div className="text-xs text-muted-foreground">Processed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.rejectedSites}</div>
              <div className="text-xs text-muted-foreground">Rejected</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CoordinatorDashboard;