
import { useState, useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useUser } from '@/context/user/UserContext';
import { SiteVisit } from '@/types';
import { useToast } from '@/hooks/use-toast';

export const useSiteAssignment = () => {
  const [currentAssignment, setCurrentAssignment] = useState<SiteVisit | null>(null);
  const { siteVisits } = useSiteVisitContext();
  const { currentUser, updateUserAvailability } = useUser();
  const { toast } = useToast();

  useEffect(() => {
    if (!currentUser) return;
    
    // Find the most recent active assignment for the current user
    const activeAssignment = siteVisits.find(visit => 
      visit.assignedTo === currentUser.id && 
      (visit.status === 'assigned' || visit.status === 'inProgress')
    );
    
    if (activeAssignment && activeAssignment !== currentAssignment) {
      setCurrentAssignment(activeAssignment);
      // Play notification sound
      const audio = new Audio('/notification.mp3');
      audio.play().catch(err => console.log('Audio play failed:', err));
    }
  }, [siteVisits, currentUser]);

  const clearAssignment = () => setCurrentAssignment(null);
  
  const toggleAvailability = async () => {
    if (!currentUser) return false;
    
    const newStatus = currentUser.availability === 'online' ? 'offline' : 'online';
    const success = await updateUserAvailability(newStatus);
    
    if (success) {
      toast({
        title: `Status updated to ${newStatus === 'online' ? 'Available' : 'Unavailable'}`,
        description: newStatus === 'online' 
          ? "You can now receive assignments" 
          : "You will not receive new assignments",
        variant: newStatus === 'online' ? "success" : "default",
      });
      return true;
    }
    
    return false;
  };

  return {
    currentAssignment,
    clearAssignment,
    toggleAvailability,
    isAvailable: currentUser?.availability === 'online'
  };
};
