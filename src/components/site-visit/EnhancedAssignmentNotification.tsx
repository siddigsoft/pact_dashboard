
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, MapPin, Navigation, Clock, CheckCircle, XCircle, MessageSquare, Phone } from 'lucide-react';
import { SiteVisit, User } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/toast';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useNavigate } from 'react-router-dom';
import { useCommunication } from '@/context/communications/CommunicationContext';

interface EnhancedAssignmentNotificationProps {
  siteVisit: SiteVisit;
  user: User;
  timeout: number;
  onAccept: () => void;
  onDecline: () => void;
  onTimeout: () => void;
}

const EnhancedAssignmentNotification: React.FC<EnhancedAssignmentNotificationProps> = ({
  siteVisit,
  user,
  timeout,
  onAccept,
  onDecline,
  onTimeout,
}) => {
  const [timeLeft, setTimeLeft] = useState(timeout);
  const [isMinimized, setIsMinimized] = useState(false);
  const { toast } = useToast();
  const { getNearbyDataCollectors } = useSiteVisitContext();
  const navigate = useNavigate();
  const { createChatForSiteVisit } = useCommunication();
  
  useEffect(() => {
    if (timeLeft <= 0) {
      onTimeout();
      return;
    }
    
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [timeLeft, onTimeout]);
  
  const progressPercentage = (timeLeft / timeout) * 100;
  
  const handleAccept = () => {
    toast({
      title: "Assignment Accepted",
      description: `You have accepted the site visit to ${siteVisit.siteName}`,
      variant: "success"
    });
    onAccept();
  };
  
  const handleDecline = () => {
    toast({
      title: "Assignment Declined",
      description: `You have declined the site visit to ${siteVisit.siteName}`,
      variant: "destructive"
    });
    onDecline();
  };

  const handleOpenChat = () => {
    // Fix: Pass the site visit ID instead of the whole object
    createChatForSiteVisit(siteVisit.id);
    navigate('/chat');
  };

  const handleCallCoordinator = () => {
    window.open(`tel:${siteVisit.team?.coordinator}`);
  };
  
  if (isMinimized) {
    return (
      <div 
        className="fixed bottom-4 right-4 bg-primary text-white p-2 rounded-full cursor-pointer shadow-lg z-50 animate-pulse"
        onClick={() => setIsMinimized(false)}
      >
        <Clock className="h-6 w-6" />
        <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
          {timeLeft}
        </span>
      </div>
    );
  }
  
  return (
    <div className="fixed bottom-4 right-4 max-w-md w-full sm:w-96 shadow-xl z-50 animate-in slide-in-from-right">
      <Card className="border-2 border-primary">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              <h3 className="font-medium">New Site Visit Assignment</h3>
            </div>
            <Badge variant={timeLeft < 10 ? "destructive" : "outline"}>
              {timeLeft}s
            </Badge>
          </div>
          
          <Progress value={progressPercentage} className="h-1" />
          
          <div className="pt-1">
            <div className="font-medium">{siteVisit.siteName}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {siteVisit.location.address}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <Navigation className="h-3 w-3" /> ~3.5km from your location
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 pt-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 border-red-200 text-red-700 hover:bg-red-50"
              onClick={handleDecline}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Decline
            </Button>
            <Button 
              size="sm" 
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={handleAccept}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Accept
            </Button>
          </div>

          <div className="flex gap-2 pt-1">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={handleOpenChat}
            >
              <MessageSquare className="h-4 w-4 mr-1" />
              Open Chat
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={handleCallCoordinator}
            >
              <Phone className="h-4 w-4 mr-1" />
              Call Coordinator
            </Button>
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full text-xs" 
            onClick={() => setIsMinimized(true)}
          >
            Minimize
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default EnhancedAssignmentNotification;
