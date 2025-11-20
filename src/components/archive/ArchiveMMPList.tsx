
import React from 'react';
import { useArchive } from '@/context/archive/ArchiveContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Archive, MoreHorizontal, Eye, Download, FileText } from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { useNavigate } from 'react-router-dom';

const ArchiveMMPList = () => {
  const { archivedMMPs, loading, currentArchive } = useArchive();
  const navigate = useNavigate();
  
  const viewMMPDetail = (mmpId: string) => {
    navigate(`/mmp/${mmpId}`);
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'archived':
        return 'bg-slate-100 text-slate-800 border-slate-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };
  
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/3" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const filteredMMPs = currentArchive 
    ? archivedMMPs.filter(mmp => mmp.year === currentArchive.year && mmp.month === currentArchive.month)
    : archivedMMPs;
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Archive className="h-5 w-5 text-primary" />
          Archived MMP Files
        </CardTitle>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-2" /> Export List
        </Button>
      </CardHeader>
      <CardContent>
        {filteredMMPs.length > 0 ? (
          <div className="space-y-4">
            {filteredMMPs.map((mmp) => (
              <div 
                key={mmp.id} 
                className="border rounded-lg p-4 transition-all hover:shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center justify-between md:justify-start md:gap-3">
                    <h3 className="font-medium text-base truncate">{mmp.name}</h3>
                    <Badge className={`ml-2 ${getStatusColor(mmp.status)}`}>
                      {mmp.status.charAt(0).toUpperCase() + mmp.status.slice(1)}
                    </Badge>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">ID:</span>
                      <span className="font-mono">{mmp.id}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Uploaded:</span>
                      <span>{format(new Date(mmp.uploadedAt), 'MMM d, yyyy')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Sites:</span>
                      <span>{mmp.entries}</span>
                    </div>
                  </div>
                  
                  {mmp.documents.length > 0 && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      {mmp.documents.length} document{mmp.documents.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2 self-end md:self-center">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => viewMMPDetail(mmp.id)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View
                  </Button>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Archive className="h-4 w-4 mr-2" />
                        Change Archive Status
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground">
            {currentArchive 
              ? `No MMP files found for ${currentArchive.label}`
              : 'No archived MMP files found'}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ArchiveMMPList;
