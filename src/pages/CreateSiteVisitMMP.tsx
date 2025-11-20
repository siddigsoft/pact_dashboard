
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/context/AppContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { FileText, CalendarIcon, Plus, Search, ChevronLeft, AlertCircle } from 'lucide-react';
import { MMPFile } from '@/types';
import { format } from 'date-fns';
import { useMMP } from '@/context/mmp/MMPContext';
import { debugMMPFiles } from '@/utils/mmpUtils';
import { useAuthorization } from '@/hooks/use-authorization';

const CreateSiteVisitMMP = () => {
  const navigate = useNavigate();
  const { currentUser } = useAppContext();
  const { checkPermission, hasAnyRole } = useAuthorization();
  const { mmpFiles, loading } = useMMP();
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Debug MMP files data
    debugMMPFiles(mmpFiles || [], 'CreateSiteVisitMMP');
  }, [mmpFiles]);

  // Filter MMPs that are approved and have entries
  const approvedMMPs = mmpFiles?.filter(mmp => 
    mmp.status === 'approved' && 
    (mmp.siteEntries?.length || mmp.entries || 0) > 0
  ) || [];
  
  // Filter by search term
  const filteredMMPs = approvedMMPs.filter(mmp => 
    mmp.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (mmp.mmpId && mmp.mmpId.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (mmp.projectName && mmp.projectName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Check if user has permission (admin bypass)
  const canAccess = checkPermission('site_visits', 'create') || hasAnyRole(['admin']);
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
              onClick={() => navigate('/site-visits')}
              className="w-full"
            >
              Return to Site Visits
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectMMP = (mmpId: string) => {
    navigate(`/site-visits/create/mmp/${mmpId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/site-visits/create")}
          className="mr-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create Site Visit from MMP</h1>
          <p className="text-muted-foreground">Select an approved MMP file to create site visits</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by MMP name or ID..."
          className="pl-8"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <p>Loading MMP files...</p>
        </div>
      ) : filteredMMPs.length > 0 ? (
        <ScrollArea className="h-[60vh]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMMPs.map((mmp) => (
              <Card key={mmp.id} className="cursor-pointer hover:border-primary" onClick={() => selectMMP(mmp.id)}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg truncate">{mmp.name}</CardTitle>
                    <div className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                      {mmp.mmpId || 'MMP'}
                    </div>
                  </div>
                  <CardDescription>
                    {mmp.projectName || 'No project name'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-2">
                  <div className="flex flex-col space-y-2">
                    <div className="flex justify-between text-sm">
                      <div className="flex items-center text-muted-foreground">
                        <FileText className="h-3.5 w-3.5 mr-1" />
                        {mmp.siteEntries?.length || mmp.entries || 0} site entries
                      </div>
                      <div className="flex items-center text-muted-foreground">
                        <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                        {mmp.approvedAt ? format(new Date(mmp.approvedAt), 'MMM d, yyyy') : 'N/A'}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {mmp.description || 'No description available'}
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pt-2">
                  <Button className="w-full" size="sm">
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Create Site Visits
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
            <AlertCircle className="h-10 w-10 text-amber-500" />
          </div>
          <h3 className="text-lg font-medium">No MMPs found</h3>
          <p className="text-muted-foreground mt-1">
            {mmpFiles.length === 0 
              ? "You haven't uploaded any MMPs yet."
              : approvedMMPs.length === 0 
                ? "Your uploaded MMPs need to be approved before they appear here." 
                : "No MMPs matching your search criteria."}
          </p>
          <div className="flex gap-4 mt-6">
            <Button 
              variant="outline" 
              onClick={() => navigate('/mmp')} 
              className="mt-4"
            >
              View All MMPs
            </Button>
            <Button 
              onClick={() => navigate('/mmp/upload')} 
              className="mt-4"
            >
              Upload New MMP
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateSiteVisitMMP;
