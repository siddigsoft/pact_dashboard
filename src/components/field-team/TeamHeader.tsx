
import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { User } from '@/types';
import GpsLocationCapture from '@/components/GpsLocationCapture';
import { useUser } from '@/context/user/UserContext';

interface TeamHeaderProps {
  currentUser: User | null;
}

const TeamHeader: React.FC<TeamHeaderProps> = ({ currentUser }) => {
  const navigate = useNavigate();
  const { updateUserLocation } = useUser();
  
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-background to-muted p-6 rounded-lg shadow-sm">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/dashboard")}
          className="hover:bg-background/50"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Field Team</h1>
          <p className="text-muted-foreground">
            Monitor and manage your field team in real-time
          </p>
        </div>
      </div>
      
      {currentUser && (
        <GpsLocationCapture
          user={currentUser}
          onLocationCapture={(lat, lng, accuracy) => {
            updateUserLocation(lat, lng, accuracy);
          }}
        />
      )}
    </div>
  );
};

export default TeamHeader;
