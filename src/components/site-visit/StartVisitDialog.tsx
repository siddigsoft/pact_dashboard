import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, User, Clock, Play, Car, Navigation, CheckCircle, Calendar } from 'lucide-react';
import { MMPSiteEntry } from '@/types/mmp';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
] as const;

export interface CycleInfo {
  cycleMonth: string;
  cycleStartDate: string;
  cycleEndDate: string;
}

interface StartVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: MMPSiteEntry | null;
  onConfirm: (cycleInfo?: CycleInfo) => Promise<void>;
  isStarting?: boolean;
  currentUser?: any;
}

export const StartVisitDialog: React.FC<StartVisitDialogProps> = ({
  open,
  onOpenChange,
  site,
  onConfirm,
  isStarting = false,
  currentUser
}) => {
  const [cycleMonth, setCycleMonth] = useState<string>('');
  const [cycleStartDate, setCycleStartDate] = useState<string>('');
  const [cycleEndDate, setCycleEndDate] = useState<string>('');

  const isDMActivity = site?.siteActivity?.toLowerCase()?.includes('distribution monitoring') || 
                       site?.siteActivity?.toLowerCase()?.includes('dm') ||
                       site?.activity_at_site?.toLowerCase()?.includes('distribution monitoring') ||
                       site?.activity_at_site?.toLowerCase()?.includes('dm');

  useEffect(() => {
    if (open && isDMActivity) {
      const now = new Date();
      const currentMonthName = MONTHS[now.getMonth()];
      setCycleMonth(currentMonthName);
      
      const year = now.getFullYear();
      const month = now.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      
      setCycleStartDate(firstDay.toISOString().split('T')[0]);
      setCycleEndDate(lastDay.toISOString().split('T')[0]);
    }
  }, [open, isDMActivity]);

  useEffect(() => {
    if (cycleMonth) {
      const monthIndex = MONTHS.indexOf(cycleMonth as typeof MONTHS[number]);
      if (monthIndex !== -1) {
        const currentYear = new Date().getFullYear();
        
        const firstDay = new Date(currentYear, monthIndex, 1);
        const lastDay = new Date(currentYear, monthIndex + 1, 0);
        
        setCycleStartDate(firstDay.toISOString().split('T')[0]);
        setCycleEndDate(lastDay.toISOString().split('T')[0]);
      }
    }
  }, [cycleMonth]);

  const handleStartVisit = async () => {
    if (!site) return;

    try {
      if (isDMActivity && cycleMonth) {
        await onConfirm({
          cycleMonth,
          cycleStartDate,
          cycleEndDate
        });
      } else {
        await onConfirm();
      }
    } catch (error) {
      console.error('Error starting visit:', error);
    }
  };

  if (!site) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-white dark:bg-neutral-900 border-0 shadow-2xl rounded-3xl p-0 max-h-[85vh] overflow-hidden">
        <div className="flex h-[85vh] max-h-[85vh] min-h-0 flex-col">
        {/* Header - Uber style black */}
        <div className="bg-black dark:bg-white px-6 py-5 shrink-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-white dark:text-black">
              <div className="w-10 h-10 rounded-full bg-white dark:bg-black flex items-center justify-center">
                <Car className="h-5 w-5 text-black dark:text-white" />
              </div>
              <span className="text-xl font-bold">Start Site Visit</span>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scroll-container p-6 space-y-5">
          {/* Site Details - Floating Card */}
          <div className="rounded-2xl p-5 shadow-lg bg-gray-50 dark:bg-neutral-800">
            <h3 className="text-xs font-bold text-black/50 dark:text-white/50 uppercase tracking-wider mb-4">
              Site Details
            </h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-black dark:bg-white flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-5 w-5 text-white dark:text-black" />
                </div>
                <div>
                  <p className="text-xs text-black/50 dark:text-white/50 font-medium uppercase">Location</p>
                  <p className="text-base font-semibold text-black dark:text-white">
                    {site.locality || site.state || 'N/A'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-black dark:bg-white flex items-center justify-center flex-shrink-0">
                  <Navigation className="h-5 w-5 text-white dark:text-black" />
                </div>
                <div>
                  <p className="text-xs text-black/50 dark:text-white/50 font-medium uppercase">Site Name</p>
                  <p className="text-base font-semibold text-black dark:text-white">
                    {site.siteName || 'N/A'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-black/50 dark:text-white/50 font-medium uppercase">Site ID:</span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-black text-white dark:bg-white dark:text-black">
                    {site.siteCode || site.id?.slice(0, 8)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-black/50 dark:text-white/50 font-medium uppercase">Status:</span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-black/10 text-black dark:bg-white/10 dark:text-white">
                    {site.status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Enumerator Info */}
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center">
              <User className="h-5 w-5 text-black dark:text-white" />
            </div>
            <div>
              <p className="text-xs text-black/50 dark:text-white/50 font-medium uppercase">Assigned To</p>
              <p className="text-sm font-semibold text-black dark:text-white">
                {currentUser?.full_name || currentUser?.username || currentUser?.email || 'Unknown'}
              </p>
            </div>
          </div>

          {/* Cycle Month Section - Only for DM Activities */}
          {isDMActivity && (
            <div className="rounded-2xl p-5 shadow-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-blue-900 dark:text-blue-100">
                    Cycle Month Information
                  </h3>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Required for Distribution Monitoring visits
                  </p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cycleMonth" className="text-xs font-medium text-blue-800 dark:text-blue-200 uppercase">
                    Cycle Month
                  </Label>
                  <Select value={cycleMonth} onValueChange={setCycleMonth}>
                    <SelectTrigger 
                      id="cycleMonth"
                      className="w-full bg-white dark:bg-neutral-800 border-blue-200 dark:border-blue-700"
                      data-testid="select-cycle-month"
                    >
                      <SelectValue placeholder="Select monitoring cycle month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month) => (
                        <SelectItem key={month} value={month} data-testid={`option-month-${month.toLowerCase()}`}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="cycleStartDate" className="text-xs font-medium text-blue-800 dark:text-blue-200 uppercase">
                      Cycle Start Date
                    </Label>
                    <Input
                      id="cycleStartDate"
                      type="date"
                      value={cycleStartDate}
                      onChange={(e) => setCycleStartDate(e.target.value)}
                      className="bg-white dark:bg-neutral-800 border-blue-200 dark:border-blue-700"
                      data-testid="input-cycle-start-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cycleEndDate" className="text-xs font-medium text-blue-800 dark:text-blue-200 uppercase">
                      Cycle End Date
                    </Label>
                    <Input
                      id="cycleEndDate"
                      type="date"
                      value={cycleEndDate}
                      onChange={(e) => setCycleEndDate(e.target.value)}
                      className="bg-white dark:bg-neutral-800 border-blue-200 dark:border-blue-700"
                      data-testid="input-cycle-end-date"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* What Happens Next - Floating Card */}
          <div className="rounded-2xl p-5 shadow-lg bg-gray-50 dark:bg-neutral-800">
            <h4 className="text-xs font-bold text-black/50 dark:text-white/50 uppercase tracking-wider mb-3">
              What happens next?
            </h4>
            <ul className="space-y-3">
              {[
                'Visit duration will start counting automatically',
                'Location monitoring will begin for accuracy tracking',
                'You can add photos and observations during the visit',
                'Complete the detailed visit report when finished'
              ].map((item, index) => (
                <li key={index} className="flex items-start gap-3 text-sm text-black/70 dark:text-white/70">
                  <CheckCircle className="h-4 w-4 text-black dark:text-white flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer - Action Buttons */}
        <DialogFooter className="p-6 pt-0 gap-3 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isStarting}
            className="flex-1 h-12 rounded-full border-black/20 dark:border-white/20 font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleStartVisit}
            disabled={isStarting}
            className="flex-1 h-12 rounded-full bg-black hover:bg-black/90 dark:bg-white dark:hover:bg-white/90 dark:text-black font-bold gap-2"
          >
            <Play className="h-5 w-5" />
            {isStarting ? 'Starting...' : 'Start Visit'}
          </Button>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
