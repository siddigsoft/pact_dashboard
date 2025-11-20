
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useArchive } from '@/context/archive/ArchiveContext';
import { Archive, FileText, Map, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const ArchiveStatisticsCard = () => {
  const { statistics, loading } = useArchive();
  
  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-40" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Archive Statistics
        </CardTitle>
        <CardDescription>
          Overview of archived records and documentation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted/40 rounded-md p-4 flex flex-col items-center justify-center text-center">
            <Archive className="h-8 w-8 text-primary mb-2" />
            <div className="text-2xl font-bold">{statistics.totalMmps}</div>
            <div className="text-xs text-muted-foreground">Total MMPs</div>
          </div>
          
          <div className="bg-muted/40 rounded-md p-4 flex flex-col items-center justify-center text-center">
            <Map className="h-8 w-8 text-primary mb-2" />
            <div className="text-2xl font-bold">{statistics.totalSiteVisits}</div>
            <div className="text-xs text-muted-foreground">Site Visits</div>
          </div>
          
          <div className="bg-muted/40 rounded-md p-4 flex flex-col items-center justify-center text-center">
            <FileText className="h-8 w-8 text-primary mb-2" />
            <div className="text-2xl font-bold">{statistics.totalDocuments}</div>
            <div className="text-xs text-muted-foreground">Documents</div>
          </div>

          <div className="bg-primary/10 rounded-md p-4 flex flex-col justify-center">
            <div className="text-sm font-semibold mb-2">Document Categories</div>
            {Object.entries(statistics.documentsByCategory || {}).slice(0, 3).map(([category, count]) => (
              <div key={category} className="flex justify-between text-xs">
                <span>{category.charAt(0).toUpperCase() + category.slice(1)}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
            {Object.keys(statistics.documentsByCategory || {}).length > 3 && (
              <div className="text-xs text-muted-foreground mt-1 text-right">
                +{Object.keys(statistics.documentsByCategory || {}).length - 3} more
              </div>
            )}
          </div>
        </div>

        <div className="bg-muted/20 rounded-md p-4">
          <h4 className="text-sm font-medium mb-3">Monthly Archives</h4>
          <div className="space-y-2">
            {statistics.monthlyTrends.slice(0, 6).map((month, index) => (
              <div key={index} className="flex flex-col space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{new Date(month.year, month.month).toLocaleDateString('default', { month: 'long', year: 'numeric' })}</span>
                  <span>{month.mmps + month.siteVisits + month.documents} records</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="flex h-full">
                    <div 
                      className="bg-primary h-full" 
                      style={{ width: `${(month.mmps / (month.mmps + month.siteVisits + month.documents)) * 100}%` }}
                    />
                    <div 
                      className="bg-blue-500 h-full" 
                      style={{ width: `${(month.siteVisits / (month.mmps + month.siteVisits + month.documents)) * 100}%` }}
                    />
                    <div 
                      className="bg-amber-500 h-full" 
                      style={{ width: `${(month.documents / (month.mmps + month.siteVisits + month.documents)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-xs">MMPs</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-xs">Site Visits</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-xs">Documents</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ArchiveStatisticsCard;
