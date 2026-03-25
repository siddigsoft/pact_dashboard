
import { SiteVisit, User } from '@/types';

export const calculateUserRating = (userId: string, siteVisits: SiteVisit[]): number => {
  // Filter site visits assigned to the user
  const assignedVisits = siteVisits.filter(visit => visit.assignedTo === userId && visit.rating !== undefined);
  
  if (assignedVisits.length === 0) {
    return 0; // Or a default rating if there are no rated visits
  }
  
  // Calculate the average rating
  const totalRating = assignedVisits.reduce((sum, visit) => sum + (visit.rating || 0), 0);
  return totalRating / assignedVisits.length;
};

export const calculateOnTimeRate = (userId: string, includeCurrent: boolean, users: User[]): number => {
  // Find the user's historical completed site visits
  const user = users.find(u => u.id === userId);
  if (!user || !user.performance) return 0;
  
  const { totalCompletedTasks, onTimeCompletion } = user.performance;
  
  // Calculate on-time rate based on historical data
  if (totalCompletedTasks === 0) return 100; // Default to 100% if no completed tasks
  
  const currentRate = onTimeCompletion / totalCompletedTasks * 100;
  
  if (!includeCurrent) return currentRate;
  
  // Include current completion in the calculation
  const newTotalTasks = totalCompletedTasks + 1;
  
  // Check if the current task is completed on time
  // This is where we add deadline awareness
  const isCurrentOnTime = true; // Let's assume it's on time for this example
  const newCompletedOnTime = isCurrentOnTime ? 
    onTimeCompletion + 1 : 
    onTimeCompletion;
  
  return (newCompletedOnTime / newTotalTasks) * 100;
};

export const isVisitDueSoon = (visit: SiteVisit, daysThreshold: number = 3): boolean => {
  const dueDate = new Date(visit.dueDate);
  const now = new Date();
  
  // Calculate days difference
  const diffTime = dueDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays >= 0 && diffDays <= daysThreshold;
};

export const isVisitOverdue = (visit: SiteVisit): boolean => {
  const dueDate = new Date(visit.dueDate);
  const now = new Date();
  
  return dueDate < now && visit.status !== 'completed' && visit.status !== 'cancelled';
};
