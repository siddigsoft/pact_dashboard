
import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MMPFile } from '@/types/mmp';
import { Button } from '@/components/ui/button';
import { ListFilter, FileCheck, Calendar, Building2, FileStack, MapPin, Clock, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ApprovedMMPListProps {
  mmps: MMPFile[];
  onSelectMMP: (mmp: MMPFile) => void;
}

const ApprovedMMPList: React.FC<ApprovedMMPListProps> = ({ mmps, onSelectMMP }) => {
  
  // Log MMPs for debugging
  useEffect(() => {
    console.log('MMPs passed to ApprovedMMPList:', mmps);
  }, [mmps]);

  return (
    <div className="space-y-4 bg-gradient-to-br from-background/50 to-muted/30 p-6 rounded-lg border border-border/50">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-xl font-semibold bg-gradient-to-r from-primary/90 to-primary/70 bg-clip-text text-transparent">
            Approved MMPs
          </h3>
          <p className="text-sm text-muted-foreground">
            Select an MMP to create site visits
          </p>
        </div>
        <Badge variant="secondary" className="font-medium px-3 py-1">
          {mmps.length} Available MMPs
        </Badge>
      </div>
      
      <ScrollArea className="h-[400px] pr-4 -mr-4">
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {mmps.map((mmp) => (
            <Card 
              key={mmp.id}
              className="hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-card to-muted/50 border-border/50 group"
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-sm font-medium">
                    {mmp.projectName || mmp.name || 'Unnamed Project'}
                  </CardTitle>
                  <Badge className="bg-green-100 text-green-800 group-hover:bg-green-200 transition-colors">
                    <FileCheck className="h-3 w-3 mr-1" />
                    Approved
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center text-muted-foreground">
                      <Calendar className="h-3 w-3 mr-1 text-primary/70" />
                      <span>{mmp.month && mmp.year 
                        ? format(new Date(mmp.year, mmp.month - 1), 'MMMM yyyy')
                        : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center text-muted-foreground justify-end">
                      <FileStack className="h-3 w-3 mr-1 text-primary/70" />
                      <span>{mmp.entries || 0} Sites</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center text-muted-foreground">
                      <MapPin className="h-3 w-3 mr-1 text-primary/70" />
                      <span>{mmp.region || 'N/A'}</span>
                    </div>
                    <div className="flex items-center text-muted-foreground justify-end">
                      <Clock className="h-3 w-3 mr-1 text-primary/70" />
                      <span>
                        {mmp.approvedAt 
                          ? format(new Date(mmp.approvedAt), 'dd MMM')
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center text-muted-foreground">
                    <Building2 className="h-3 w-3 mr-1 text-primary/70" />
                    <span className="truncate">
                      {mmp.uploadedBy || 'Unknown User'}
                    </span>
                  </div>
                  
                  <Button 
                    onClick={() => onSelectMMP(mmp)} 
                    className="w-full mt-2 bg-gradient-to-r from-primary/90 to-primary/70 hover:from-primary hover:to-primary/80 text-primary-foreground shadow-sm hover:shadow-md transition-all duration-300"
                  >
                    Create Site Visits
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {mmps.length === 0 && (
            <div className="col-span-full text-center py-12 bg-muted/40 rounded-lg border border-border/50">
              <AlertCircle className="h-12 w-12 mx-auto text-amber-500 mb-3" />
              <p className="text-lg font-medium mb-1">No approved MMPs found</p>
              <p className="text-sm text-muted-foreground">
                Your uploaded MMPs need to be approved before they appear here
              </p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => window.location.href = "/mmp"}
              >
                Go to MMP Management
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ApprovedMMPList;
