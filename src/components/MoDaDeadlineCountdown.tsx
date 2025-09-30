
import React, { useState, useEffect } from 'react';
import { Clock, Calendar, AlertTriangle, CheckCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useNotificationManager } from '@/hooks/use-notification-manager';
import { useAppContext } from '@/context/AppContext';

export const MoDaDeadlineCountdown: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  
  const [isPastDeadline, setIsPastDeadline] = useState(false);
  const { sendNotification } = useNotificationManager();
  const { currentUser } = useAppContext();
  const targetDay = 5; // Deadline is the 5th of each month
  
  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      let targetDate = new Date(now.getFullYear(), now.getMonth(), targetDay, 23, 59, 59);
      
      // If today is past the target day, set target to next month
      if (now.getDate() > targetDay) {
        targetDate = new Date(now.getFullYear(), now.getMonth() + 1, targetDay, 23, 59, 59);
        setIsPastDeadline(true);
      } else {
        setIsPastDeadline(false);
      }
      
      const difference = targetDate.getTime() - now.getTime();
      
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60)
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };
    
    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    
    // Send reminder notification at 9 AM daily if approaching deadline
    const checkForDailyReminder = () => {
      const now = new Date();
      const isReminderTime = now.getHours() === 9 && now.getMinutes() === 0;
      
      if (isReminderTime && timeLeft.days <= 3 && !isPastDeadline && currentUser) {
        sendNotification({
          title: "MoDa Upload Deadline Approaching",
          message: `Only ${timeLeft.days} days left to upload your data to MoDa. Deadline is on the 5th.`,
          type: "warning",
          userId: currentUser.id
        });
      }
    };
    
    const reminderCheck = setInterval(checkForDailyReminder, 60000); // Check every minute
    
    return () => {
      clearInterval(timer);
      clearInterval(reminderCheck);
    };
  }, []); // Empty deps - intervals handle all updates
  
  // Calculate how close we are to the deadline as a percentage
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const today = new Date().getDate();
  
  let urgencyPercentage = 0;
  if (today < targetDay) {
    urgencyPercentage = (today / targetDay) * 100;
  } else {
    // If we're past the deadline in the current month, show 100%
    urgencyPercentage = 100;
  }
  
  // Determine if deadline is approaching (< 2 days)
  const isApproaching = timeLeft.days < 2 && !isPastDeadline;
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className={`h-5 w-5 ${
            isPastDeadline ? 'text-red-500' : 
            isApproaching ? 'text-amber-500' : 'text-emerald-500'
          }`} />
          <span className="font-medium">MoDa Upload Deadline</span>
        </div>
        <Badge variant={isPastDeadline ? "destructive" : isApproaching ? "warning" : "success"}>
          {isPastDeadline ? "Processing Next Month" : isApproaching ? "Approaching" : "On Track"}
        </Badge>
      </div>
      
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="bg-white/70 p-2 rounded-md shadow-sm">
          <div className="text-xl font-bold">{timeLeft.days}</div>
          <div className="text-xs text-slate-600">Days</div>
        </div>
        <div className="bg-white/70 p-2 rounded-md shadow-sm">
          <div className="text-xl font-bold">{timeLeft.hours}</div>
          <div className="text-xs text-slate-600">Hours</div>
        </div>
        <div className="bg-white/70 p-2 rounded-md shadow-sm">
          <div className="text-xl font-bold">{timeLeft.minutes}</div>
          <div className="text-xs text-slate-600">Minutes</div>
        </div>
        <div className="bg-white/70 p-2 rounded-md shadow-sm">
          <div className="text-xl font-bold">{timeLeft.seconds}</div>
          <div className="text-xs text-slate-600">Seconds</div>
        </div>
      </div>
      
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>Urgency</span>
          <span className={`${
            urgencyPercentage > 80 ? 'text-red-600' : 
            urgencyPercentage > 50 ? 'text-amber-600' : 'text-emerald-600'
          }`}>
            {Math.round(urgencyPercentage)}%
          </span>
        </div>
        <Progress 
          value={urgencyPercentage} 
          className="h-2"
          indicatorClassName={`${
            urgencyPercentage > 80 ? 'bg-red-500' : 
            urgencyPercentage > 50 ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
        />
      </div>
      
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <Calendar className="h-3 w-3" />
        <span>
          {isPastDeadline 
            ? `Next deadline: ${targetDay} ${new Date(new Date().setMonth(new Date().getMonth() + 1)).toLocaleString('default', { month: 'long' })}`
            : `Deadline: ${targetDay} ${new Date().toLocaleString('default', { month: 'long' })}`
          }
        </span>
      </div>
      
      {isApproaching && !isPastDeadline && (
        <div className="flex items-center gap-2 text-xs bg-amber-50 p-2 rounded border border-amber-200 text-amber-700">
          <AlertTriangle className="h-3 w-3" />
          <span>Deadline approaching! Complete your uploads soon.</span>
        </div>
      )}
    </div>
  );
};

// Add a default export to resolve the import issue
export default MoDaDeadlineCountdown;
