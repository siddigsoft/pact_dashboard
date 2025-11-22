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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Team Coordination
          </h2>
          <p className="text-sm text-muted-foreground">Field team locations and communication</p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="secondary" className="gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            {onlineMembers}/{activeFieldTeam} Online
          </Badge>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/field-team')}
            data-testid="button-view-full-team"
          >
            View Full Team
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="map" className="gap-2">
            <MapPin className="h-4 w-4" />
            Live Map
          </TabsTrigger>
          <TabsTrigger value="communication" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Communication
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
