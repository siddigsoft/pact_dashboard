import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClassification } from '@/context/classification/ClassificationContext';
import { 
  Award, 
  DollarSign, 
  TrendingUp, 
  Users, 
  ShieldAlert, 
  Edit, 
  ExternalLink,
  Search,
  Filter,
  Download,
  Plus,
  Calendar,
  PieChart,
  BarChart3,
  Sparkles,
  Zap,
  Star,
  Crown
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import type { CurrentUserClassification } from '@/types/classification';
import type { ClassificationFeeStructure } from '@/types/classification';
import FeeStructureEditDialog from '@/components/admin/FeeStructureEditDialog';

const formatCurrency = (amount: number, currency: string = 'SDG') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency === 'SDG' ? 'USD' : currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace('$', currency === 'SDG' ? 'SDG ' : '$');
};

const Classifications = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useAppContext();
  const { canManageFinances, canEditFeeStructures } = useAuthorization();
  const { feeStructures, userClassifications, loading } = useClassification();
  const [activeTab, setActiveTab] = useState('fee-structures');
  const [enrichedClassifications, setEnrichedClassifications] = useState<CurrentUserClassification[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFeeStructure, setSelectedFeeStructure] = useState<ClassificationFeeStructure | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showVisualization, setShowVisualization] = useState(false);

  // Check authorization - view vs edit permissions
  const canAccessClassifications = canManageFinances();
  const canEditFees = canEditFeeStructures();

  // Fetch user profiles and enrich classifications
  useEffect(() => {
    const fetchUserProfiles = async () => {
      if (!canAccessClassifications) {
        setEnrichedClassifications([]);
        setProfilesLoading(false);
        return;
      }

      if (userClassifications.length === 0) {
        setEnrichedClassifications([]);
        setProfilesLoading(false);
        return;
      }

      try {
        setErrorMessage(null);
        const userIds = userClassifications.map(uc => uc.userId);
        
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);

        if (profileError) throw new Error(`Failed to fetch profiles: ${profileError.message}`);

        const { data: userRoles, error: rolesError } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', userIds);

        if (rolesError) throw new Error(`Failed to fetch user roles: ${rolesError.message}`);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        const roleMap = new Map(userRoles?.map(r => [r.user_id, r.role]) || []);
        
        const enriched: CurrentUserClassification[] = [];
        for (const uc of userClassifications) {
          const profile = profileMap.get(uc.userId);
          const role = roleMap.get(uc.userId);
          
          if (!role) {
            console.warn(`User ${uc.userId} has classification but no role assigned`);
            continue;
          }
          
          enriched.push({
            ...uc,
            fullName: profile?.full_name || 'Unknown User',
            email: profile?.email || 'no-email@unknown.com',
            userRole: role,
          });
        }

        setEnrichedClassifications(enriched);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Failed to load user data';
        console.error('Error fetching user profiles:', error);
        setErrorMessage(errMsg);
        setEnrichedClassifications([]);
        toast({
          title: 'Error Loading Data',
          description: errMsg,
          variant: 'destructive',
        });
      } finally {
        setProfilesLoading(false);
      }
    };

    if (canAccessClassifications) {
      fetchUserProfiles();
    } else {
      setProfilesLoading(false);
    }
  }, [userClassifications, toast, canAccessClassifications]);

  // Filtered classifications based on search and filters
  const filteredClassifications = useMemo(() => {
    return enrichedClassifications.filter(uc => {
      const matchesSearch = searchQuery === '' || 
        uc.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        uc.email?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesLevel = levelFilter === 'all' || uc.classificationLevel === levelFilter;
      const matchesRole = roleFilter === 'all' || uc.userRole === roleFilter;
      
      return matchesSearch && matchesLevel && matchesRole;
    });
  }, [enrichedClassifications, searchQuery, levelFilter, roleFilter]);

  // Filtered fee structures
  const filteredFeeStructures = useMemo(() => {
    return feeStructures.filter(fee => {
      const matchesSearch = searchQuery === '' || 
        fee.classificationLevel?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fee.roleScope?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesLevel = levelFilter === 'all' || fee.classificationLevel === levelFilter;
      const matchesRole = roleFilter === 'all' || fee.roleScope === roleFilter;
      
      return matchesSearch && matchesLevel && matchesRole;
    });
  }, [feeStructures, searchQuery, levelFilter, roleFilter]);

  const getLevelConfig = (level: 'A' | 'B' | 'C') => {
    switch (level) {
      case 'A': 
        return {
          gradient: 'bg-gradient-to-r from-emerald-500 to-teal-500',
          border: 'border-emerald-400/50',
          glow: 'shadow-lg shadow-emerald-500/20',
          icon: Crown,
          iconColor: 'text-emerald-100'
        };
      case 'B': 
        return {
          gradient: 'bg-gradient-to-r from-blue-500 to-cyan-500',
          border: 'border-blue-400/50',
          glow: 'shadow-lg shadow-blue-500/20',
          icon: Star,
          iconColor: 'text-blue-100'
        };
      case 'C': 
        return {
          gradient: 'bg-gradient-to-r from-orange-500 to-amber-500',
          border: 'border-orange-400/50',
          glow: 'shadow-lg shadow-orange-500/20',
          icon: Zap,
          iconColor: 'text-orange-100'
        };
      default: 
        return {
          gradient: 'bg-gradient-to-r from-gray-500 to-slate-500',
          border: 'border-gray-400/50',
          glow: 'shadow-lg shadow-gray-500/20',
          icon: Award,
          iconColor: 'text-gray-100'
        };
    }
  };

  const LevelBadge = ({ level }: { level: 'A' | 'B' | 'C' }) => {
    const config = getLevelConfig(level);
    const Icon = config.icon;
    
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border ${config.gradient} ${config.border} ${config.glow} text-white font-semibold text-xs transition-all hover:scale-105`}>
        <Icon className={`h-3.5 w-3.5 ${config.iconColor}`} />
        <span>{getLevelLabel(level)}</span>
      </div>
    );
  };

  const getRoleLabel = (role: string) => {
    const roleMap: Record<string, string> = {
      coordinator: 'Coordinator',
      dataCollector: 'Data Collector',
      supervisor: 'Supervisor',
    };
    return roleMap[role] || role;
  };

  const getLevelLabel = (level: 'A' | 'B' | 'C') => {
    switch (level) {
      case 'A': return 'Level A (Senior)';
      case 'B': return 'Level B (Regular)';
      case 'C': return 'Level C (Junior)';
      default: return level;
    }
  };

  const stats = {
    totalStructures: feeStructures.length,
    totalClassified: enrichedClassifications.length,
    levelACount: enrichedClassifications.filter(uc => uc.classificationLevel === 'A').length,
    levelBCount: enrichedClassifications.filter(uc => uc.classificationLevel === 'B').length,
    levelCCount: enrichedClassifications.filter(uc => uc.classificationLevel === 'C').length,
    withRetainer: enrichedClassifications.filter(uc => uc.hasRetainer).length,
    avgBaseFee: feeStructures.length > 0
      ? feeStructures.reduce((sum, fs) => sum + (fs.siteVisitBaseFeeCents || 0), 0) / feeStructures.length / 100
      : 0,
    totalBudget: enrichedClassifications.reduce((sum, uc) => 
      sum + (uc.hasRetainer ? (uc.retainerAmountCents || 0) : 0), 0) / 100,
  };

  const exportToCSV = () => {
    if (activeTab === 'fee-structures') {
      const headers = ['Level', 'Role', 'Base Fee', 'Multiplier', 'Total', 'Currency'];
      const rows = filteredFeeStructures.map(fee => [
        fee.classificationLevel,
        fee.roleScope || '',
        ((fee.siteVisitBaseFeeCents || 0) / 100).toString(),
        fee.complexityMultiplier?.toString() || '1',
        ((fee.siteVisitBaseFeeCents || 0) / 100).toString(),
        fee.currency || 'SDG',
      ]);
      
      const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fee-structures-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    } else {
      const headers = ['Name', 'Email', 'Level', 'Role', 'Effective From', 'Retainer', 'Amount'];
      const rows = filteredClassifications.map(uc => [
        uc.fullName || '',
        uc.email || '',
        uc.classificationLevel,
        uc.roleScope || '',
        uc.effectiveFrom ? new Date(uc.effectiveFrom).toLocaleDateString() : '',
        uc.hasRetainer ? 'Yes' : 'No',
        uc.hasRetainer ? ((uc.retainerAmountCents || 0) / 100).toString() : '0',
      ]);
      
      const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-classifications-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    }
    
    toast({
      title: 'Export Successful',
      description: 'Data has been exported to CSV file',
    });
  };

  const isLoading = loading || profilesLoading;

  if (!canAccessClassifications) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-5 w-5" />
          <AlertDescription>
            Access Denied: You do not have permission to view classifications. This page is restricted to administrators and financial admins.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading classifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Award className="h-8 w-8 text-blue-600" />
            Team Classifications
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage user classifications and fee structures
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowVisualization(!showVisualization)}
            data-testid="button-toggle-visualization"
          >
            {showVisualization ? <BarChart3 className="h-4 w-4 mr-2" /> : <PieChart className="h-4 w-4 mr-2" />}
            {showVisualization ? 'Hide' : 'Show'} Charts
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            data-testid="button-export-csv"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          {canEditFees && (
            <Button
              size="sm"
              onClick={() => {
                setSelectedFeeStructure(null);
                setEditDialogOpen(true);
              }}
              data-testid="button-create-fee-structure"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Fee Structure
            </Button>
          )}
        </div>
      </div>

      {errorMessage ? (
        <div className="space-y-4">
          <Alert variant="destructive">
            <ShieldAlert className="h-5 w-5" />
            <AlertDescription className="flex flex-col gap-2">
              <span>{errorMessage}</span>
              <button
                onClick={() => window.location.reload()}
                className="text-sm underline hover:no-underline"
              >
                Retry loading classifications
              </button>
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <>
          {/* Enhanced Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card 
              className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-blue-500 to-blue-700 text-white border-0"
              onClick={() => {
                setActiveTab('fee-structures');
                setLevelFilter('all');
                setRoleFilter('all');
                setSearchQuery('');
              }}
              data-testid="card-fee-structures"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-white/90">
                  Fee Structures
                </CardTitle>
                <DollarSign className="h-5 w-5 text-white/80" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white">{stats.totalStructures}</div>
                <p className="text-xs text-white/80 mt-1">
                  Click to view all structures
                </p>
              </CardContent>
              <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
            </Card>

            <Card 
              className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-green-500 to-emerald-700 text-white border-0"
              onClick={() => {
                setActiveTab('user-classifications');
                setLevelFilter('all');
                setRoleFilter('all');
                setSearchQuery('');
              }}
              data-testid="card-classified-users"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-white/90">
                  Classified Users
                </CardTitle>
                <Users className="h-5 w-5 text-white/80" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white">{stats.totalClassified}</div>
                <p className="text-xs text-white/80 mt-1">
                  {stats.withRetainer} with retainer
                </p>
              </CardContent>
              <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
            </Card>

            <Card 
              className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-purple-500 to-purple-700 text-white border-0"
              onClick={() => setShowVisualization(!showVisualization)}
              data-testid="card-level-distribution"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-white/90">
                  Level Distribution
                </CardTitle>
                <Award className="h-5 w-5 text-white/80" />
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1 mt-1">
                  <Badge className="bg-white/20 text-white border-white/30">A: {stats.levelACount}</Badge>
                  <Badge className="bg-white/20 text-white border-white/30">B: {stats.levelBCount}</Badge>
                  <Badge className="bg-white/20 text-white border-white/30">C: {stats.levelCCount}</Badge>
                </div>
                <p className="text-xs text-white/80 mt-2">
                  Click to {showVisualization ? 'hide' : 'show'} charts
                </p>
              </CardContent>
              <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
            </Card>

            <Card 
              className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-orange-500 to-red-600 text-white border-0"
              onClick={() => {
                setActiveTab('fee-structures');
                setShowVisualization(true);
              }}
              data-testid="card-avg-fee"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-white/90">
                  Avg Base Fee
                </CardTitle>
                <TrendingUp className="h-5 w-5 text-white/80" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white">
                  {formatCurrency(stats.avgBaseFee, 'SDG')}
                </div>
                <p className="text-xs text-white/80 mt-1">
                  Click to view analytics
                </p>
              </CardContent>
              <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
            </Card>
          </div>

          {/* Visualization Section */}
          {showVisualization && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Distribution Analytics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Level Distribution */}
                  <div>
                    <h3 className="text-sm font-semibold mb-4">Level Distribution</h3>
                    <div className="space-y-3">
                      {['A', 'B', 'C'].map((level) => {
                        const count = level === 'A' ? stats.levelACount : 
                                     level === 'B' ? stats.levelBCount : stats.levelCCount;
                        const percentage = stats.totalClassified > 0 
                          ? Math.round((count / stats.totalClassified) * 100) 
                          : 0;
                        
                        const config = getLevelConfig(level as 'A' | 'B' | 'C');
                        const Icon = config.icon;
                        
                        return (
                          <div key={level} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <Icon className={`h-4 w-4 ${
                                  level === 'A' ? 'text-emerald-500' : 
                                  level === 'B' ? 'text-blue-500' : 'text-orange-500'
                                }`} />
                                <span className="font-medium">{getLevelLabel(level as 'A' | 'B' | 'C')}</span>
                              </div>
                              <span className="text-muted-foreground">{count} ({percentage}%)</span>
                            </div>
                            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
                              <div 
                                className={`h-full ${config.gradient} shadow-lg transition-all duration-500 ease-out`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Fee Structure Summary */}
                  <div>
                    <h3 className="text-sm font-semibold mb-4">Fee Structure Overview</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm">Total Budget (Retainers)</span>
                        <span className="font-bold">{formatCurrency(stats.totalBudget, 'SDG')}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm">Fee Structures</span>
                        <span className="font-bold">{stats.totalStructures}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm">Users with Retainer</span>
                        <span className="font-bold">{stats.withRetainer}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Search and Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-users"
                  />
                </div>
                <Select value={levelFilter} onValueChange={setLevelFilter}>
                  <SelectTrigger className="w-full md:w-[180px]" data-testid="select-filter-level">
                    <SelectValue placeholder="Filter by Level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="A">Level A (Senior)</SelectItem>
                    <SelectItem value="B">Level B (Regular)</SelectItem>
                    <SelectItem value="C">Level C (Junior)</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-full md:w-[180px]" data-testid="select-filter-role">
                    <SelectValue placeholder="Filter by Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="coordinator">Coordinator</SelectItem>
                    <SelectItem value="dataCollector">Data Collector</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                  </SelectContent>
                </Select>
                {(searchQuery || levelFilter !== 'all' || roleFilter !== 'all') && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setSearchQuery('');
                      setLevelFilter('all');
                      setRoleFilter('all');
                    }}
                    data-testid="button-clear-filters"
                  >
                    <Filter className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="fee-structures" data-testid="tab-fee-structures">
                Fee Structures ({filteredFeeStructures.length})
              </TabsTrigger>
              <TabsTrigger value="user-classifications" data-testid="tab-user-classifications">
                User Classifications ({filteredClassifications.length})
              </TabsTrigger>
            </TabsList>

            {/* Fee Structures Tab */}
            <TabsContent value="fee-structures" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Fee Structures</CardTitle>
                  <CardDescription>
                    Site visit fee rates for each classification level and role combination
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {filteredFeeStructures.length === 0 ? (
                    <div className="text-center py-12">
                      <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        No Fee Structures Found
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 mb-4">
                        {(levelFilter !== 'all' || roleFilter !== 'all') 
                          ? 'Try adjusting your filters'
                          : 'Create your first fee structure to get started'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-4 font-semibold text-sm">
                              Level
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-sm">
                              Role
                            </th>
                            <th className="text-right py-3 px-4 font-semibold text-sm">
                              Base Fee
                            </th>
                            <th className="text-center py-3 px-4 font-semibold text-sm">
                              Multiplier
                            </th>
                            {canEditFees && (
                              <th className="text-center py-3 px-4 font-semibold text-sm">
                                Actions
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredFeeStructures
                            .sort((a, b) => {
                              if (a.classificationLevel !== b.classificationLevel) {
                                return a.classificationLevel.localeCompare(b.classificationLevel);
                              }
                              return (a.roleScope || '').localeCompare(b.roleScope || '');
                            })
                            .map((fee) => (
                              <tr
                                key={fee.id}
                                className="border-b hover-elevate transition-colors"
                                data-testid={`row-fee-structure-${fee.id}`}
                              >
                                <td className="py-3 px-4">
                                  <LevelBadge level={fee.classificationLevel as 'A' | 'B' | 'C'} />
                                </td>
                                <td className="py-3 px-4 text-sm">
                                  {getRoleLabel(fee.roleScope || '')}
                                </td>
                                <td className="py-3 px-4 text-right font-medium text-sm">
                                  {formatCurrency((fee.siteVisitBaseFeeCents || 0) / 100, fee.currency || 'SDG')}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <Badge variant="outline">{fee.complexityMultiplier}x</Badge>
                                </td>
                                {canEditFees && (
                                  <td className="py-3 px-4 text-center">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setSelectedFeeStructure(fee);
                                        setEditDialogOpen(true);
                                      }}
                                      data-testid={`button-edit-fee-${fee.id}`}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </td>
                                )}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* User Classifications Tab */}
            <TabsContent value="user-classifications" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>User Classifications</CardTitle>
                  <CardDescription>
                    Team members with assigned classification levels
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {filteredClassifications.length === 0 ? (
                    <div className="text-center py-12">
                      <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        {searchQuery || levelFilter !== 'all' || roleFilter !== 'all'
                          ? 'No Users Found'
                          : 'No Classifications Yet'}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 mb-4">
                        {searchQuery || levelFilter !== 'all' || roleFilter !== 'all'
                          ? 'Try adjusting your search or filters'
                          : 'Go to User Management to assign classifications to team members'}
                      </p>
                      {!searchQuery && levelFilter === 'all' && roleFilter === 'all' && (
                        <Button
                          onClick={() => navigate('/users')}
                          data-testid="button-go-to-users"
                        >
                          Go to User Management
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-4 font-semibold text-sm">
                              User
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-sm">
                              Level
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-sm">
                              Role Scope
                            </th>
                            <th className="text-left py-3 px-4 font-semibold text-sm">
                              Effective From
                            </th>
                            <th className="text-center py-3 px-4 font-semibold text-sm">
                              Retainer
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredClassifications.map((uc) => (
                            <tr
                              key={uc.id}
                              className="border-b hover-elevate transition-colors cursor-pointer"
                              onClick={() => navigate(`/users/${uc.userId}?tab=classification`)}
                              data-testid={`row-user-classification-${uc.userId}`}
                            >
                              <td className="py-3 px-4">
                                <div>
                                  <div className="font-medium flex items-center gap-2">
                                    {uc.fullName || 'Unknown'}
                                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                  </div>
                                  <div className="text-sm text-muted-foreground">{uc.email || 'No email'}</div>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <LevelBadge level={uc.classificationLevel as 'A' | 'B' | 'C'} />
                              </td>
                              <td className="py-3 px-4 text-sm">
                                {getRoleLabel(uc.roleScope || '')}
                              </td>
                              <td className="py-3 px-4 text-sm text-muted-foreground">
                                {uc.effectiveFrom
                                  ? new Date(uc.effectiveFrom).toLocaleDateString()
                                  : 'Not set'}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {uc.hasRetainer ? (
                                  <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-200">
                                    {formatCurrency(
                                      (uc.retainerAmountCents || 0) / 100,
                                      uc.retainerCurrency || 'SDG'
                                    )}
                                    /{uc.retainerFrequency || 'month'}
                                  </Badge>
                                ) : (
                                  <span className="text-sm text-muted-foreground">No retainer</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Fee Structure Edit Dialog */}
      {editDialogOpen && (
        <FeeStructureEditDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          feeStructure={selectedFeeStructure}
        />
      )}
    </div>
  );
};

export default Classifications;
