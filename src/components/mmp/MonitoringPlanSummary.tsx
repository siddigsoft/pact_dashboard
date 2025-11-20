import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Users, Building, Target, FileText } from 'lucide-react';

interface MonitoringPlanSummaryProps {
  data: {
    totalSites: number;
    kulbusSites: number;
    geneinaSites: number;
    hubOffice: string;
    state: string;
    project: string;
    modality: string;
    monitoringEntity: string;
    surveyTool: string;
  };
}

const MonitoringPlanSummary: React.FC<MonitoringPlanSummaryProps> = ({ data }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Project Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Project Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Project:</span>
            <Badge variant="outline">{data.project}</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Modality:</span>
            <Badge variant="secondary">{data.modality}</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Survey Tool:</span>
            <Badge variant="default">{data.surveyTool}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Location Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin className="h-5 w-5" />
            Location Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Hub Office:</span>
            <span className="font-medium">{data.hubOffice}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">State:</span>
            <span className="font-medium">{data.state}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Kulbus Sites:</span>
            <Badge variant="outline">{data.kulbusSites}</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Geneina Sites:</span>
            <Badge variant="outline">{data.geneinaSites}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Monitoring Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5" />
            Monitoring Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total Sites:</span>
            <Badge variant="default" className="text-lg px-3 py-1">{data.totalSites}</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Monitoring By:</span>
            <Badge variant="secondary">{data.monitoringEntity}</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Activity Type:</span>
            <Badge variant="outline">GFA</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MonitoringPlanSummary;
