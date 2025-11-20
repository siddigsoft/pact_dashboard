
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  MapPin, 
  Clock, 
  AlertCircle,
  MessageSquare, 
  Phone, 
  CheckCircle, 
  ChevronDown, 
  ChevronUp,
  XCircle 
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { SiteVisit } from '@/types';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

interface AssignmentAlertPopupProps {
  siteVisit: SiteVisit;
  onAccept: () => void;
  onDecline: () => void;
  onOpenChat: () => void;
  onCall: () => void;
  timeLimit?: number; // in seconds
  onExpire?: () => void;
}

const AssignmentAlertPopup: React.FC<AssignmentAlertPopupProps> = ({
  siteVisit,
  onAccept,
  onDecline,
  onOpenChat,
  onCall,
  timeLimit = 300, // 5 minutes default
  onExpire,
}) => {
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (onExpire) onExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [onExpire]);
  
  const progressPercentage = (timeLeft / timeLimit) * 100;
  
  const handleAccept = () => {
    toast({
      title: "Assignment Accepted",
      description: `You've accepted the assignment at ${siteVisit.siteName}`,
      variant: "success",
    });
    onAccept();
  };
  
  const handleDecline = () => {
    toast({
      title: "Assignment Declined",
      description: `You've declined the assignment at ${siteVisit.siteName}`,
      variant: "destructive",
    });
    onDecline();
    setIsVisible(false);
  };

  const formatRemainingTime = () => {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        transition={{ duration: 0.3 }}
        className="fixed bottom-4 right-4 z-50 max-w-sm w-full shadow-2xl"
      >
        {isCollapsed ? (
          <Button
            variant="default"
            className="ml-auto flex items-center gap-2 rounded-full shadow-lg"
            onClick={() => setIsCollapsed(false)}
          >
            <AlertCircle className="h-5 w-5" />
            <span>New Assignment</span>
            <Badge variant="outline" className="bg-background text-foreground">
              {formatRemainingTime()}
            </Badge>
          </Button>
        ) : (
          <Card className="border-2 border-primary">
            <CardContent className="p-0">
              <div className="bg-primary/10 p-3 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-primary" />
                  <h3 className="font-medium">New Site Visit Assignment</h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setIsCollapsed(true)}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
              
              <Progress value={progressPercentage} className="h-1 rounded-none" />
              
              <div className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg">{siteVisit.siteName}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {siteVisit.location.address}
                    </p>
                  </div>
                  
                  <Badge 
                    variant={timeLeft < 60 ? "destructive" : "outline"}
                    className="flex items-center gap-1"
                  >
                    <Clock className="h-3 w-3" /> {formatRemainingTime()}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Priority</span>
                    <Badge 
                      variant="outline" 
                      className={`w-fit mt-1 ${
                        siteVisit.priority === 'high' ? 'text-red-500 border-red-200' :
                        siteVisit.priority === 'medium' ? 'text-amber-500 border-amber-200' :
                        'text-green-500 border-green-200'
                      }`}
                    >
                      {siteVisit.priority.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Due Date</span>
                    <span className="font-medium mt-1">
                      {new Date(siteVisit.dueDate).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <div className="flex flex-col col-span-2">
                    <span className="text-muted-foreground">Project</span>
                    <span className="font-medium mt-1">
                      {siteVisit.mmpDetails.projectName}
                    </span>
                  </div>
                </div>
                
                <div className="pt-2 flex flex-wrap gap-2">
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="flex-1"
                    onClick={handleDecline}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Decline
                  </Button>
                  
                  <Button 
                    variant="default"
                    size="sm" 
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={handleAccept}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Accept
                  </Button>
                </div>
                
                <div className="pt-1 flex flex-wrap gap-2">
                  <Button 
                    variant="outline"
                    size="sm" 
                    className="flex-1"
                    onClick={onOpenChat}
                  >
                    <MessageSquare className="h-4 w-4 mr-1" />
                    Chat
                  </Button>
                  
                  <Button 
                    variant="outline"
                    size="sm" 
                    className="flex-1"
                    onClick={onCall}
                  >
                    <Phone className="h-4 w-4 mr-1" />
                    Call
                  </Button>
                </div>
                
                <Button 
                  variant="link" 
                  size="sm" 
                  className="w-full p-0 h-8 mt-1 text-xs"
                  onClick={() => navigate(`/site-visits/${siteVisit.id}`)}
                >
                  View full details
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default AssignmentAlertPopup;
