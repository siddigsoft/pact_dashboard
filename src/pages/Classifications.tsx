import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useClassification } from '@/context/classification/ClassificationContext';
import { Award, DollarSign, TrendingUp, Users } from 'lucide-react';

const formatCurrency = (amount: number, currency: string = 'SDG') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency === 'SDG' ? 'USD' : currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace('$', currency === 'SDG' ? 'SDG ' : '$');
};

const Classifications = () => {
  const { feeStructures, userClassifications, loading } = useClassification();
  const [activeTab, setActiveTab] = useState('fee-structures');

  const getLevelColor = (level: 'A' | 'B' | 'C') => {
    switch (level) {
      case 'A': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'B': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'C': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
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
    totalClassified: userClassifications.length,
    levelACount: userClassifications.filter(uc => uc.classificationLevel === 'A').length,
    levelBCount: userClassifications.filter(uc => uc.classificationLevel === 'B').length,
    levelCCount: userClassifications.filter(uc => uc.classificationLevel === 'C').length,
  };

  if (loading) {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Award className="h-8 w-8 text-blue-600" />
            Team Classifications
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage user classifications and fee structures
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Fee Structures
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-blue-600" />
              <span className="text-2xl font-bold">{stats.totalStructures}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Active fee combinations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Classified Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-600" />
              <span className="text-2xl font-bold">{stats.totalClassified}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Team members with levels</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Level Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Badge className={getLevelColor('A')}>A: {stats.levelACount}</Badge>
              <Badge className={getLevelColor('B')}>B: {stats.levelBCount}</Badge>
              <Badge className={getLevelColor('C')}>C: {stats.levelCCount}</Badge>
            </div>
            <p className="text-xs text-gray-500 mt-1">By experience level</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Avg Base Fee
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-600" />
              <span className="text-2xl font-bold">
                {feeStructures.length > 0
                  ? formatCurrency(
                      feeStructures.reduce((sum, fs) => sum + (fs.siteVisitBaseFeeCents || 0), 0) /
                        feeStructures.length /
                        100,
                      'SDG'
                    )
                  : 'SDG 0'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Across all levels</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="fee-structures">Fee Structures</TabsTrigger>
          <TabsTrigger value="user-classifications">User Classifications</TabsTrigger>
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
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                        Level
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                        Role
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                        Base Fee
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                        Transport Fee
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                        Total
                      </th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                        Multiplier
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeStructures
                      .sort((a, b) => {
                        if (a.classificationLevel !== b.classificationLevel) {
                          return a.classificationLevel.localeCompare(b.classificationLevel);
                        }
                        return (a.roleScope || '').localeCompare(b.roleScope || '');
                      })
                      .map((fee) => (
                        <tr
                          key={fee.id}
                          className="border-b hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <Badge className={getLevelColor(fee.classificationLevel as 'A' | 'B' | 'C')}>
                              {getLevelLabel(fee.classificationLevel as 'A' | 'B' | 'C')}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-gray-700 dark:text-gray-300">
                            {getRoleLabel(fee.roleScope || '')}
                          </td>
                          <td className="py-3 px-4 text-right font-medium">
                            {formatCurrency((fee.siteVisitBaseFeeCents || 0) / 100, fee.currency || 'SDG')}
                          </td>
                          <td className="py-3 px-4 text-right font-medium">
                            {formatCurrency((fee.siteVisitTransportFeeCents || 0) / 100, fee.currency || 'SDG')}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-blue-600">
                            {formatCurrency(
                              ((fee.siteVisitBaseFeeCents || 0) + (fee.siteVisitTransportFeeCents || 0)) / 100,
                              fee.currency || 'SDG'
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Badge variant="outline">{fee.complexityMultiplier}x</Badge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
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
              {userClassifications.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    No Classifications Yet
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Go to User Management to assign classifications to team members
                  </p>
                  <a
                    href="/users"
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Go to User Management
                  </a>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                          User
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                          Level
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                          Role Scope
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                          Effective From
                        </th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                          Retainer
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {userClassifications.map((uc) => (
                        <tr
                          key={uc.id}
                          className="border-b hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">
                                {uc.fullName || 'Unknown'}
                              </div>
                              <div className="text-sm text-gray-500">{uc.email || 'No email'}</div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge className={getLevelColor(uc.classificationLevel as 'A' | 'B' | 'C')}>
                              {getLevelLabel(uc.classificationLevel as 'A' | 'B' | 'C')}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-gray-700 dark:text-gray-300">
                            {getRoleLabel(uc.roleScope || '')}
                          </td>
                          <td className="py-3 px-4 text-gray-700 dark:text-gray-300">
                            {uc.effectiveFrom
                              ? new Date(uc.effectiveFrom).toLocaleDateString()
                              : 'Not set'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {uc.hasRetainer ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700">
                                {formatCurrency(
                                  (uc.retainerAmountCents || 0) / 100,
                                  uc.retainerCurrency || 'SDG'
                                )}
                                /{uc.retainerFrequency || 'month'}
                              </Badge>
                            ) : (
                              <span className="text-gray-400">No retainer</span>
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
    </div>
  );
};

export default Classifications;
