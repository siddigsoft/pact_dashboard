import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, FileText, FolderOpen, Share2 } from 'lucide-react';
import { DashboardCalendar } from '../DashboardCalendar';
import { MMPOverviewCard } from '../MMPOverviewCard';
import ForwardedMMPsCard from '../ForwardedMMPsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useProjectContext } from '@/context/project/ProjectContext';
import { Badge } from '@/components/ui/badge';

export const PlanningZone: React.FC = () => {
  const [activeTab, setActiveTab] = useState('calendar');
  const navigate = useNavigate();
  const { projects } = useProjectContext();

  const activeProjects = projects?.filter(p => p.status === 'active').length || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            Planning & Scheduling
          </h2>
          <p className="text-sm text-muted-foreground">Strategic planning and monitoring plans</p>
        </div>
        <Badge variant="secondary">
          {activeProjects} Active Projects
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="calendar" className="gap-2">
            <Calendar className="h-4 w-4" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="mmps" className="gap-2">
            <FileText className="h-4 w-4" />
            MMPs
          </TabsTrigger>
          <TabsTrigger value="forwarded" className="gap-2">
            <Share2 className="h-4 w-4" />
            Forwarded
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <DashboardCalendar />
        </TabsContent>

        <TabsContent value="mmps" className="mt-4">
          <MMPOverviewCard />
        </TabsContent>

        <TabsContent value="forwarded" className="mt-4">
          <ForwardedMMPsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
};
