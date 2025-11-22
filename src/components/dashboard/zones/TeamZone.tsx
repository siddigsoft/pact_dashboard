import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, MapPin, MessageSquare } from 'lucide-react';
import { TeamCommunication } from '../TeamCommunication';
import LiveTeamMapWidget from '../LiveTeamMapWidget';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/context/user/UserContext';
import { Badge } from '@/components/ui/badge';

export const TeamZone: React.FC = () => {
  const [activeTab, setActiveTab] = useState('map');
  const navigate = useNavigate();
  const { users } = useUser();

  const activeFieldTeam = users?.filter(u => 
    u.roles?.some(r => r.toLowerCase() === 'datacollector' || r.toLowerCase() === 'coordinator' || r.toLowerCase() === 'supervisor')
  ).length || 0;

  const onlineMembers = users?.filter(u => u.location?.latitude && u.location?.longitude).length || 0;

  return (
    <div className="space-y-4">
      {/* Modern Tech Header */}
      <div className="relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-r from-green-500/5 via-blue-500/5 to-background p-4 shadow-sm">
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-green-500/10 border border-green-500/20">
              <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Team Coordination</h2>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Field team locations and communication</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <Badge variant="secondary" className="gap-2 text-xs h-7">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              {onlineMembers}/{activeFieldTeam} Online
            </Badge>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/field-team')}
              data-testid="button-view-full-team"
              className="h-7 text-xs"
            >
              View Full Team
            </Button>
          </div>
        </div>
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md h-auto p-1 bg-muted/30">
          <TabsTrigger value="map" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <MapPin className="h-3.5 w-3.5" />
            <span className="text-xs">Live Map</span>
          </TabsTrigger>
          <TabsTrigger value="communication" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="text-xs">Communication</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="mt-4">
          <LiveTeamMapWidget />
        </TabsContent>

        <TabsContent value="communication" className="mt-4">
          <TeamCommunication />
        </TabsContent>
      </Tabs>
    </div>
  );
};
