
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArchiveProvider } from "@/context/archive/ArchiveContext";
import { useAppContext } from "@/context/AppContext";
import ArchiveHeader from "@/components/archive/ArchiveHeader";
import ArchiveFilters from "@/components/archive/ArchiveFilters";
import ArchiveStatisticsCard from "@/components/archive/ArchiveStatisticsCard";
import ArchiveMMPList from "@/components/archive/ArchiveMMPList";
import ArchiveSiteVisitList from "@/components/archive/ArchiveSiteVisitList";
import ArchiveDocumentList from "@/components/archive/ArchiveDocumentList";
import ArchiveSearch from "@/components/archive/ArchiveSearch";
import ArchiveCalendarView from "@/components/archive/ArchiveCalendarView";
import { useAuthorization } from "@/hooks/use-authorization";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const ArchivePage = () => {
  const navigate = useNavigate();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { currentUser } = useAppContext();
  const { checkPermission, hasAnyRole } = useAuthorization();
  const canAccess = checkPermission('reports', 'read') || hasAnyRole(['admin']);
  if (!canAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => navigate('/dashboard')}
              className="w-full"
            >
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const handleBackClick = () => {
    navigate("/dashboard");
  };
  
  const handleResultSelect = (type: 'mmp' | 'siteVisit' | 'document', id: string) => {
    if (type === 'mmp') {
      navigate(`/mmp/${id}`);
    } else if (type === 'siteVisit') {
      navigate(`/site-visits/${id}`);
    } else if (type === 'document') {
      // For now, just show a modal or toast notification
      // This could be implemented with a document viewer component
    }
  };

  return (
    <ArchiveProvider currentUser={currentUser}>
      <div className="space-y-6">
        <ArchiveHeader 
          onFilterOpen={() => setFiltersOpen(true)} 
          onBackClick={handleBackClick} 
        />
        
        <ArchiveFilters open={filtersOpen} onOpenChange={setFiltersOpen} />
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <ArchiveSearch onResultSelect={handleResultSelect} />
          </div>
          <div className="md:col-span-1">
            <ArchiveCalendarView />
          </div>
        </div>
        
        <ArchiveStatisticsCard />
        
        <Tabs defaultValue="mmps" className="w-full">
          <TabsList className="grid grid-cols-3 max-w-md mx-auto mb-4">
            <TabsTrigger value="mmps">MMP Files</TabsTrigger>
            <TabsTrigger value="visits">Site Visits</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>
          <TabsContent value="mmps" className="space-y-6">
            <ArchiveMMPList />
          </TabsContent>
          <TabsContent value="visits" className="space-y-6">
            <ArchiveSiteVisitList />
          </TabsContent>
          <TabsContent value="documents" className="space-y-6">
            <ArchiveDocumentList />
          </TabsContent>
        </Tabs>
      </div>
    </ArchiveProvider>
  );
};

export default ArchivePage;
